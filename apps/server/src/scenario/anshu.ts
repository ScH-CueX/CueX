import type { ScenarioPack } from '../contracts';
import { ANSHU_ASR_CORRECTIONS } from './asr-corrections';

// Fictional demo pack. It matches apps/web/src/lib/scenario.ts so the live session and the replay tell the same story.
export const ANSHU_PACK: ScenarioPack = {
  asrCorrections: ANSHU_ASR_CORRECTIONS,
  scenario: {
    id: 'anshu-hypertension-01',
    productName: '安舒平',
    packTitle: '安舒平降压适应证资料包',
    studyName: 'ANSHU-3 研究（虚构）',
    doctor: {
      id: 'dr-chen',
      name: '陈主任',
      department: '心内科',
      title: '主任医师',
      style: 'rigorous',
      timeConstraintSec: 120,
      skepticismLevel: 'medium',
      note: '门诊里 75 岁以上、肾功能不好的患者很多，最关心结论能不能用在这些人身上。',
    },
    sceneTitle: '门诊拜访：适用范围',
    concerns: [
      {
        id: 'concern-scope',
        title: '适用范围',
        anchorSpeaker: 'doctor',
        points: [
          { id: 'c1', label: '75 岁以上患者', anchorQuestion: '75 岁以上的患者研究里有多少？结论适用吗？' },
          { id: 'c2', label: 'eGFR 30–60', anchorQuestion: 'eGFR 30 到 60 的患者结果怎么样？' },
          { id: 'c3', label: 'eGFR 低于 30', anchorQuestion: 'eGFR 低于 30 的患者能用吗？' },
        ],
        nextConcernId: 'concern-dose',
      },
      {
        id: 'concern-dose',
        title: '高龄起始剂量',
        anchorSpeaker: 'doctor',
        points: [{ id: 'd1', label: '高龄起始剂量', anchorQuestion: '那高龄患者的起始剂量要调整吗？' }],
      },
    ],
  },
  facts: [
    { id: 'f-population', text: 'ANSHU-3 入组 18 到 80 岁的原发性高血压患者。', source: 'ANSHU-3 方案摘要' },
    { id: 'f-endpoint', text: '主要终点是 12 周时的诊室收缩压，安舒平组比对照组多降 6.2 mmHg。', source: 'ANSHU-3 主要结果' },
    { id: 'f-safety', text: '不良反应发生率与安慰剂相当。', source: 'ANSHU-3 安全性分析' },
    { id: 'f-elderly', text: '75 岁以上患者约占 11%，降压幅度与总体一致。', source: 'ANSHU-3 亚组分析表，第 14 页' },
    { id: 'f-egfr-30-60', text: 'eGFR 30 到 60 的亚组有 412 人，降压幅度与总体一致。', source: 'ANSHU-3 亚组分析表，第 14 页' },
    { id: 'f-egfr-lt30', text: 'eGFR 低于 30 的患者被排除在研究之外，没有证据，说明书不建议使用。', source: '安舒平说明书，禁忌与慎用' },
    { id: 'f-rwe', text: '另有一项覆盖两万多名患者的真实世界研究。', source: '安舒平上市后研究摘要' },
  ],
  lineExamples: {
    opening: [
      '你说这个研究结果不错。我先问一句：它适用于哪些患者？我门诊里七十五岁以上、肾功能不太好的很多。',
      '结果先放一放。我门诊高龄、肾功能差的病人多，这个研究覆盖到他们了吗？',
    ],
    retry: {
      'concern-scope': ['我换个问法：七十五岁以上、eGFR 偏低的患者，研究里有没有？结论能不能用在他们身上？'],
      'concern-dose': ['我再问一次：高龄患者开始用的时候，剂量要不要调？'],
    },
    closing: ['好，这几个问题清楚了。资料留下，我回头再看看。'],
  },
};
