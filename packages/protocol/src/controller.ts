/**
 * Controller 轮次仲裁与动作调度协议
 * 职责：输出前复核（核验候选依据在当前最新情境下是否依然成立），统一指挥 3D 医生与语音输出
 */

// 医生身体姿态枚举（驱动 3D 石膏像）
export type DoctorPoseName = 
  | 'listening'    // 倾听中：身体直立，偶尔微点头
  | 'holding'      // 想插话：身体前倾，微吸气挑眉，背侧朱砂光渐强
  | 'asking'       // 追问中：前倾开口打断，口型与语音同步
  | 'withdrawing'  // 放下追问：呼气后靠，点头微闭，朱砂光消散
  | 'speaking';    // 正常发言轮次

export interface ControllerDispatchEvent {
  sessionId: string;
  timestamp: number;
  
  // 3D 视觉信号
  pose: DoctorPoseName;
  readiness: number;               // 0~1 准备度（0=刚有想法，1=即将开口）
  nodAmp?: number;                 // 点头幅度 (0~0.2)
  lookAt?: { x: number; y: number };// 视线朝向
  
  // 执行动作
  action: {
    type: 'idle' | 'nod' | 'interrupt_speak' | 'withdraw_question';
    textToSpeak?: string;          // 需投递给 TTS 的文本
    candidateId?: string;          // 关联的候选 ID
  };
  
  // 当前主要关切进度
  concernProgress: {
    concernId: string;
    resolvedCount: number;
    totalPoints: number;
    isFullyResolved: boolean;
  };
}
