import type { TtsChunk, TtsEngine } from '../contracts';
import { fixWavSizes, sniffAudio } from './wav';

export interface HttpTtsOptions {
  url: string;
  timeoutMs: number;
}

/**
 * Remote TTS. POST {"text": "..."} to the URL and read one complete audio file back (WAV or MP3).
 * scripts/voice-tts-server.ts is the matching server for a sherpa-onnx model on another machine.
 */
export class HttpTts implements TtsEngine {
  readonly backend = 'http-tts';

  constructor(private readonly opts: HttpTtsOptions) {}

  async *synthesize(text: string, signal: AbortSignal): AsyncIterable<TtsChunk> {
    signal.throwIfAborted();
    const response = await fetch(this.opts.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(this.opts.timeoutMs)]),
    });
    if (!response.ok) throw new Error(`TTS server answered ${response.status}`);
    let audio: Buffer = Buffer.from(await response.arrayBuffer());
    if (signal.aborted) return;
    const mime = sniffAudio(audio);
    if (!mime) throw new Error(`TTS server returned ${audio.length} bytes that are not audio`);
    if (mime === 'audio/wav') audio = fixWavSizes(audio);
    yield { audio, mimeType: mime };
  }
}
