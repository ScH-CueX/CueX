/**
 * 流式 TTS 音频播放器
 * 支持音频帧队列与毫秒级即时截断（Abort）
 */

export class StreamAudioPlayer {
  private audioCtx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private isPlaying = false;
  private queue: AudioBuffer[] = [];

  constructor() {
    // Lazy AudioContext initialization on first user gesture
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  async playChunk(base64Audio: string): Promise<void> {
    const ctx = this.ensureAudioContext();
    try {
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
      this.queue.push(audioBuffer);
      if (!this.isPlaying) {
        this.playNext();
      }
    } catch (e) {
      console.warn('[StreamAudioPlayer] Failed to decode audio chunk:', e);
    }
  }

  private playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.currentSource = null;
      return;
    }

    const ctx = this.ensureAudioContext();
    const buffer = this.queue.shift()!;
    this.isPlaying = true;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      this.playNext();
    };

    this.currentSource = source;
    source.start(0);
  }

  /**
   * 立即截断/中止发音（当发生打断或候选撤销时）
   */
  abort(): void {
    this.queue = [];
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch (e) {
        // already stopped
      }
      this.currentSource = null;
    }
    this.isPlaying = false;
  }

  destroy(): void {
    this.abort();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}
