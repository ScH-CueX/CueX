/**
 * Voice engines for the real (non-fake) mode. config.ts imports createAsrEngine, createTtsEngine and warmupVoice from here.
 *
 * ASR, first match wins:
 *   CUEX_ASR_URL        ws://host:port of a sherpa-onnx streaming WebSocket server (the Windows box or any remote host)
 *   CUEX_ASR_MODEL_DIR  directory of a streaming transducer model, run in this process with sherpa-onnx-node
 *   neither             text-only: the browser sends speech.delta text and audio.chunk gets a clear error
 * TTS defaults to the Windows Ming HTTP service, with no provider fallback.
 *   CUEX_TTS_BACKEND=edge|http|sherpa explicitly picks another provider when needed
 *   CUEX_TTS_FALLBACK=auto explicitly enables the legacy fallback chain
 *   edge    Edge read-aloud voices over the internet (CUEX_EDGE_VOICE, CUEX_EDGE_RATE, CUEX_EDGE_PITCH)
 *   http    CUEX_TTS_URL, POST {"text"} returns one audio file
 *   sherpa  CUEX_TTS_MODEL_DIR, VITS model in this process
 */
import type { AsrCallbacks, AsrEngine, AsrStream, TtsChunk, TtsEngine } from '../contracts';
import { LocalSherpaAsr } from './asr-local';
import { RemoteSherpaAsr } from './asr-remote';
import { EdgeTts } from './tts-edge';
import { HttpTts } from './tts-http';
import { LocalSherpaTts } from './tts-local';

export const DEFAULT_EDGE_VOICE = 'zh-CN-YunyangNeural';

