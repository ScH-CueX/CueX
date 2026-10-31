/** Small WAV and audio-sniffing helpers. The browser calls decodeAudioData on every TTS chunk, so each chunk must be a complete file. */

export function pcm16ToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function float32ToWav(samples: Float32Array, sampleRate: number): Buffer {
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), i * 2);
  }
  return pcm16ToWav(pcm, sampleRate);
}

export function silentWav(durationMs: number, sampleRate = 16000): Buffer {
  return pcm16ToWav(Buffer.alloc(Math.round((sampleRate * durationMs) / 1000) * 2), sampleRate);
}

export type AudioMime = 'audio/wav' | 'audio/mpeg' | 'audio/ogg';

/** Identify the container from its first bytes, so a JSON error body is never sent to the player as audio. */
export function sniffAudio(buf: Buffer): AudioMime | undefined {
  if (buf.length < 12) return undefined;
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav';
  if (buf.toString('ascii', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (buf.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg';
  return undefined;
}

/** Streaming servers write a RIFF or data size of 0 or 0xFFFFFFFF. decodeAudioData rejects that, so rewrite the sizes. */
export function fixWavSizes(wav: Buffer): Buffer {
  let pos = 12;
  while (pos + 8 <= wav.length) {
    const id = wav.toString('ascii', pos, pos + 4);
    const size = wav.readUInt32LE(pos + 4);
    if (id === 'data') {
      const real = wav.length - pos - 8;
      if (size === real) return wav;
      const out = Buffer.from(wav);
      out.writeUInt32LE(wav.length - 8, 4);
      out.writeUInt32LE(real, pos + 4);
      return out;
    }
    pos += 8 + size + (size & 1);
  }
  return wav;
}
