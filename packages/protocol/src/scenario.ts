/**
 * 临床资料包、AI 自动情境合成与团队经验沉淀 Schema
 */

export interface ConcernPointDef {
  id: string;
  label: string;
  anchorQuestion: string;
}

export interface ConcernDef {
  id: string;
  title: string;
  anchorSpeaker: 'doctor';
  points: ConcernPointDef[];
  nextConcernId?: string;
}

export interface DoctorProfile {
  id: string;
  name: string;
  department: string;
  title: string;
  style: 'rigorous' | 'impatient' | 'exploratory'; // 严谨型 / 紧迫型 / 探索型
  timeConstraintSec: number;                       // 门诊时间窗口约束（如 60s / 120s）
  skepticismLevel: 'low' | 'medium' | 'high';      // 质疑挑剔倾向
  note: string;
}

// 老资历代表实战经验萃取定义（Expert Experience / Playbook）
export interface ExpertPlaybookRule {
  id: string;
  sourceSeniorRep: string;                         // 贡献经验的资深代表（如：“华东大区 5年销冠 李主管”）
  scenarioContext: string;                         // 适用情境（如：“陈主任在周三上午大门诊，极度反感空谈获益”）
  goldenTactic: string;                            // 黄金应答应变策略（如：“先直给亚组客观数字，绝不强行定论，顺带反问剂量调整”）
  antiPatternWarning: string;                      // 新人最易踩坑误区（如：“被问适用范围时继续背诵主要终点或夸大安全性”）
}

// AI 自动合成的真实拜访剧本
export interface TrainingScenarioDef {
  id: string;
  productName: string;                             // 药物/器械名称（如：“安舒平”）
  packTitle: string;                               // 资料包标题
  studyName: string;                               // 临床研究代号（如：“ANSHU-3”）
  doctor: DoctorProfile;
  sceneTitle: string;
  concerns: ConcernDef[];
  expertRules?: ExpertPlaybookRule[];              // 融合的老资历销冠打法沉淀
  syntheticProvenance?: {                          // AI 合成溯源
    synthesizedAt: string;
    sourceDocument: string;
    model: string;                                 // 合成所用智能体（如 PiAgent）
  };
}

// 演练结束后的智能反馈诊断结构
export interface IntelligentCoachingFeedback {
  sessionId: string;
  overallVerdict: 'mastered' | 'scaffold_needed' | 'interrupted_frequently';
  driftLatencySec: number;                         // 关切搁置时滞（秒）
  recoveryAccuracy: number;                        // 打断恢复准确率 (0~100%)
  complianceCheck: {
    passed: boolean;
    violations: string[];                          // 合规禁忌词触碰（如“eGFR<30使用”）
  };
  seniorRepComparison: {                           // 销冠对照与改进点
    howSeniorRepAnswered: string;
    gapAnalysis: string;
  };
  adaptiveNextTask: {                              // 智能推荐的下一轮变式训练
    nextScenarioId: string;
    adjustedDifficulty: string;
    focusPoint: string;
  };
}

/** One fact from the rep's material pack, with its source. */
export interface BriefingFact {
  id: string;
  text: string;
  source: string;
}

/**
 * GET /briefing: what the rep reads before the visit. It names the doctor but not the doctor's concerns;
 * the profile, memory and concerns stay on the server.
 */
export interface BriefingResponse {
  productName: string;
  packTitle: string;
  studyName: string;
  doctor: Pick<DoctorProfile, 'name' | 'department' | 'title'>;
  facts: BriefingFact[];
}
