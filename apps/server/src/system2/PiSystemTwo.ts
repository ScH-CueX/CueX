/**
 * System 2 on Pi Agent (pi-agent-core + pi-ai).
 * One short-lived Agent per request. The agent ends by calling submit_followup, which returns terminate:true,
 * so the happy path is one LLM round trip (inline facts) or two (lookup_facts first).
 */
import { Agent, type AgentEvent, type AgentTool, type ThinkingLevel } from '@earendil-works/pi-agent-core';
import { Type, type Api, type Model } from '@earendil-works/pi-ai';
import type { DoctorLineRequest, FollowupDraft, FollowupPhase, FollowupRequest, SystemTwo } from '../contracts';
import { loadS2Runtime, type S2Runtime } from './config';
import { defaultDoctorStore, type DoctorStore } from './doctors';
import { DoctorLineAgent, type LineMetrics } from './DoctorLineAgent';
import { numbersIn } from './numbers';
import { clampSpoken, stripFiller } from './spoken';
import { buildSystemPrompt, buildUserPrompt, formatFact, searchFacts, type RetrievalMode } from './prompt';
import { abortError, runAgentGuarded } from './run';

export interface PiSystemTwoOptions {
  providerId?: string;
  modelId?: string;
  /** 'inline' puts all facts in the prompt. 'tool' lets the agent call lookup_facts. Default: CUEX_S2_RETRIEVAL or 'inline'. */
  retrieval?: RetrievalMode;
  /** Default 'off'. Clamped to what the model supports. */
  thinkingLevel?: ThinkingLevel;
  /** Inject a ready runtime (tests, bench). Default: loaded from models.json and env. */
  runtime?: S2Runtime;
  /** Hard deadline for one draft. A hung model must not stall the demo. Default: CUEX_S2_TIMEOUT_MS or 10000. */
  timeoutMs?: number;
  /** Where PROFILE.md and MEMORY.md live. Default: apps/server/agents/doctors, or CUEX_AGENTS_DIR. */
  doctors?: DoctorStore;
}

export interface S2Metrics {
  /** Time to the first model token (text, thinking or tool-call argument). */
  ttftMs: number | null;
  /** Time from the call to the finished draft. */
  totalMs: number;
  llmCalls: number;
  toolCalls: string[];
  inputTokens: number;
  outputTokens: number;
  /** False when the spoken text has a number that appears nowhere in the pack, the request or the dialogue. */
  grounded: boolean;
  ungroundedNumbers: string[];
  /** True when the model answered in plain text instead of calling submit_followup. */
  usedTextFallback: boolean;
}

const MAX_SPOKEN_CHARS = 48;

export { clampSpoken };

export function checkGrounding(draftText: string, req: FollowupRequest): string[] {
  const allowed = new Set<string>();
  const sources = [
    ...req.pack.facts.map((f) => `${f.text} ${f.source}`),
    ...req.pack.scenario.concerns.flatMap((c) => c.points.map((p) => `${p.label} ${p.anchorQuestion}`)),
    req.repSpeechSinceConcern,
    req.reason,
    ...req.history.map((h) => h.text),
  ];
  for (const s of sources) for (const n of numbersIn(s)) allowed.add(n);
  return numbersIn(draftText).filter((n) => !allowed.has(n));
}

export class PiSystemTwo implements SystemTwo {
  readonly backend: string;
  private readonly rt: S2Runtime;
  private readonly retrieval: RetrievalMode;
  private readonly thinking: ThinkingLevel;
  private readonly timeoutMs: number;
  private readonly doctors: DoctorStore;
  /** The second worker: writes the doctor's opening, retry and closing lines. It never shares an Agent with prepareFollowup. */
  private readonly lineAgent: DoctorLineAgent;
  /** Metrics of the most recent finished call. */
  lastMetrics: S2Metrics | null = null;

