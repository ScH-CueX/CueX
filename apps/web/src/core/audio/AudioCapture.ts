export interface AudioCaptureCallbacks {
  onAudioChunk?: (base64Pcm: string, timestamp: number) => void;
  onVolumeChange?: (rms: number) => void;
  onError?: (err: Error) => void;
}

/** Mono PCM16LE at 16 kHz. AudioWorklet keeps capture off the UI thread. */
export class AudioCapture {
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: AudioWorkletNode | null = null;
  private generation = 0;

  async start(callbacks: AudioCaptureCallbacks): Promise<boolean> {
    this.stop();
    const generation = this.generation;
    let stream: MediaStream | undefined;
    let ctx: AudioContext | undefined;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('请在 localhost 或 HTTPS 页面使用麦克风。');
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return false; }
      ctx = new AudioContext({ sampleRate: 16000 });
      this.mediaStream = stream;
      this.audioCtx = ctx;
      await ctx.audioWorklet.addModule(new URL('./pcm-capture.worklet.js', import.meta.url));
      if (generation !== this.generation) return false;
      await ctx.resume();
      const processor = new AudioWorkletNode(ctx, 'cuex-pcm-capture');
      this.processor = processor;
      processor.port.onmessage = ({ data }: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
        if (generation !== this.generation) return;
        callbacks.onVolumeChange?.(data.rms);
        const bytes = new Uint8Array(data.pcm);
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        callbacks.onAudioChunk?.(btoa(binary), Date.now());
      };
      ctx.createMediaStreamSource(stream).connect(processor);
      processor.connect(ctx.destination);
      return true;
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (ctx && ctx.state !== 'closed') void ctx.close();
      if (generation === this.generation) {
        this.stop();
        callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
      return false;
    }
  }

  stop(): void {
    this.generation++;
    if (this.processor) {
      this.processor.port.onmessage = null;
      this.processor.disconnect();
      this.processor = null;
    }
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.mediaStream = null;
    if (this.audioCtx && this.audioCtx.state !== 'closed') void this.audioCtx.close();
    this.audioCtx = null;
  }
}