type Source = NodeJS.ProcessEnv;
const reader = (source: Source) => {
  const env = (key: string): string | undefined => source[key]?.trim() || undefined;
  const num = (key: string, fallback: number): number => {
    const value = env(key);
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${key} must be a number, got "${value}"`);
    return parsed;
  };
  return { env, num };
};
const log = (message: string) => console.log(`[voice] ${message}`);

/** The browser sends text (speech.delta) instead of audio. The gateway refuses audio.chunk for this backend. */
class TextOnlyAsr implements AsrEngine {
  readonly backend = 'text-only';
  async open(_opts: { sampleRate: number }, _callbacks: AsrCallbacks): Promise<AsrStream> {
    return { write() {}, end() {} };
  }
}

/** Runs the engines in order. A failure before the first chunk moves on to the next engine. */
class FallbackTts implements TtsEngine {
  constructor(private readonly engines: TtsEngine[]) {}
  get backend(): string { return this.engines.map(e => e.backend).join('>'); }

  close(): void {
    for (const engine of this.engines) (engine as { close?: () => void }).close?.();
  }

  async *synthesize(text: string, signal: AbortSignal): AsyncIterable<TtsChunk> {
    let lastError: unknown;
    for (const engine of this.engines) {
      if (signal.aborted) return;
      try {
        for await (const chunk of engine.synthesize(text, signal)) yield chunk;
        return;
      } catch (error) {
        if (signal.aborted) return;
        lastError = error;
        log(`${engine.backend} failed (${(error as Error).message}); trying the next TTS engine`);
      }
    }
    throw lastError ?? new Error('No TTS engine is configured');
  }
}

let asr: AsrEngine | undefined;
let tts: TtsEngine | undefined;
let edge: EdgeTts | undefined;

/** With no argument the engine is built from process.env once and shared. An explicit env object builds a fresh engine. */
export function createAsrEngine(source: Source = process.env): AsrEngine {
  const shared = source === process.env;
  if (shared && asr) return asr;
  const { env, num } = reader(source);
  const url = env('CUEX_ASR_URL');
  const modelDir = env('CUEX_ASR_MODEL_DIR');
  let engine: AsrEngine;
  if (url) {
    engine = new RemoteSherpaAsr({ url, connectTimeoutMs: num('CUEX_ASR_CONNECT_TIMEOUT_MS', 4000) });
  } else if (modelDir) {
    engine = new LocalSherpaAsr({
      modelDir,
      threads: num('CUEX_ASR_THREADS', 2),
      provider: env('CUEX_ASR_PROVIDER') ?? 'cpu',
      endpointSilenceSec: num('CUEX_ASR_ENDPOINT_SILENCE', 0.7),
      maxUtteranceSec: num('CUEX_ASR_MAX_UTTERANCE', 20),
    });
  } else {
    log('ASR is text-only: set CUEX_ASR_URL or CUEX_ASR_MODEL_DIR to enable speech recognition');
    engine = new TextOnlyAsr();
  }
  if (shared) asr = engine;
  return engine;
}

export function createTtsEngine(source: Source = process.env): TtsEngine {
  const shared = source === process.env;
  if (shared && tts) return tts;
  const { env, num } = reader(source);
  const url = env('CUEX_TTS_URL') ?? 'http://127.0.0.1:18766/tts';
  const modelDir = env('CUEX_TTS_MODEL_DIR');
  const makers: Record<string, (() => TtsEngine) | undefined> = {
    edge: () => {
      const engine = new EdgeTts({
        voice: env('CUEX_EDGE_VOICE') ?? DEFAULT_EDGE_VOICE,
        rate: env('CUEX_EDGE_RATE') ?? '+8%', // Yunyang at +8% is about 4.2 to 4.7 chars/s: calm and slightly brisk
        pitch: env('CUEX_EDGE_PITCH') ?? '+0Hz',
        timeoutMs: num('CUEX_TTS_TIMEOUT_MS', 8000),
      });
      if (shared) edge = engine;
      return engine;
    },
    http: () => new HttpTts({ url, timeoutMs: num('CUEX_TTS_TIMEOUT_MS', 30000) }),
    sherpa: modelDir ? () => new LocalSherpaTts({ modelDir, threads: num('CUEX_TTS_THREADS', 2), speakerId: num('CUEX_TTS_SPEAKER', 0), speed: num('CUEX_TTS_SPEED', 1) }) : undefined,
  };
  const first = env('CUEX_TTS_BACKEND') ?? 'http';
  if (!(first in makers)) throw new Error(`CUEX_TTS_BACKEND must be edge, http or sherpa, got "${first}"`);
  if (!makers[first]) throw new Error(`CUEX_TTS_BACKEND=${first} needs ${first === 'http' ? 'CUEX_TTS_URL' : 'CUEX_TTS_MODEL_DIR'}`);
  const fallback = env('CUEX_TTS_FALLBACK') ?? 'none';
  if (fallback !== 'auto' && fallback !== 'none') throw new Error('CUEX_TTS_FALLBACK must be auto or none');
  const order = fallback === 'none' ? [first] : [first, ...['http', 'sherpa', 'edge'].filter(name => name !== first)];
  const engines = order.flatMap(name => (makers[name] ? [makers[name]!()] : []));
  const engine = engines.length === 1 ? engines[0] : new FallbackTts(engines);
  if (shared) tts = engine;
  return engine;
}

/** Call once at startup. It loads local models and opens connections so the first sentence is fast. It never throws. */
export async function warmupVoice(): Promise<void> {
  const started = Date.now();
  const jobs: Array<Promise<string>> = [];
  const speech = createAsrEngine();
  if (speech instanceof LocalSherpaAsr) jobs.push(Promise.resolve().then(() => { speech.warmup(); return 'asr model loaded'; }));
  if (speech instanceof RemoteSherpaAsr) jobs.push(speech.probe().then(() => 'asr server reachable'));
  createTtsEngine();
  if (edge) jobs.push(edge.warmup().then(() => 'edge tts connected'));
  const results = await Promise.allSettled(jobs);
  const notes = results.map(r => (r.status === 'fulfilled' ? r.value : `FAILED: ${(r.reason as Error).message}`));
  log(`asr=${speech.backend} tts=${createTtsEngine().backend}; ${notes.join('; ') || 'nothing to warm up'} (${Date.now() - started} ms)`);
}