  constructor(opts: PiSystemTwoOptions = {}) {
    this.rt = opts.runtime ?? loadS2Runtime({ providerId: opts.providerId, modelId: opts.modelId });
    this.retrieval = opts.retrieval ?? (process.env.CUEX_S2_RETRIEVAL === 'tool' ? 'tool' : 'inline');
    this.thinking = opts.thinkingLevel ?? 'off';
    const envTimeout = Number(process.env.CUEX_S2_TIMEOUT_MS);
    this.timeoutMs = opts.timeoutMs ?? (Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 10_000);
    this.backend = `${this.rt.backend}:${this.retrieval}`;
    // The constructor runs once per session. Read every doctor's files here so the live loop never touches the disk.
    this.doctors = opts.doctors ?? defaultDoctorStore();
    this.doctors.reload();
    this.lineAgent = new DoctorLineAgent({ runtime: this.rt, doctors: this.doctors, timeoutMs: this.timeoutMs, thinkingLevel: this.thinking });
  }

  /**
   * Writes one spoken doctor line live (opening, retry or closing) on its own Agent, in parallel with follow-up drafting.
   * Rejects with AbortError on cancel. Rejects with another Error when the line is empty, repeats the doctor, mentions an
   * earlier visit or holds a number outside the pack. The Controller then speaks a pack example instead.
   */
  async prepareDoctorLine(req: DoctorLineRequest, onPhase?: (phase: FollowupPhase, partialText?: string) => void): Promise<string> {
    return (await this.lineAgent.write(req, onPhase)).line;
  }

  prepareDoctorLineWithMetrics(req: DoctorLineRequest, onPhase?: (phase: FollowupPhase, partialText?: string) => void): Promise<{ line: string; metrics: LineMetrics }> {
    return this.lineAgent.write(req, onPhase);
  }

  async prepareFollowup(req: FollowupRequest, onPhase?: (phase: FollowupPhase, partialText?: string) => void): Promise<FollowupDraft> {
    return (await this.prepareFollowupWithMetrics(req, onPhase)).draft;
  }

