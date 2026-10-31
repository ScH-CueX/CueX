import { createRequire } from 'node:module';
import type { TtsChunk, TtsEngine } from '../contracts';
import { sniffAudio } from './wav';

interface EdgeClient {
  setMetadata(voice: string, format: string): Promise<void>;
  toStream(text: string, options?: { rate?: string | number; pitch?: string }): { audioStream: NodeJS.ReadableStream & { destroy(error?: Error): unknown } };
  close(): void;
}

export interface EdgeTtsOptions {
  voice: string;
  rate: string;
  pitch: string;
  timeoutMs: number;
}

const FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const REFRESH_AFTER_MS = 18_000; // swap the socket after this much idle time
const STALE_AFTER_MS = 30_000; // never trust a socket that has been idle this long
const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Microsoft Edge read-aloud voices through msedge-tts. This is an unofficial online endpoint:
 * fine for a demo, and the caller keeps a fallback for when it fails.
 * Each call yields one complete MP3 for the whole text, so the browser can decode it on its own.
 */
export class EdgeTts implements TtsEngine {
  readonly backend = 'edge-tts';
  private client?: EdgeClient;
  private ready?: Promise<EdgeClient>;
  private lastActivity = 0;
  private busy = 0;
  private keepAlive?: NodeJS.Timeout;

  constructor(private readonly opts: EdgeTtsOptions) {}

  private connect(): Promise<EdgeClient> {
    const { MsEdgeTTS } = createRequire(import.meta.url)('msedge-tts') as {
      MsEdgeTTS: new (o: { connectionTimeoutMs: number; synthesisTimeoutMs: number }) => EdgeClient;
    };
    const client = new MsEdgeTTS({ connectionTimeoutMs: 8000, synthesisTimeoutMs: this.opts.timeoutMs });
    return client.setMetadata(this.opts.voice, FORMAT).then(() => client);
  }

  /**
   * The service drops an idle socket after roughly 30 s, and the first sentence after that pays 1.3 to 1.6 s for the silent reconnect.
   * A follow-up usually comes after the rep has talked for a while, so swap in a fresh socket in the background while nobody is speaking.
   */
  private startKeepAlive(): void {
    if (this.keepAlive) return;
    this.keepAlive = setInterval(() => {
      if (this.busy === 0 && this.client && Date.now() - this.lastActivity > REFRESH_AFTER_MS) {
        this.reset();
        this.acquire().catch(() => { /* the next synthesize() reports the failure */ });
      }
    }, 4000);
    this.keepAlive.unref();
  }

  private async acquire(): Promise<EdgeClient> {
    this.startKeepAlive();
    if (this.client && Date.now() - this.lastActivity > STALE_AFTER_MS) this.reset();
    if (!this.ready) {
      this.ready = this.connect().then(
        client => { this.client = client; this.lastActivity = Date.now(); return client; },
        error => { this.ready = undefined; throw error; },
      );
    }
    return this.ready;
  }

  private reset(): void {
    const old = this.client;
    this.client = undefined;
    this.ready = undefined;
    try { old?.close(); } catch { /* already closed */ }
  }

  /** Close the connection. A later synthesize() reconnects. */
  close(): void {
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = undefined;
    this.reset();
  }

  /** Open the connection ahead of the first sentence. */
  async warmup(): Promise<void> {
    await this.acquire();
  }

  async *synthesize(text: string, signal: AbortSignal): AsyncIterable<TtsChunk> {
    signal.throwIfAborted();
    this.busy++;
    try {
      const client = await this.acquire();
      if (signal.aborted) return;
      const { audioStream } = client.toStream(escapeXml(text), { rate: this.opts.rate, pitch: this.opts.pitch });
      const parts: Buffer[] = [];
      let failure: Error | undefined;
      const done = new Promise<void>(resolve => {
        audioStream.on('data', (part: Buffer) => parts.push(part));
        audioStream.on('error', (error: Error) => { failure = error; resolve(); });
        audioStream.on('close', () => resolve());
        audioStream.on('end', () => resolve());
      });
      const onAbort = () => audioStream.destroy();
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        await done;
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
      if (signal.aborted) return;
      this.lastActivity = Date.now();
      if (failure) { this.reset(); throw failure; }
      const audio = Buffer.concat(parts);
      if (sniffAudio(audio) !== 'audio/mpeg') {
        this.reset();
        throw new Error(`Edge TTS returned ${audio.length} bytes that are not MP3 audio`);
      }
      yield { audio, mimeType: 'audio/mpeg' };
    } finally {
      this.busy--;
    }
  }
}
