import type { ScenarioPack } from '../contracts';
import { ANSHU_ASR_CORRECTIONS } from './asr-corrections';

// Fictional demo pack. It matches apps/web/src/lib/scenario.ts so the live session and the replay tell the same story.
export const ANSHU_PACK: ScenarioPack = {
  asrCorrections: ANSHU_ASR_CORRECTIONS,
  pointRequirements: {
    c1: ['75 岁以上患者在研究中的比例', '该亚组降压结果与总体的关系'],
    c2: ['eGFR 30 到 60 亚组的人数', '该亚组降压结果与总体的关系'],
    c3: ['研究对 eGFR 低于 30 患者的证据边界', '说明书对这类患者的使用建议'],
    d1: ['75 岁以上患者的起始剂量', '后续调整的时间与依据'],
  },
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
    // In the rep's deck order: results first, as reps usually prepare them. The doctor decides in a different order.
    { id: 'f-endpoint', text: '主要终点是 12 周时的诊室收缩压，安舒平组比对照组多降 6.2 mmHg。', source: 'ANSHU-3 主要结果' },
    { id: 'f-safety', text: '不良反应发生率与安慰剂相当。', source: 'ANSHU-3 安全性分析' },
    { id: 'f-rwe', text: '另有一项覆盖两万多名患者的真实世界研究。', source: '安舒平上市后研究摘要' },
    { id: 'f-population', text: 'ANSHU-3 入组 18 到 80 岁的原发性高血压患者。', source: 'ANSHU-3 方案摘要' },
    { id: 'f-elderly', text: '75 岁以上患者约占 11%，降压幅度与总体一致。', source: 'ANSHU-3 亚组分析表，第 14 页' },
    { id: 'f-egfr-30-60', text: 'eGFR 30 到 60 的亚组有 412 人，降压幅度与总体一致。', source: 'ANSHU-3 亚组分析表，第 14 页' },
    { id: 'f-egfr-lt30', text: 'eGFR 低于 30 的患者被排除在研究之外，没有证据，说明书不建议使用。', source: '安舒平说明书，禁忌与慎用' },
    { id: 'f-dose-elderly', text: '常规起始剂量每日 5 mg；75 岁以上患者从每日 2.5 mg 起始，两周后按血压调整。', source: '安舒平说明书，用法用量' },
  ],
  lineExamples: {
    opening: [
      '你说这个研究结果不错。我先问一句：它适用于哪些患者？我门诊里七十五岁以上、肾功能不太好的很多。',
      '结果先放一放。我门诊高龄、肾功能差的病人多，这个研究覆盖到他们了吗？',
      '开始之前，我先说我最在意的：75 岁以上、肾功能不好的患者，你们有数据吗？',
      '我时间不多。直接说，这个药能不能用在高龄和肾功能差的患者身上？',
    ],
    retry: {
      'concern-scope': [
        '我换个问法：七十五岁以上、eGFR 偏低的患者，研究里有没有？结论能不能用在他们身上？',
        '这样问吧：我手上有位高龄、肾功能不好的患者，这个药能不能用？依据是什么？',
        '这样，我把问题拆开：eGFR 30 到 60 的结果怎么样？低于 30 的能不能用？',
        '再确认一下：研究里 75 岁以上占多少，结论对他们成立吗？先答这个。',
      ],
      'concern-dose': [
        '再问一个：高龄患者起始剂量，要不要调整？',
        '还有一个我很在意的：高龄患者起始剂量，说明书怎么建议？',
        '接下来是剂量。75 岁以上的患者，起始剂量要不要和别人不一样？',
        '剂量这块，高龄患者我不敢随便开。起始剂量要调吗？依据是什么？',
      ],
    },
    closing: [
      '好，这几个问题清楚了。资料留下，我回头再看看。',
      '该问的都问了。数据我自己再核一遍，有事我找你。',
      '后面还有病人在等。资料页码你发我一份，我自己对一遍。',
      '好，我心里有数了。资料我先收下，需要再联系你。',
    ],
  },
};
