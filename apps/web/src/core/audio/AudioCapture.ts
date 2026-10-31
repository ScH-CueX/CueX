/**
 * Web Audio 麦克风录音采集器
 * 16kHz 单声道 PCM 采集与基础音量检测
 */

export interface AudioCaptureCallbacks {
  onAudioChunk?: (base64Pcm: string, timestamp: number) => void;
  onVolumeChange?: (rms: number) => void;
  onError?: (err: Error) => void;
}

export class AudioCapture {
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private isCapturing = false;
  private callbacks: AudioCaptureCallbacks = {};

  async start(callbacks: AudioCaptureCallbacks): Promise<boolean> {
    if (this.isCapturing) return true;
    this.callbacks = callbacks;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });

      const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
      // Buffer size 4096 at 16kHz gives ~256ms chunk
      this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.isCapturing) return;
        const inputData = e.inputBuffer.getChannelData(0);
        
        // 1. RMS Volume Level
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.min(1, Math.sqrt(sum / inputData.length) * 4);
        this.callbacks.onVolumeChange?.(rms);

        // 2. Float32 to 16-bit PCM ArrayBuffer
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // 3. Base64 encode
        const bytes = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        this.callbacks.onAudioChunk?.(base64, Date.now());
      };

      source.connect(this.processor);
      this.processor.connect(this.audioCtx.destination);
      this.isCapturing = true;
      return true;
    } catch (err: any) {
      console.warn('[AudioCapture] Mic access rejected or unavailable:', err);
      this.callbacks.onError?.(err);
      this.stop();
      return false;
    }
  }

  stop(): void {
    this.isCapturing = false;
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}
