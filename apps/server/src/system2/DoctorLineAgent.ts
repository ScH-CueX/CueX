/**
 * The second System 2 worker: writes the doctor's own spoken lines (opening, retry, closing).
 * It owns a separate Pi Agent per call, so a line never waits for a follow-up draft and a follow-up never waits for a line.
 * Every line is written live from the persona, the evidence pack and the dialogue. The pack's examples only set the voice.
 */
import { Agent, type AgentEvent, type AgentTool, type ThinkingLevel } from '@earendil-works/pi-agent-core';
import { Type, type Api, type Model } from '@earendil-works/pi-ai';
import type { DialogueTurn, DoctorLineKind, DoctorLineRequest, FollowupPhase, ScenarioPack } from '../contracts';
import type { S2Runtime } from './config';
import { bigramSet, offTargetTerms } from './concernText';
import type { DoctorStore } from './doctors';
import {
  CLOSURE,
  DISMISSIVE,
  EARLIER_VISIT,
  EVALUATIVE,
  MAX_LINE_CHARS,
  NO_SPEECH_YET,
  buildLineSystemPrompt,
  buildLineUserPrompt,
  pickExamples,
} from './linePrompt';
import { numbersIn } from './numbers';
import { abortError, runAgentGuarded } from './run';
import { bigramDice, ensureEnding, stripFiller } from './spoken';

export interface LineMetrics {
  kind: DoctorLineKind;
  ttftMs: number | null;
  totalMs: number;
  chars: number;
  inputTokens: number;
  outputTokens: number;
  /** Numbers in the line that the evidence pack does not contain. A line with any of them is rejected. */
  ungroundedNumbers: string[];
  /** True when the line is close to a pack example. The Controller's fallback already speaks examples, so a copy is a script. */
  copiesExample: boolean;
  usedTextFallback: boolean;
  /** 2 when the first line was rejected and the agent wrote the line again. */
  attempts: number;
  /** Why the first line was rejected, when attempts is 2. */
  redoReason?: string;
}

/** The model wrote something the doctor must not say. The Controller speaks a pack example instead. */
export class LineRejectedError extends Error {
  constructor(readonly reason: string, readonly line: string, backend: string, readonly metrics: LineMetrics) {
    super(`System 2 line rejected: ${reason} (${backend})`);
    this.name = 'LineRejectedError';
  }
}

/** Lines spoken recently, newest last. Shared by every session in the process, so the next visitor hears a new wording. */
export class RecentLines {
  private readonly byKey = new Map<string, string[]>();
  constructor(private readonly max = 6) {}
  get(key: string): string[] {
    return this.byKey.get(key) ?? [];
  }
  add(key: string, line: string): void {
    this.byKey.set(key, [...this.get(key), line].slice(-this.max));
  }
}
const sharedRecent = new RecentLines();

export interface DoctorLineAgentOptions {
  runtime: S2Runtime;
  doctors: DoctorStore;
  timeoutMs: number;
  thinkingLevel?: ThinkingLevel;
  recent?: RecentLines;
  rand?: () => number;
}

/** What the second attempt is told when its predecessor was rejected. Keys are the first words of the rejection reason. */
const REASON_TEXT: Record<string, string> = {
  empty: '没有内容',
  'refers to an earlier visit': '提到了上次，眼前的代表是第一次见你',
  'answers a rep who has not spoken': '代表还没开口，你不能回应他的话',
  'number outside the pack': '出现了资料里没有的数字',
  'repeats an earlier line': '和近来说过的话太像',
  'sends the rep away': '在赶人，要客气一点',
  'starts like an earlier line': '开头和近来说过的话一样，换个开头',
  'asks a new question': '收尾不能再提问',
  'too long': '太长了，缩到三十个字上下',
  'judges the answers': '在评价他答得好不好，收尾时只说他讲到了什么，不评价',
  'talks about another concern': '问的是别的关切，这次只能问指定的那个关切，不要被对话里最近聊的内容带走',
  'does not close the visit': '没有收尾，只是认下了一个要点；要说结束这次门诊的话，比如道谢、说资料怎么处理、说你接下来要做什么',
  'mentions what was never said': '提到了还没聊到、代表也没说过的内容，不要对最后一个关切下结论',
};

