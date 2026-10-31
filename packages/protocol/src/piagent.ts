/**
 * System 2: 基于 PiAgent 基座的深度理解与候选生成协议
 * 特点：异步并行运行，调用专业资料库 Skills，不阻断前台交流，维护候选生命周期
 */

export type CandidateLifecyclePhase =
  | 'idle'         // 无待准备候选
  | 'retrieving'   // 正在检索临床资料包 Skills
  | 'drafting'     // 正在生成候选追问表述
  | 'ready'        // 追问已就绪，保持后台待命，等待时机
  | 'spoken'       // 追问条件成立，已被医生实际说出（写入对话历史）
  | 'withdrawn';   // 追问条件失效，静默撤销（留在时序轨道，绝不写入对话历史）

export interface FollowupCandidate {
  id: string;
  targetConcernId: string;
  phase: CandidateLifecyclePhase;
  
  // 核心内容
  draftText: string;               // 医生拟说出的具体追问发言
  basis: string;                   // 准备这句追问的逻辑依据（如：“代表连续两段未回应高龄与肾功能”）
  sourceEvidence?: string;         // 依据的临床资料来源（如：“ANSHU-3 亚组分析 · 第 14 页”）
  triggerCondition: string;        // 触发条件（如：“关切持续偏离且代表出现短暂停顿”）
  
  // 时间与生命周期打点
  preparedFromMs: number;
  readyAtMs?: number;
  decidedAtMs?: number;
  fate?: 'asked' | 'withdrawn';
}

/** What a System 2 job prepares: a follow-up, or one of the doctor lines written live. */
export type System2Task = 'followup' | 'opening' | 'retry' | 'closing';

export interface PiAgentCandidateUpdate {
  sessionId: string;
  candidate: FollowupCandidate;
  /** Absent means 'followup'. Line jobs never become follow-up candidates in the UI. */
  task?: System2Task;
  memoryUpdateDigest?: string;     // PiAgent 记忆更新摘要
}
