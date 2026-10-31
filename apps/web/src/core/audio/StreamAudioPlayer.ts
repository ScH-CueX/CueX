import type { TtsAudioStreamChunk, TtsPlaybackReport } from '@cuex/protocol';

interface Playback {
  sessionId: string;
  utteranceId: string;
  completedChunks: number;
  playedMs: number;
  ended: boolean;
}
interface QueuedChunk { buffer: AudioBuffer; index: number }
interface PlayerCallbacks {
  onReport: (report: TtsPlaybackReport) => void;
  onPlayingChange?: (playing: boolean) => void;
  onError?: (error: Error) => void;
}

/** Each protocol chunk is an independently decodable audio file. */
export class StreamAudioPlayer {
  private audioCtx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private sourceStartedAt = 0;
  private sourceDuration = 0;
  private queue: QueuedChunk[] = [];
  private playback?: Playback;
  private generation = 0;
  private decoding: Promise<void> = Promise.resolve();
  private reported = new Set<string>();

  constructor(private readonly callbacks: PlayerCallbacks) {}

  /** Call within a click handler so browsers permit subsequent server audio. */
  async unlock(): Promise<void> {
    const ctx = this.context();
    await ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    source.connect(ctx.destination);
    source.start();
  }

  private context(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') this.audioCtx = new AudioContext();
    return this.audioCtx;
  }

  get active(): boolean { return !!this.playback; }

  enqueue(chunk: TtsAudioStreamChunk): void {
    if (this.reported.has(chunk.utteranceId)) return;
    if (this.playback?.utteranceId !== chunk.utteranceId) {
      this.abort();
      this.playback = { sessionId: chunk.sessionId, utteranceId: chunk.utteranceId, completedChunks: 0, playedMs: 0, ended: false };
      this.callbacks.onPlayingChange?.(true);
    }
    const generation = this.generation;
    // Serialize decoding as well as playback. MP3 and WAV decode times can differ.
    this.decoding = this.decoding.then(async () => {
      if (generation !== this.generation) return;
      if (chunk.audioBase64) {
        const bytes = Uint8Array.from(atob(chunk.audioBase64), char => char.charCodeAt(0));
        const buffer = await this.context().decodeAudioData(bytes.buffer);
        if (generation !== this.generation) return;
        this.queue.push({ buffer, index: chunk.chunkIndex });
      }
      if (chunk.isLastChunk && this.playback) this.playback.ended = true;
      this.playNext();
    }).catch(() => {
      if (generation !== this.generation) return;
      this.abort();
      this.callbacks.onError?.(new Error('医生语音播放失败，请重新连接。'));
    });
  }

  private playNext(): void {
    if (this.currentSource || !this.playback) return;
    const next = this.queue.shift();
    if (!next) {
      if (this.playback.ended) this.report('finished');
      return;
    }
    const ctx = this.context();
    const source = ctx.createBufferSource();
    source.buffer = next.buffer;
    source.connect(ctx.destination);
    this.currentSource = source;
    this.sourceStartedAt = ctx.currentTime;
    this.sourceDuration = next.buffer.duration;
    const generation = this.generation;
    source.onended = () => {
      source.disconnect();
      if (generation !== this.generation || !this.playback) return;
      this.playback.completedChunks = next.index + 1;
      this.playback.playedMs += next.buffer.duration * 1000;
      this.currentSource = null;
      this.playNext();
    };
    source.start();
  }

  /** Synchronous stop and report. Call before sending user.interrupted_doctor. */
  abort(utteranceId?: string): void {
    if (utteranceId && this.playback?.utteranceId !== utteranceId) return;
    this.generation++;
    this.decoding = Promise.resolve();
    this.queue = [];
    if (this.currentSource) {
      if (this.playback && this.audioCtx) {
        this.playback.playedMs += Math.max(0, Math.min(this.sourceDuration, this.audioCtx.currentTime - this.sourceStartedAt)) * 1000;
      }
      this.currentSource.onended = null;
      this.currentSource.stop();
      this.currentSource.disconnect();
      this.currentSource = null;
    }
    this.report('stopped');
  }

  private report(status: TtsPlaybackReport['status']): void {
    const playback = this.playback;
    if (!playback) return;
    this.playback = undefined;
    this.reported.add(playback.utteranceId);
    if (this.reported.size > 256) this.reported.delete(this.reported.values().next().value!);
    this.callbacks.onPlayingChange?.(false);
    this.callbacks.onReport({ sessionId: playback.sessionId, utteranceId: playback.utteranceId, completedChunks: playback.completedChunks, playedMs: Math.round(playback.playedMs), status });
  }

  destroy(): void {
    this.abort();
    if (this.audioCtx) void this.audioCtx.close();
    this.audioCtx = null;
  }
}