/** Start of a line: 3 characters of Chinese, or 6 of a Latin start such as "eGFR". Lines that open the same way sound like one script. */
const leadChars = (line: string): string => {
  const t = line.replace(/[\s，。、；：？！,.;:?!“”"'（）()…]/g, '');
  return /^[A-Za-z]/.test(t) ? t.slice(0, 6) : t.slice(0, 3);
};

/** A line this similar to an earlier one is the same line in the audience's ears. */
const REPEAT_DICE = 0.8;
const COPY_DICE = 0.8;

const packNumberCache = new WeakMap<ScenarioPack, Set<string>>();
/** Numbers the doctor may say: those in the facts, the concern titles and the point labels and questions. Nothing the rep said. */
function packNumbers(pack: ScenarioPack): Set<string> {
  let set = packNumberCache.get(pack);
  if (!set) {
    set = new Set<string>();
    const sources = [
      ...pack.facts.map((f) => `${f.text} ${f.source}`),
      ...pack.scenario.concerns.flatMap((c) => [c.title, ...c.points.map((p) => `${p.label} ${p.anchorQuestion}`)]),
    ];
    for (const s of sources) for (const n of numbersIn(s)) set.add(n);
    packNumberCache.set(pack, set);
  }
  return set;
}

export function ungroundedNumbersIn(line: string, pack: ScenarioPack): string[] {
  const allowed = packNumbers(pack);
  return numbersIn(line).filter((n) => !allowed.has(n));
}

const GENERIC_BIGRAMS = new Set(['患者']);

/**
 * Words of the last concern that nobody has said yet. The closing is written before that concern is answered, so a
 * closing that speaks about it would be inventing what the rep said. Returns the offending character pairs.
 */
export function unsaidLastConcernTerms(line: string, pack: ScenarioPack, history: DialogueTurn[]): string[] {
  const concernText = (c: ScenarioPack['scenario']['concerns'][number]) => [c.title, ...c.points.flatMap((p) => [p.label, p.anchorQuestion])].join('');
  const concerns = pack.scenario.concerns;
  const mine = bigramSet(concernText(concerns[concerns.length - 1]));
  for (const c of concerns.slice(0, -1)) for (const g of bigramSet(concernText(c))) mine.delete(g);
  for (const g of bigramSet(history.map((t) => t.text).join(''))) mine.delete(g);
  for (const g of GENERIC_BIGRAMS) mine.delete(g);
  return [...bigramSet(line)].filter((g) => mine.has(g));
}

/** First non-empty line, without a speaker label or wrapping quotes. */
export function cleanLine(raw: string, doctorName: string): string {
  const first = raw.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const label = new RegExp(`^(?:医生|大夫|主任|${doctorName})\\s*[：:]\\s*`);
  return first
    .replace(label, '')
    .replace(/^[“"「『'‘]+/, '')
    .replace(/[”"」』'’]+$/, '')
    .trim();
}

export class DoctorLineAgent {
  private readonly recent: RecentLines;
  private readonly rand: () => number;

  constructor(private readonly opts: DoctorLineAgentOptions) {
    this.recent = opts.recent ?? sharedRecent;
    this.rand = opts.rand ?? Math.random;
  }

  /**
   * One live line. When the first line breaks a rule (repeat, earlier visit, number outside the pack), the agent writes it
   * once more with the rejected line shown as "do not say this". Only then does the caller fall back to a pack example.
   */
  async write(
    req: DoctorLineRequest,
    onPhase?: (phase: FollowupPhase, partialText?: string) => void,
  ): Promise<{ line: string; metrics: LineMetrics }> {
    if (req.signal.aborted) throw abortError();
    try {
      return await this.attempt(req, onPhase);
    } catch (err) {
      if (!(err instanceof LineRejectedError) || req.signal.aborted) throw err;
      const quiet = (phase: FollowupPhase, partial?: string) => {
        if (phase !== 'retrieving') onPhase?.(phase, partial);
      };
      return this.attempt(req, quiet, { line: err.line, why: REASON_TEXT[err.reason.split(':')[0]] ?? err.reason, reason: err.reason, prior: err.metrics });
    }
  }

  private async attempt(
    req: DoctorLineRequest,
    onPhase?: (phase: FollowupPhase, partialText?: string) => void,
    redo?: { line: string; why: string; reason: string; prior: LineMetrics },
  ): Promise<{ line: string; metrics: LineMetrics }> {
    if (req.signal.aborted) throw abortError();
    const t0 = performance.now();
    const { runtime: rt } = this.opts;
    const pack = req.pack;
    const concerns = pack.scenario.concerns;
    const concern = concerns.find((c) => c.id === req.concernId) ?? (req.kind === 'closing' ? concerns[concerns.length - 1] : concerns[0]);
    const key = `${req.kind}:${concern.id}`;

    const heardDoctor = req.history.filter((t) => t.who === 'doctor').map((t) => t.text).slice(-3);
    // Everything the doctor said lately is checked. Only the newest few are shown to the model, to keep the prompt short.
    const avoid = [...new Set([...this.recent.get(key), ...heardDoctor, ...(redo ? [redo.line] : [])])];
    const recent = avoid.slice(-6);
    // The next visitor should not hear the same lead-in: the previous line of this kind and the doctor's own turns in this visit.
    // A rejected first draft is not in this pool: nobody heard it. The rule only triggers the second try; it never rejects a second
    // try, because falling back to a pack example sounds more scripted than a repeated lead-in.
    const leadPool = [...this.recent.get(key).slice(-1), ...heardDoctor];
    const examples = req.kind === 'retry' ? pack.lineExamples.retry[concern.id] ?? [] : pack.lineExamples[req.kind];
    const allExamples = [...pack.lineExamples.opening, ...Object.values(pack.lineExamples.retry).flat(), ...pack.lineExamples.closing];

    let said: string | null = null;
    let textFallback = '';
    let ttftMs: number | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let phase: FollowupPhase | null = null;
    let lastPartial = '';

    const emit = (next: FollowupPhase, partial?: string) => {
      if (next === 'retrieving' && phase !== null) return;
      if (next === 'drafting' && partial === undefined && phase === 'drafting') return;
      phase = next;
      try {
        onPhase?.(next, partial);
      } catch {
        // A faulty listener must not break the line.
      }
    };

    const sayTool: AgentTool<ReturnType<typeof sayParams>> = {
      name: 'say',
      label: '开口',
      description: '说出这一句话。只调用一次。',
      parameters: sayParams(),
      execute: async (_id, params) => {
        said = String((params as { text?: unknown }).text ?? '');
        return { content: [{ type: 'text', text: 'ok' }], details: {}, terminate: true };
      },
    };

    const model: Model<Api> = rt.model;
    const agent = new Agent({
      initialState: {
        systemPrompt: buildLineSystemPrompt({
          pack,
          record: this.opts.doctors.loadDoctor(pack.scenario.doctor.id),
          kind: req.kind,
          examples: pickExamples(examples, req.kind, this.rand),
          recent,
        }),
        model,
        thinkingLevel: this.opts.thinkingLevel ?? 'off',
        tools: [sayTool],
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
        case 'message_update': {
          const ev = event.assistantMessageEvent;
          if (ttftMs === null && (ev.type === 'text_delta' || ev.type === 'thinking_delta' || ev.type === 'toolcall_delta')) {
            ttftMs = performance.now() - t0;
          }
          if (ev.type === 'toolcall_delta') {
            const block = ev.partial.content[ev.contentIndex];
            if (block?.type === 'toolCall' && block.name === 'say') {
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

    await runAgentGuarded(agent, buildLineUserPrompt({ req, concern, rand: this.rand, redo }), req.signal, this.opts.timeoutMs, rt.backend);

    const last = [...agent.state.messages].reverse().find((m) => m.role === 'assistant');
    if (said === null && (!last || last.role !== 'assistant' || last.stopReason === 'error')) {
      const msg = last && last.role === 'assistant' ? (last.errorMessage ?? 'unknown error') : 'no response';
      throw new Error(rt.redact(`System 2 line request failed (${rt.backend}): ${msg}`));
    }

    const usedTextFallback = said === null;
    // A line that is too long is written again, never cut: a cut sentence sounds broken when it is spoken.
    const cleaned = stripFiller(cleanLine(said ?? textFallback, pack.scenario.doctor.name));
    const tooLong = cleaned.length > MAX_LINE_CHARS + 3;
    const line = ensureEnding(cleaned);
    const ungrounded = line ? ungroundedNumbersIn(line, pack) : [];
    const metrics: LineMetrics = {
      kind: req.kind,
      ttftMs: redo ? (redo.prior.ttftMs ?? ttftMs) : ttftMs,
      totalMs: performance.now() - t0 + (redo?.prior.totalMs ?? 0),
      chars: line.length,
      inputTokens: inputTokens + (redo?.prior.inputTokens ?? 0),
      outputTokens: outputTokens + (redo?.prior.outputTokens ?? 0),
      ungroundedNumbers: ungrounded,
      copiesExample: allExamples.some((e) => bigramDice(e, line) >= COPY_DICE),
      usedTextFallback,
      attempts: redo ? 2 : 1,
      redoReason: redo?.reason,
    };

    const reject = (reason: string) => new LineRejectedError(reason, line, rt.backend, metrics);
    if (!line) throw reject('empty');
    if (tooLong) throw reject('too long');
    if (EARLIER_VISIT.test(line)) throw reject('refers to an earlier visit');
    if (req.kind === 'opening' && NO_SPEECH_YET.test(line)) throw reject('answers a rep who has not spoken');
    if (ungrounded.length > 0) throw reject(`number outside the pack: ${ungrounded.join(',')}`);
    if (req.kind !== 'closing') {
      // Retry and opening lines are about one named concern. A line that follows the last turns of the dialogue is about another.
      const off = offTargetTerms(line, pack, concern.id);
      if (off.length > 0) throw reject(`talks about another concern: ${off.join('')}`);
    }
    if (req.kind === 'closing') {
      if (EVALUATIVE.test(line)) throw reject('judges the answers');
      if (/[？?]/.test(line)) throw reject('asks a new question');
      if (!CLOSURE.test(line)) throw reject('does not close the visit');
      const unsaid = unsaidLastConcernTerms(line, pack, req.history);
      if (unsaid.length > 0) throw reject(`mentions what was never said: ${unsaid.join('')}`);
    }
    if (DISMISSIVE.test(line)) throw reject('sends the rep away');
    if (avoid.some((r) => bigramDice(r, line) >= REPEAT_DICE)) throw reject('repeats an earlier line');
    const lead = leadChars(line);
    if (!redo && lead && leadPool.some((r) => leadChars(r) === lead)) throw reject('starts like an earlier line');

    this.recent.add(key, line);
    return { line, metrics };
  }
}

function sayParams() {
  return Type.Object({ text: Type.String({ description: `医生说的这一句话，口语化中文，最多 ${MAX_LINE_CHARS} 个汉字` }) });
}
