import { setTimeout as delay } from 'node:timers/promises';
import type {
  AsrCallbacks, AsrEngine, AsrStream, DoctorLineRequest, FollowupDraft, FollowupPhase, FollowupRequest,
  JevAnswer, JevQuestion, SystemOneClient, SystemOneResult, SystemOneState, SystemTwo, TtsEngine,
} from '../contracts';

/** Deterministic demo engine. Each answer uses the same structured state as the real engine. */
export class FakeSystemOne implements SystemOneClient {
  readonly backend = 'fake-keywords';
  async health() { return { ok: true }; }

  async decide(encoded: string, questions: Record<string, JevQuestion>, signal?: AbortSignal): Promise<SystemOneResult> {
    signal?.throwIfAborted();
    const start = performance.now();
    const state = JSON.parse(encoded) as SystemOneState;
    const all = state.repSpeechSinceConcern.replace(/\s/g, '');
    const recent = (state.recentSpeech ?? state.repSpeechSinceConcern).replace(/\s/g, '');
    const answers: Record<string, JevAnswer> = {};
    const resolved: Record<string, boolean> = {
      c1: /(?:75|七十五|高龄).{0,20}(?:11[%％]|百分之十一|占.{0,4}一成)/i.test(all),
      c2: /(?:eGFR|肾功能).{0,12}30.{0,8}60.{0,30}(?:412|四百一十二|一致)/i.test(all),
      c3: /(?:eGFR|肾功能).{0,10}(?:低于|小于|<)30.{0,35}(?:排除|没有证据|不建议|禁用|不推荐)/i.test(all),
      d1: /起始剂量.{0,20}(?:调整|减半|毫克|mg|说明书)/i.test(all),
    };
    const responding = /(?:先|直接|正在|马上|回到|具体).{0,8}(?:回答|回应|说明|人群|肾功能)/.test(recent)
      || /(?:75|七十五|高龄|eGFR|肾功能|入组|18.{0,5}80|起始剂量)/i.test(recent);
    const drift = !responding && /主要终点|收缩压|6\.2|不良反应|安慰剂|真实世界|上市后|华东|两万/.test(recent);
    for (const [id, question] of Object.entries(questions)) {
      const truth = id === 'responding' ? responding : id === 'drift' ? drift
        : id === 'candidateValid' ? !responding && !!state.candidate?.targetPointIds.some(p => !resolved[p])
          : id.startsWith('resolved_') ? !!resolved[id.slice(9)] : false;
      const p = truth ? 0.99 : 0.01;
      if (question.kind === 'noul') answers[id] = { kind: 'noul', probabilities: { false: 1 - p, true: p }, value: p, top: truth ? 'true' : 'false' };
      else if (question.kind === 'choice') {
        const top = question.options[0];
        answers[id] = { kind: 'choice', probabilities: Object.fromEntries(question.options.map((option, i) => [option, i === 0 ? 1 : 0])), value: 1, top };
      } else answers[id] = { kind: 'score', probabilities: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 1 }, value: 5, top: '5' };
    }
    return { answers, latencyMs: performance.now() - start, backend: this.backend };
  }
}

export class FakeSystemTwo implements SystemTwo {
  readonly backend = 'fake-delayed';
  private lineNumber = 0;
  constructor(private delayMs = 250, private lineDelayMs = 0) {}

  async prepareDoctorLine(req: DoctorLineRequest, onPhase?: (phase: FollowupPhase, partialText?: string) => void): Promise<string> {
    req.signal.throwIfAborted();
    onPhase?.('drafting');
    if (this.lineDelayMs) await delay(this.lineDelayMs, undefined, { signal: req.signal });
    const examples = req.kind === 'retry' ? req.pack.lineExamples.retry[req.concernId ?? ''] ?? req.pack.lineExamples.opening : req.pack.lineExamples[req.kind];
    const variation = this.lineNumber++ % 2 === 0 ? '我们就说具体患者。' : '这次先把范围说清楚。';
    return `${examples[0]}${variation}`;
  }

  async prepareFollowup(req: FollowupRequest, onPhase?: (phase: FollowupPhase, partialText?: string) => void): Promise<FollowupDraft> {
    req.signal.throwIfAborted();
    onPhase?.('retrieving');
    await delay(this.delayMs / 2, undefined, { signal: req.signal });
    onPhase?.('drafting');
    await delay(this.delayMs / 2, undefined, { signal: req.signal });
    const onlyC3 = req.unresolvedPointIds.length === 1 && req.unresolvedPointIds[0] === 'c3';
    const concern = req.pack.scenario.concerns.find(c => c.id === req.concernId)!;
    return {
      text: onlyC3 ? '那 eGFR 低于 30 的患者呢？这部分能用吗？'
        : req.concernId === 'concern-scope' ? '先停一下。高龄和肾功能不好的患者，研究结论适用吗？'
          : concern.points.find(p => req.unresolvedPointIds.includes(p.id))!.anchorQuestion,
      basis: req.reason,
      triggerCondition: '目标要点仍未回答，且代表继续介绍其他结果',
      targetPointIds: [...req.unresolvedPointIds],
      sourceEvidence: req.pack.facts.map(f => f.source).slice(0, 3).join('；'),
    };
  }
}

/** In fake mode text goes through speech.delta; PCM is deliberately not decoded as text. */
export class TextOnlyAsr implements AsrEngine {
  readonly backend = 'text-only';
  async open(_opts: { sampleRate: number }, _callbacks: AsrCallbacks): Promise<AsrStream> {
    return { write() {}, end() {} };
  }
}

/** Valid independently decodable WAV, so fake mode also exercises the browser audio path. */
export class SilentTts implements TtsEngine {
  readonly backend = 'silent-wav';
  async *synthesize(_text: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const bytes = 320;
    const audio = Buffer.alloc(44 + bytes);
    audio.write('RIFF', 0); audio.writeUInt32LE(36 + bytes, 4); audio.write('WAVEfmt ', 8);
    audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
    audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
    audio.write('data', 36); audio.writeUInt32LE(bytes, 40);
    yield { audio, mimeType: 'audio/wav' };
  }
}
