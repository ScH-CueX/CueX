import type { FollowupRequest, ScenarioPack } from '../contracts';
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
  doctorOpening: '你说这个研究结果不错。直接说，老人和肾功能不好的，有数据吗？',
};

/** Five situations built from the anshu pack. Each one has a different unresolved set and rep speech. */
export function buildBenchRequests(signal: AbortSignal, pack: ScenarioPack = ANSHU_PACK): FollowupRequest[] {
  const base = { sessionId: 'bench', pack, concernId: 'concern-scope', signal };
  const h = (rep: string) => [
    { who: 'doctor' as const, text: pack.doctorOpening },
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
