/**
 * System 1: Jev 快速结构化判定协议
 * 运行指标：极低延迟（<100ms），高频，小范围，输出严格受控的 TypeSafe 结构
 */

export interface JevDecisionRequest {
  sessionId: string;
  activeConcernId: string;         // 当前医生主要关切 ID
  unresolvedPoints: Array<{        // 尚未覆盖的临床要点
    id: string;
    label: string;
  }>;
  recentSpeechDigest: string;      // 用户最近 3~5 秒说出的文本切片
  dialogueHistoryDigest: string;   // 前序交流浓缩摘要
}

export type JevVerdict = 
  | 'on_topic'         // 切题：正在回应当前关切
  | 'drifting'         // 偏离：转向不相关获益或通用介绍，关切被搁置
  | 'self_correcting'; // 自主补正：代表虽然偏离过，但在被追问前自己转回了关切

export type JevActionProposal =
  | 'listen'             // 继续倾听
  | 'prepare_followup'   // 触发 System 2 开始后台准备候选追问
  | 'trigger_interrupt'  // 建议 Controller 在下个停顿立即开口追问
  | 'withdraw_followup'  // 建议 Controller 撤销已就绪的追问
  | 'resolve_and_move_on'; // 本轮关切已全部解答，推进下一个话题

export interface JevDecisionResponse {
  requestId: string;
  verdict: JevVerdict;
  action: JevActionProposal;
  confidence: number;            // 置信度 (0~1)
  resolvedPointIds: string[];    // 本分片中被判定已回应的要点 ID 集合
  diagnosticReason: string;      // 简短判定理由（用于复盘及技术评审，如：“连续介绍终点，高龄亚组仍未提及”）
  latencyMs: number;             // 本次决策耗时
  timestamp: number;
}
