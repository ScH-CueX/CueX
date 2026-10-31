import type { JevQuestion, ScenarioPack, SystemOneClient, SystemOneResult, SystemOneState } from '../contracts';
import { S1_QUESTION_IDS } from '../contracts';
import { answerFromWeights, labelsFor } from './probabilities';

const normalize = (text: string): string => text.toLowerCase().replace(/七十五/g, '75').replace(/三十/g, '30').replace(/六十/g, '60').replace(/十一/g, '11').replace(/百分之11/g, '11%').replace(/[\s：:]/g, '');
const AGE = /75岁|75周岁|高龄|老年/;
const MID = /(?:egfr|肾小球滤过率)?(?:在)?30(?:到|至|[-–~～])60|中度肾功能|中度肾损/;
const LOW = /(?:egfr|肾小球滤过率)(?:低于|小于|不足|<|＜)30|30(?:以下|以下者)|重度肾功能|严重肾损/;
const DEFERRAL = /(?:以后|下次|稍后|接下来|随后|待会|回头|再来|先不|还没|尚未).{0,8}(?:回答|说明|提供|介绍|讲|说)|(?:还没|尚未|没有)(?:查到|拿到|找到|具体|资料|数据)/;
const TOPIC = /人群|适用|入组|纳入|年龄|肾功能|egfr|亚组|75|高龄|老年|剂量|起始/;
const OFF_TOPIC = /主要终点|收缩压|不良反应|安慰剂|上市后|真实世界|两万|品牌|市场|疗效|安全性|降压|指南推荐/;

function parseState(raw: string): SystemOneState {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.repSpeechSinceConcern === 'string') return parsed;
  } catch { /* Text-only callers use their state as speech. */ }
  const speech = raw.split(/代表(?:发言|讲话|已说|说的话|话语|语音|讲话内容|最近这段话)[：:]/).at(-1) ?? raw;
  return { concernId: '', concern: '适用范围', unresolvedPointIds: [], repSpeechSinceConcern: speech, recentSpeech: speech };
}

/** Deterministic pack-aware fallback. Probabilities are rule weights, not calibrated model confidence. */
export class HeuristicSystemOne implements SystemOneClient {
  readonly backend = 'heuristic';
  constructor(private readonly pack?: ScenarioPack) {}

  async health(): Promise<{ ok: boolean; detail: string }> { return { ok: true, detail: 'Local pack-aware rules' }; }

