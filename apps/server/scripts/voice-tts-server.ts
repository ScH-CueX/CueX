/**
 * HTTP TTS server for a sherpa-onnx VITS model, for a machine other than the one running the CueX server (the Windows box, for example).
 * The CueX server reaches it with CUEX_TTS_URL=http://host:port/tts.
 *
 *   CUEX_TTS_MODEL_DIR=/path/to/vits-model PORT=8790 tsx scripts/voice-tts-server.ts
 *
 * POST /tts  {"text": "..."}  ->  200 with one complete WAV file
 * GET  /health                ->  {"ok": true}
 *
 * There is no authentication. HOST defaults to 127.0.0.1. Set HOST=0.0.0.0 only on a network you trust.
 */
import { createServer } from 'node:http';
import { LocalSherpaTts } from '../src/voice/tts-local';

const modelDir = process.env.CUEX_TTS_MODEL_DIR;
if (!modelDir) throw new Error('Set CUEX_TTS_MODEL_DIR to a sherpa-onnx VITS model directory');
const port = Number(process.env.PORT ?? 8790);
const host = process.env.HOST ?? '127.0.0.1';
const engine = new LocalSherpaTts({
  modelDir,
  threads: Number(process.env.CUEX_TTS_THREADS ?? 4),
  speakerId: Number(process.env.CUEX_TTS_SPEAKER ?? 0),
  speed: Number(process.env.CUEX_TTS_SPEED ?? 1),
});

const started = performance.now();
await engine.warmup();
console.log(`[tts-server] model loaded in ${Math.round(performance.now() - started)} ms`);

// One synthesis at a time: the model object is shared.
let queue: Promise<unknown> = Promise.resolve();

createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    return;
  }
  if (req.method !== 'POST' || req.url !== '/tts') {
    res.writeHead(404).end();
    return;
  }
  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  try {
    const parts: Buffer[] = [];
    let size = 0;
    for await (const part of req) {
      size += (part as Buffer).length;
      if (size > 16_384) { res.writeHead(413).end(); return; }
      parts.push(part as Buffer);
    }
    const { text } = JSON.parse(Buffer.concat(parts).toString()) as { text?: unknown };
    if (typeof text !== 'string' || !text.trim() || text.length > 500) { res.writeHead(400).end('text must be a string of 1 to 500 characters'); return; }
    const job = queue.then(async () => {
      const t0 = performance.now();
      for await (const chunk of engine.synthesize(text, abort.signal)) {
        if (abort.signal.aborted) return;
        res.writeHead(200, { 'content-type': chunk.mimeType, 'content-length': chunk.audio.length }).end(chunk.audio);
        console.log(`[tts-server] ${text.length} chars in ${Math.round(performance.now() - t0)} ms`);
      }
    });
    queue = job.catch(() => undefined);
    await job;
  } catch (error) {
    console.error('[tts-server]', (error as Error).message);
    if (!res.headersSent) res.writeHead(500).end();
  }
}).listen(port, host, () => console.log(`[tts-server] http://${host}:${port}/tts`));
