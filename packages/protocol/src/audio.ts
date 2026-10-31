/**
 * ASR & TTS 音频管道协议契约
 */

// 麦克风音频分块传输参数
export interface AudioChunkPayload {
  format: 'pcm16' | 'opus';
  sampleRate: number;      // 默认 16000
  channels: number;        // 默认 1 (单声道)
  data: string;            // base64 编码的音频帧
  timestamp: number;       // 毫秒时间戳
}

// ASR 实时语音转写结果
export interface AsrTranscriptDelta {
  sessionId: string;
  transcriptId: string;
  speaker: 'rep' | 'doctor';
  text: string;            // 当前文本
  delta: string;           // 相比上一分片的增量文本
  isFinal: boolean;        // 当前分句是否完结
  confidence: number;
  timeRange: {
    startMs: number;
    endMs: number;
  };
}

// TTS 流式发音音频帧
export interface TtsAudioStreamChunk {
  sessionId: string;
  utteranceId: string;
  chunkIndex: number;
  isLastChunk: boolean;
  audioBase64: string;     // PCM 或 MP3/Opus 分片
  visemes?: Array<{
    timeMs: number;
    mouthOpen: number;     // 0~1 嘴型张合度
    jawDrop: number;       // 0~1 下颌位移
  }>;
}

// 紧急中断/截断信号（当代表反向插话或候选被撤销时立即触发）
export interface TtsAbortSignal {
  sessionId: string;
  utteranceId?: string;
  reason: 'user_interrupted' | 'candidate_withdrawn' | 'turn_switched';
  timestamp: number;
}
