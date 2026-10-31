import { WebSocket } from 'ws';
import type { AsrCallbacks, AsrEngine, AsrStream } from '../contracts';

export interface RemoteAsrOptions {
  url: string;
  connectTimeoutMs: number;
}

interface ServerResult {
  text?: unknown;
  segment?: unknown;
  is_final?: unknown;
}

/** sherpa-onnx servers take 16 kHz float32 little-endian samples as binary frames. */
function floatFrame(pcm16le: Buffer): Buffer {
  const samples = new Float32Array(pcm16le.length >> 1);
  for (let i = 0; i < samples.length; i++) samples[i] = pcm16le.readInt16LE(i * 2) / 32768;
  return Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
}

/**
 * Client for the sherpa-onnx streaming WebSocket servers (python-api-examples/streaming_server.py and the C++
 * sherpa-onnx-online-websocket-server). Protocol: binary float32 frames in, the text message "Done" to finish,
 * JSON {text, segment[, is_final]} out. The Python server has no is_final flag: a sentence ends when `segment` moves on.
 */
class RemoteStream implements AsrStream {
  private ws?: WebSocket;
  private isOpen = false;
  private ended = false;
  private dead = false;
  private retries = 0;
  private pending: Buffer[] = [];
  private segment = -1;
  private text = '';
  private lastPartial = '';
  private closeTimer?: NodeJS.Timeout;

  constructor(private readonly opts: RemoteAsrOptions, private readonly callbacks: AsrCallbacks) {
    this.connect();
  }

  private connect(): void {
    const ws = new WebSocket(this.opts.url, { handshakeTimeout: this.opts.connectTimeoutMs, perMessageDeflate: false });
    this.ws = ws;
    ws.on('open', () => {
      if (ws !== this.ws) return;
      this.isOpen = true;
      for (const frame of this.pending.splice(0)) ws.send(frame);
      if (this.ended) ws.send('Done');
    });
    ws.on('message', (data, isBinary) => {
      if (ws === this.ws && !isBinary) this.onMessage(data.toString());
    });
    ws.on('error', error => this.onLost(ws, error));
    ws.on('close', () => this.onLost(ws));
  }

  private onLost(ws: WebSocket, error?: Error): void {
    if (ws !== this.ws) return;
    this.ws = undefined;
    this.isOpen = false;
    this.finish();
    if (this.ended || this.dead) {
      clearTimeout(this.closeTimer);
      return;
    }
    if (this.retries < 2) {
      this.retries++;
      setTimeout(() => { if (!this.ended && !this.dead) this.connect(); }, 300);
    } else {
      this.dead = true;
      this.callbacks.onError(error ?? new Error('ASR server closed the connection'));
    }
  }

  private onMessage(raw: string): void {
    let message: ServerResult;
    try { message = JSON.parse(raw) as ServerResult; } catch { return; } // "Done!" and other plain text
    if (typeof message.text !== 'string') return;
    const text = message.text.trim();
    const segment = typeof message.segment === 'number' ? message.segment : this.segment;
    if (this.segment >= 0 && segment > this.segment) this.finish(); // the previous sentence ended
    this.segment = segment;
    this.text = text;
    if (message.is_final === true) {
      this.finish();
    } else if (text && text !== this.lastPartial) {
      this.lastPartial = text;
      this.callbacks.onPartial(text);
    }
  }

  private finish(): void {
    const text = this.text;
    this.text = '';
    this.lastPartial = '';
    if (text) this.callbacks.onFinal(text);
  }

  write(pcm16le: Buffer): void {
    if (this.ended || this.dead) return;
    const frame = floatFrame(pcm16le);
    if (this.isOpen && this.ws) {
      this.ws.send(frame);
    } else {
      this.pending.push(frame);
      if (this.pending.length > 40) this.pending.shift(); // about 10 s of audio
    }
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.isOpen && this.ws) this.ws.send('Done');
    // The server answers with the last result and closes. Do not wait for it forever.
    this.closeTimer = setTimeout(() => {
      this.finish();
      this.ws?.terminate();
      this.ws = undefined;
    }, 1500);
    this.closeTimer.unref();
  }
}

export class RemoteSherpaAsr implements AsrEngine {
  readonly backend = 'sherpa-ws';

  constructor(private readonly opts: RemoteAsrOptions) {}

  async open(opts: { sampleRate: number }, callbacks: AsrCallbacks): Promise<AsrStream> {
    if (opts.sampleRate !== 16000) throw new Error(`${this.backend} expects 16 kHz audio, got ${opts.sampleRate}`);
    return new RemoteStream(this.opts, callbacks);
  }

  /** Connect once and close again, to prove the server is reachable. */
  probe(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.opts.url, { handshakeTimeout: this.opts.connectTimeoutMs, perMessageDeflate: false });
      ws.once('open', () => { ws.close(); resolve(); });
      ws.once('error', reject);
    });
  }
}
