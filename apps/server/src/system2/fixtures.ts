import type { DialogueTurn, DoctorLineKind, DoctorLineRequest, FollowupRequest, ScenarioPack } from '../contracts';
import { ANSHU_PACK } from '../scenario/anshu';

/** Same pack and facts as anshu, but the doctor is 李医生 (profile in agents/doctors/dr-li). Used to show that the profile changes the follow-up. */
export const LI_PACK: ScenarioPack = {
  ...ANSHU_PACK,
  scenario: {
    ...ANSHU_PACK.scenario,
    doctor: {
      id: 'dr-li', name: '李医生', department: '心内科', title: '主治医师', style: 'impatient',
      timeConstraintSec: 45, skepticismLevel: 'medium', note: '下午门诊量大，只要数字。',
    },
  },
  lineExamples: {
    opening: ['你说这个研究结果不错。直接说，老人和肾功能不好的，有数据吗？'],
    retry: { 'concern-scope': ['再说一遍，老人和肾功能不好的，到底有没有数？'], 'concern-dose': ['高龄起始剂量，要不要调？'] },
    closing: ['行，我知道了，资料放这儿。'],
  },
};

/** Five situations built from the anshu pack. Each one has a different unresolved set and rep speech. */
export function buildBenchRequests(signal: AbortSignal, pack: ScenarioPack = ANSHU_PACK): FollowupRequest[] {
  const base = { sessionId: 'bench', pack, concernId: 'concern-scope', signal };
  const h = (rep: string) => [
    { who: 'doctor' as const, text: pack.lineExamples.opening[0] },
    { who: 'rep' as const, text: rep },
  ];
  return [
    { ...base, unresolvedPointIds: ['c1', 'c2', 'c3'], history: h(`好的${pack.scenario.doctor.name}，我先讲一下这个研究。`),
      repSpeechSinceConcern: '安舒平的主要终点是12周诊室收缩压，比对照组多降了6.2毫米汞柱，安全性和安慰剂相当。',
      reason: '转向主要终点，高龄与肾功能都还没有提到' },
    { ...base, unresolvedPointIds: ['c2', 'c3'], history: h('这个研究降压效果很明确。'),
      repSpeechSinceConcern: '75岁以上的患者大约占11%，降压幅度和总体一致。接下来说一下依从性。',
      reason: '高龄已回答，肾功能两个要点还没有提到' },
    { ...base, unresolvedPointIds: ['c3'], history: h('我们看一下亚组。'),
      repSpeechSinceConcern: 'eGFR 30到60的亚组有412人，降压幅度和总体一致，耐受性也不错。',
      reason: '中度肾功能已回答，eGFR 低于 30 还没有提到' },
    { ...base, unresolvedPointIds: ['c1', 'c2', 'c3'], history: h('是的，数据都在资料里。'),
      repSpeechSinceConcern: '另外我们还有一项覆盖两万多名患者的真实世界研究，样本量非常大，结果很扎实。',
      reason: '转向真实世界研究，仍没有回答适用范围' },
    { ...base, unresolvedPointIds: ['c1', 'c3'], history: h('明白，我补充一下。'),
      repSpeechSinceConcern: '说明书里对肾功能是有相关说明的，整体安全性可以放心。',
      reason: '回答含糊，高龄与重度肾功能仍没有具体数据' },
  ];
}

const doc = (text: string): DialogueTurn => ({ who: 'doctor', text });
const rep = (text: string): DialogueTurn => ({ who: 'rep', text });

/**
 * Situations for the doctor-line agent.
 * opening: the rep has not spoken. retry: the previous attempt, with different points missed.
 * closing: the whole visit, with different things said by the rep.
 */
