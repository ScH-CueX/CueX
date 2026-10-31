import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { TtsChunk, TtsEngine } from '../contracts';
import { loadSherpa, type SherpaOfflineTts } from './sherpa';
import { float32ToWav } from './wav';

export interface LocalTtsOptions {
  modelDir: string;
  threads: number;
  speakerId: number;
  speed: number;
}

/**
 * In-process sherpa-onnx offline TTS for a VITS model directory (model.onnx or model.int8.onnx, lexicon.txt, tokens.txt,
 * optional *.fst rules), for example vits-icefall-zh-aishell3 or vits-melo-tts-zh_en.
 * Checked on vits-icefall-zh-aishell3. Other model families are not wired up.
 */
export class LocalSherpaTts implements TtsEngine {
  readonly backend = 'sherpa-vits';
  private tts?: Promise<SherpaOfflineTts>;

  constructor(private readonly opts: LocalTtsOptions) {}

  private load(): Promise<SherpaOfflineTts> {
    if (!this.tts) {
      const { modelDir, threads } = this.opts;
      const names = readdirSync(modelDir);
      const model = names.includes('model.int8.onnx') && names.includes('model.onnx') ? 'model.onnx' : names.find(n => /^model(\.int8)?\.onnx$/.test(n));
      if (!model || !existsSync(join(modelDir, 'lexicon.txt'))) throw new Error(`${modelDir} is not a VITS model directory (needs model.onnx, lexicon.txt, tokens.txt)`);
      const rules = names.filter(n => n.endsWith('.fst')).map(n => join(modelDir, n)).join(',');
      this.tts = loadSherpa().OfflineTts.createAsync({
        model: { vits: { model: join(modelDir, model), lexicon: join(modelDir, 'lexicon.txt'), tokens: join(modelDir, 'tokens.txt') }, numThreads: threads, provider: 'cpu', debug: false },
        ruleFsts: rules,
        maxNumSentences: 1,
      });
      this.tts.catch(() => { this.tts = undefined; });
    }
    return this.tts;
  }

  async warmup(): Promise<void> {
    await this.load();
  }

  async *synthesize(text: string, signal: AbortSignal): AsyncIterable<TtsChunk> {
    signal.throwIfAborted();
    const tts = await this.load();
    if (signal.aborted) return;
    const result = await tts.generateAsync({ text, sid: this.opts.speakerId, speed: this.opts.speed, onProgress: () => (signal.aborted ? 0 : 1) });
    if (signal.aborted) return;
    yield { audio: float32ToWav(result.samples, result.sampleRate), mimeType: 'audio/wav' };
  }
}
