import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/** The slice of sherpa-onnx-node that CueX uses. The package ships JSDoc only, so the types live here. */
export interface SherpaOnlineStream {
  acceptWaveform(wave: { samples: Float32Array; sampleRate: number }): void;
  inputFinished(): void;
}
export interface SherpaOnlineRecognizer {
  createStream(): SherpaOnlineStream;
  isReady(stream: SherpaOnlineStream): boolean;
  decode(stream: SherpaOnlineStream): void;
  isEndpoint(stream: SherpaOnlineStream): boolean;
  reset(stream: SherpaOnlineStream): void;
  getResult(stream: SherpaOnlineStream): { text: string };
}
export interface SherpaOfflineTts {
  /** Returning 0 from onProgress stops generation. */
  generateAsync(request: { text: string; sid: number; speed: number; onProgress?: () => number }): Promise<{ samples: Float32Array; sampleRate: number }>;
}
export interface SherpaModule {
  OnlineRecognizer: new (config: object) => SherpaOnlineRecognizer;
  OfflineTts: { createAsync(config: object): Promise<SherpaOfflineTts> };
}

let cached: SherpaModule | undefined;

/** Loaded on first use, so a Mac that only runs Edge TTS never touches the native library. */
export function loadSherpa(): SherpaModule {
  if (!cached) {
    try {
      cached = createRequire(import.meta.url)('sherpa-onnx-node') as SherpaModule;
    } catch (error) {
      throw new Error(`sherpa-onnx-node did not load on ${process.platform}-${process.arch}: ${(error as Error).message}`);
    }
  }
  return cached;
}

/** Find a model file by pattern. `prefer` wins when several match, for example the int8 variant. */
export function findModelFile(dir: string, pattern: RegExp, prefer?: RegExp): string {
  const names = readdirSync(dir).filter(name => pattern.test(name)).sort();
  const pick = (prefer && names.find(name => prefer.test(name))) || names[0];
  if (!pick) throw new Error(`No file matching ${pattern} in ${dir}`);
  return join(dir, pick);
}