  async prepareFollowupWithMetrics(
    req: FollowupRequest,
    onPhase?: (phase: FollowupPhase, partialText?: string) => void,
  ): Promise<{ draft: FollowupDraft; metrics: S2Metrics }> {
    if (req.signal.aborted) throw abortError();
    const t0 = performance.now();
    const rt = this.rt;
    const mode = this.retrieval;

    let submitted: Record<string, unknown> | null = null;
    const toolCalls: string[] = [];
    let llmCalls = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let ttftMs: number | null = null;
    let phase: FollowupPhase | null = null;
    let lastPartial = '';
    let textFallback = '';

    const emit = (next: FollowupPhase, partial?: string) => {
      if (next === 'retrieving' && phase !== null) return; // never go back
      if (next === 'drafting' && partial === undefined && phase === 'drafting') return;
      phase = next;
      try {
        onPhase?.(next, partial);
      } catch {
        // A faulty listener must not break the draft.
      }
    };

    const pointIds = new Set(req.pack.scenario.concerns.flatMap((c) => c.points.map((p) => p.id)));
    const submitTool: AgentTool<ReturnType<typeof submitSchema>> = {
      name: 'submit_followup',
      label: '提交追问',
      description: '提交医生准备好的那一句追问。只调用一次。',
      parameters: submitSchema(),
      execute: async (_id, params) => {
        submitted = params as Record<string, unknown>;
        return { content: [{ type: 'text', text: 'ok' }], details: {}, terminate: true };
      },
    };
    const lookupTool: AgentTool<ReturnType<typeof lookupSchema>> = {
      name: 'lookup_facts',
      label: '查资料',
      description: '在资料包里按关键词查事实，返回最相关的 3 条。',
      parameters: lookupSchema(),
      execute: async (_id, params) => {
        const hits = searchFacts(req.pack.facts, String((params as { query: string }).query), 3);
        return { content: [{ type: 'text', text: hits.map(formatFact).join('\n') }], details: {} };
      },
    };

    const model: Model<Api> = rt.model;
    const agent = new Agent({
      initialState: {
        systemPrompt: buildSystemPrompt(req.pack, mode, this.doctors.loadDoctor(req.pack.scenario.doctor.id)),
        model,
        thinkingLevel: this.thinking,
        tools: mode === 'tool' ? [lookupTool, submitTool] : [submitTool],
      },
      streamFn: rt.models.streamSimple.bind(rt.models),
      toolExecution: 'sequential',
      identity: { attribution: null },
    });

    agent.subscribe((event: AgentEvent) => {
      switch (event.type) {
        case 'agent_start':
          emit('retrieving');
          break;
        case 'turn_start':
          llmCalls++;
          break;
        case 'message_update': {
          const ev = event.assistantMessageEvent;
          if (ttftMs === null && (ev.type === 'text_delta' || ev.type === 'thinking_delta' || ev.type === 'toolcall_delta')) {
            ttftMs = performance.now() - t0;
          }
          if (ev.type === 'toolcall_delta') {
            const block = ev.partial.content[ev.contentIndex];
            if (block?.type === 'toolCall' && block.name === 'submit_followup') {
              const text = (block.arguments as { text?: unknown }).text;
              if (typeof text === 'string' && text !== lastPartial) {
                lastPartial = text;
                emit('drafting', text);
              }
            }
          } else if (ev.type === 'text_delta') {
            textFallback += ev.delta;
            emit('drafting', textFallback);
          }
          break;
        }
        case 'tool_execution_start':
          toolCalls.push(event.toolName);
          if (event.toolName === 'lookup_facts') emit('retrieving');
          break;
        case 'message_end': {
          const m = event.message;
          if (m.role === 'assistant') {
            inputTokens += m.usage?.input ?? 0;
            outputTokens += m.usage?.output ?? 0;
          }
          break;
        }
      }
    });

    await runAgentGuarded(agent, buildUserPrompt(req, mode), req.signal, this.timeoutMs, rt.backend);

    const last = [...agent.state.messages].reverse().find((m) => m.role === 'assistant');
    if (!submitted && (!last || last.role !== 'assistant' || last.stopReason === 'error')) {
      const msg = last && last.role === 'assistant' ? (last.errorMessage ?? 'unknown error') : 'no response';
      throw new Error(rt.redact(`System 2 request failed (${rt.backend}): ${msg}`));
    }

    const fromText = !submitted;
    const raw: Record<string, unknown> = submitted ?? { text: textFallback };
    const spoken = clampSpoken(stripFiller(String(raw.text ?? '')));
    if (!spoken) throw new Error(`System 2 returned an empty follow-up (${rt.backend})`);

    const factIds = Array.isArray(raw.factIds) ? raw.factIds.map(String) : [];
    const evidence = factIds
      .map((id) => req.pack.facts.find((f) => f.id === id))
      .filter((f): f is NonNullable<typeof f> => !!f)
      .map((f) => f.source);
    const targets = (Array.isArray(raw.targetPointIds) ? raw.targetPointIds.map(String) : []).filter(
      (id) => req.unresolvedPointIds.includes(id) && pointIds.has(id),
    );

    const draft: FollowupDraft = {
      text: spoken,
      basis: String(raw.basis || req.reason),
      triggerCondition: String(raw.triggerCondition || '代表仍未回答这几个要点'),
      targetPointIds: targets.length > 0 ? targets : [...req.unresolvedPointIds],
      sourceEvidence: evidence.length > 0 ? [...new Set(evidence)].join('；') : undefined,
    };

    const ungroundedNumbers = checkGrounding(spoken, req);
    const metrics: S2Metrics = {
      ttftMs,
      totalMs: performance.now() - t0,
      llmCalls,
      toolCalls,
      inputTokens,
      outputTokens,
      grounded: ungroundedNumbers.length === 0,
      ungroundedNumbers,
      usedTextFallback: fromText,
    };
    this.lastMetrics = metrics;
    return { draft, metrics };
  }
}

function submitSchema() {
  return Type.Object({
    text: Type.String({ description: '医生要说的那一句追问，口语化中文，不超过 40 个汉字' }),
    basis: Type.String({ description: '为什么现在要追问，一句话' }),
    triggerCondition: Type.String({ description: '什么情况下仍然要说这句话，一句话' }),
    targetPointIds: Type.Array(Type.String(), { description: '这句追问针对的“尚未回答的要点”编号，例如 c1' }),
    factIds: Type.Array(Type.String(), { description: '依据的资料编号，例如 f-elderly' }),
  });
}

function lookupSchema() {
  return Type.Object({ query: Type.String({ description: '要查的关键词，例如“75岁以上”' }) });
}