  async decide(raw: string, questions: Record<string, JevQuestion>, signal?: AbortSignal): Promise<SystemOneResult> {
    signal?.throwIfAborted();
    const start = performance.now();
    const state = parseState(raw);
    const speech = normalize(state.repSpeechSinceConcern);
    const recent = normalize(state.recentSpeech ?? state.repSpeechSinceConcern.slice(-100));
    const scope = this.pack?.scenario.concerns.find(c => c.id === state.concernId);
    const resolved: Record<string, boolean> = {};
    for (const point of scope?.points ?? this.pack?.scenario.concerns.flatMap(c => c.points) ?? []) {
      resolved[point.id] = this.pointResolved(point.id, point.label, speech);
    }
    // The ANSHU IDs are supported even when a caller does not provide the optional pack.
    for (const id of ['c1', 'c2', 'c3', 'd1']) resolved[id] ??= this.pointResolved(id, '', speech);
    const dose = /剂量/.test(state.concern);
    const responding = dose ? /剂量|起始|毫克|mg/.test(recent) : TOPIC.test(recent) || /先回答您|直接回答|回到.{0,6}(?:问题|关切)/.test(recent);
    const drift = !responding && OFF_TOPIC.test(recent);
    const targets = state.candidate?.targetPointIds ?? state.unresolvedPointIds ?? [];
    const candidateValid = targets.length ? !targets.every(id => resolved[id]) : !responding;
    const answers: SystemOneResult['answers'] = {};
    for (const [id, question] of Object.entries(questions)) {
      signal?.throwIfAborted();
      let truth = false;
      // Contract IDs have fixed meanings. Infer from wording only for unknown IDs.
      if (id === S1_QUESTION_IDS.responding) truth = responding;
      else if (id === S1_QUESTION_IDS.drift) truth = drift;
      else if (id === S1_QUESTION_IDS.candidateValid) truth = candidateValid;
      else if (id.startsWith('resolved_')) truth = resolved[id.slice('resolved_'.length)] ?? false;
      else if (/是否.*(?:无关|偏离|跑题)/.test(question.question)) truth = drift;
      else if (/(?:前提|追问条件|触发条件).*是否.*(?:成立|有效|满足)/.test(question.question)) truth = candidateValid;
      else if (/是否.*(?:在回应|正在回应|回应医生|切题)/.test(question.question)) truth = responding;
      else {
        const pointId = /\b([cd]\d)\b/.exec(id + ' ' + question.question)?.[1];
        if (pointId) truth = resolved[pointId] ?? false;
        else if (/75|七十五|高龄/.test(question.question)) truth = resolved.c1;
        else if (/低于|小于|<\s*30/.test(question.question)) truth = resolved.c3;
        else if (/30.*60/.test(question.question)) truth = resolved.c2;
      }
      if (question.kind === 'noul') answers[id] = answerFromWeights(question, truth ? [.05, .95] : [.95, .05]);
      else if (question.kind === 'score') {
        const rating = /偏离|无关/.test(question.question) ? drift ? 5 : 0 : responding ? 5 : drift ? 0 : 2;
        answers[id] = answerFromWeights(question, Array.from({ length: 6 }, (_, i) => i === rating ? .9 : .02));
      } else {
        const labels = labelsFor(question);
        const wanted = labels.findIndex(label => drift ? /追问|偏离|打断|准备/.test(label) : /继续|倾听|回应|切题/.test(label));
        answers[id] = answerFromWeights(question, labels.map((_, i) => i === Math.max(0, wanted) ? .95 : .05 / (labels.length - 1)));
      }
    }
    return { answers, backend: this.backend, latencyMs: performance.now() - start };
  }

  private pointResolved(id: string, label: string, text: string): boolean {
    const clauses = text.split(/[。！？!?；;，,\n]/).filter(Boolean);
    const substantive = (topic: RegExp, evidence: RegExp) => clauses.some(clause => topic.test(clause) && evidence.test(clause) && !DEFERRAL.test(clause));
    if (id === 'c1') return substantive(AGE, /(?:约占|占比|比例|占|共|有)(?:约)?11%|11%|百分之十一|(?:降压幅度|疗效|结果)(?:与|和|跟)总体一致/);
    if (id === 'c2') return substantive(MID, /412|四百一十二|(?:降压幅度|疗效|结果)(?:与|和|跟)总体一致/);
    if (id === 'c3') return clauses.some(clause => LOW.test(clause) && /(?:被)?排除|未(?:被)?(?:入组|纳入)|没有证据|缺乏证据|不建议(?:使用|用药)?|不推荐(?:使用|用药)?|不能(?:使用|用药)|禁用/.test(clause) && !DEFERRAL.test(clause) && !/(?:并未|没有|并没有|不是)(?:被)?排除|没有说.{0,4}不建议|并非.{0,4}禁用/.test(clause));
    if (id === 'd1') return substantive(/剂量|起始|高龄|老年/, /\d+(?:\.\d+)?(?:mg|毫克)|减半|无需调整|需要调整|低剂量起始|没有.{0,4}(?:数据|证据)|资料.{0,4}未提供/);
    const words = normalize(label).split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 1);
    return clauses.some(clause => words.some(word => clause.includes(word)) && /\d|一致|不建议|排除|证据/.test(clause) && !DEFERRAL.test(clause));
  }
}
