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
  private lastUsed = 0;

  constructor(private readonly opts: EdgeTtsOptions) {}

  private connect(): Promise<EdgeClient> {
    const { MsEdgeTTS } = createRequire(import.meta.url)('msedge-tts') as {
      MsEdgeTTS: new (o: { connectionTimeoutMs: number; synthesisTimeoutMs: number }) => EdgeClient;
    };
    const client = new MsEdgeTTS({ connectionTimeoutMs: 8000, synthesisTimeoutMs: this.opts.timeoutMs });
    return client.setMetadata(this.opts.voice, FORMAT).then(() => client);
  }

  private async acquire(): Promise<EdgeClient> {
    // The service drops idle sockets after roughly half a minute, and a silent reconnect costs over a second. Reconnect early.
    if (this.client && Date.now() - this.lastUsed > 25_000) this.reset();
    if (!this.ready) {
      this.ready = this.connect().then(
        client => { this.client = client; return client; },
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

  /** Open the connection ahead of the first sentence. */
  async warmup(): Promise<void> {
    await this.acquire();
    this.lastUsed = Date.now();
  }

  async *synthesize(text: string, signal: AbortSignal): AsyncIterable<TtsChunk> {
    signal.throwIfAborted();
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
    this.lastUsed = Date.now();
    if (failure) { this.reset(); throw failure; }
    const audio = Buffer.concat(parts);
    if (sniffAudio(audio) !== 'audio/mpeg') {
      this.reset();
      throw new Error(`Edge TTS returned ${audio.length} bytes that are not MP3 audio`);
    }
    yield { audio, mimeType: 'audio/mpeg' };
  }
}
