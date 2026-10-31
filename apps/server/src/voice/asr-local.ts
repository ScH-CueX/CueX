import type { AsrCallbacks, AsrEngine, AsrStream } from '../contracts';
import { findModelFile, loadSherpa, type SherpaOnlineRecognizer } from './sherpa';

export interface LocalAsrOptions {
  modelDir: string;
  threads: number;
  provider: string;
  /** Silence after speech that ends a sentence. */
  endpointSilenceSec: number;
  /** A sentence longer than this is cut and finalised. */
  maxUtteranceSec: number;
}

/**
 * In-process streaming transducer (zipformer) through sherpa-onnx-node.
 * The model directory holds encoder*.onnx, decoder*.onnx, joiner*.onnx and tokens.txt (int8 files are preferred).
 * One shared recognizer, one stream per connection.
 */
export class LocalSherpaAsr implements AsrEngine {
  readonly backend = 'sherpa-local';
  private recognizer?: SherpaOnlineRecognizer;

  constructor(private readonly opts: LocalAsrOptions) {}

  /** Load the model now. It takes a few seconds and blocks the event loop, so do it at startup. */
  warmup(): void {
    this.load();
  }

  private load(): SherpaOnlineRecognizer {
    if (this.recognizer) return this.recognizer;
    const { modelDir, threads, provider, endpointSilenceSec, maxUtteranceSec } = this.opts;
    this.recognizer = new (loadSherpa().OnlineRecognizer)({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        transducer: {
          encoder: findModelFile(modelDir, /^encoder.*\.onnx$/, /int8/),
          decoder: findModelFile(modelDir, /^decoder.*\.onnx$/, /int8/),
          joiner: findModelFile(modelDir, /^joiner.*\.onnx$/, /int8/),
        },
        tokens: findModelFile(modelDir, /^tokens\.txt$/),
        numThreads: threads,
        provider,
        debug: 0,
      },
      decodingMethod: 'greedy_search',
      enableEndpoint: 1,
      rule1MinTrailingSilence: 2.4,
      rule2MinTrailingSilence: endpointSilenceSec,
      rule3MinUtteranceLength: maxUtteranceSec,
    });
    return this.recognizer;
  }

  async open(opts: { sampleRate: number }, callbacks: AsrCallbacks): Promise<AsrStream> {
    const recognizer = this.load();
    const stream = recognizer.createStream();
    const rate = opts.sampleRate;
    let lastPartial = '';
    let ended = false;

    const pump = () => {
      while (recognizer.isReady(stream)) recognizer.decode(stream);
      const text = recognizer.getResult(stream).text.trim();
      if (recognizer.isEndpoint(stream)) {
        if (text) callbacks.onFinal(text);
        recognizer.reset(stream);
        lastPartial = '';
      } else if (text && text !== lastPartial) {
        lastPartial = text;
        callbacks.onPartial(text);
      }
    };

    return {
      write(pcm16le: Buffer) {
        if (ended) return;
        try {
          const samples = new Float32Array(pcm16le.length >> 1);
          for (let i = 0; i < samples.length; i++) samples[i] = pcm16le.readInt16LE(i * 2) / 32768;
          stream.acceptWaveform({ samples, sampleRate: rate });
          pump();
        } catch (error) {
          callbacks.onError(error as Error);
        }
      },
      end() {
        if (ended) return;
        ended = true;
        try {
          // Silence flushes the last tokens out of the encoder.
          stream.acceptWaveform({ samples: new Float32Array(Math.round(rate * 0.4)), sampleRate: rate });
          stream.inputFinished();
          while (recognizer.isReady(stream)) recognizer.decode(stream);
          const text = recognizer.getResult(stream).text.trim();
          if (text) callbacks.onFinal(text);
        } catch (error) {
          callbacks.onError(error as Error);
        }
      },
    };
  }
}