export function buildLineRequests(signal: AbortSignal, kind: DoctorLineKind, pack: ScenarioPack = ANSHU_PACK): DoctorLineRequest[] {
  const base = { sessionId: 'bench', pack, signal };
  const asked = pack.lineExamples.opening[1] ?? pack.lineExamples.opening[0];
  const doseAsk = pack.lineExamples.retry['concern-dose']?.[0] ?? '高龄患者起始剂量，要不要调？';
  if (kind === 'opening') {
    return Array.from({ length: 5 }, () => ({ ...base, kind, concernId: 'concern-scope', history: [] }));
  }
  if (kind === 'retry') {
    const scope = { ...base, kind, concernId: 'concern-scope' };
    return [
      { ...scope, missedPointIds: ['c1', 'c2', 'c3'],
        history: [doc(asked), rep('这项研究入组 18 到 80 岁的原发性高血压患者，主要终点是 12 周诊室收缩压，比对照组多降了 6.2 mmHg，不良反应和安慰剂相当。')] },
      { ...scope, missedPointIds: ['c2', 'c3'],
        history: [doc(asked), rep('75 岁以上的患者约占 11%，降压幅度和总体一致。接下来我说一下依从性。')] },
      { ...scope, missedPointIds: ['c3'],
        history: [doc(asked), rep('eGFR 30 到 60 的亚组有 412 人，降压幅度和总体一致。另外我们还有一项覆盖两万多名患者的真实世界研究。')] },
      { ...scope, missedPointIds: ['c1', 'c3'],
        history: [doc(asked), rep('这个药整体安全性很好，说明书里对肾功能有说明，很多医院都在用。')] },
      { ...base, kind, concernId: 'concern-dose', missedPointIds: ['d1'],
        history: [doc(doseAsk), rep('这个药一天吃一次，患者用起来很方便，依从性也很好。')] },
      // The rep retries the first concern, but the previous visit ended on the dose concern: the history ends with dose. The line must stay on scope.
      { ...scope, missedPointIds: ['c3'],
        history: [doc(asked), rep('75 岁以上的患者约占 11%，eGFR 30 到 60 的亚组有 412 人，结果和总体一致。'), doc(doseAsk), rep('起始剂量请按说明书来，高龄患者从低剂量开始。')] },
      { ...scope, missedPointIds: [],
        history: [doc(asked), rep('75 岁以上约占 11%，eGFR 30 到 60 有 412 人，低于 30 的被排除，没有证据，说明书不建议使用。'), doc(doseAsk), rep('高龄起始剂量说明书里有写，我回去确认页码。')] },
      // The rep just finished the first concern and the doctor moves on (no missed points). Every visit that resolves scope hits this.
      { ...base, kind, concernId: 'concern-dose',
        history: [doc(asked), rep('75 岁以上的患者约占 11%，eGFR 30 到 60 的亚组有 412 人，降压幅度都和总体一致。eGFR 低于 30 的患者被排除在研究之外，没有证据，说明书不建议使用。')] },
      { ...base, kind, concernId: 'concern-dose',
        history: [doc(asked), rep('高龄的占 11%，肾功能 30 到 60 的有 412 人，结果和总体一致。低于 30 的没有数据，我们不推荐。')] },
    ];
  }
  const all = { ...base, kind, concernId: 'concern-dose' };
  return [
    // Written ahead of time, when the last concern starts: the dialogue stops before the rep has answered it. This is what the Controller really prefetches.
    { ...all, history: [doc(asked), rep('75 岁以上的患者约占 11%，eGFR 30 到 60 的亚组有 412 人，降压幅度都和总体一致。eGFR 低于 30 的患者被排除在研究之外，没有证据，说明书不建议使用。')] },
    { ...all, history: [doc(asked), rep('这一块我直说：eGFR 低于 30 的患者没有证据，我不乱讲。75 岁以上大约占 11%。')] },
    // The whole visit, for a closing written after the last answer.
    { ...all, history: [doc(asked), rep('75 岁以上的患者约占 11%，eGFR 30 到 60 的亚组有 412 人，降压幅度都和总体一致。eGFR 低于 30 的患者被排除在研究之外，没有证据，说明书不建议使用。'),
      doc(doseAsk), rep('起始剂量请按说明书来，高龄患者从低剂量开始。')] },
    { ...all, history: [doc(asked), rep('这一块我直说：eGFR 低于 30 的患者没有证据，我不乱讲。75 岁以上大约占 11%。'),
      doc(doseAsk), rep('剂量这块说明书有写，我回去把原文页码发给您。')] },
    { ...all, history: [doc(asked), rep('eGFR 30 到 60 有 412 人，结果和总体一致，低于 30 的不建议用。'),
      doc(doseAsk), rep('高龄起始剂量我需要再确认一下，下次给您准确答复。')] },
  ];
}
