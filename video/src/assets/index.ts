import {staticFile} from 'remotion';
import manifest from './manifest.json';

// Every external file goes through this module, so replacing an asset only touches manifest.json.
export type VoiceId = keyof typeof manifest.voice;
export type SfxId = keyof typeof manifest.sfx;
export type MusicId = keyof typeof manifest.music;
export type FontId = keyof typeof manifest.fonts;

export const asset = {
  font: (id: FontId) => staticFile(manifest.fonts[id].file),
  voice: (id: VoiceId) => staticFile(manifest.voice[id].file),
  music: (id: MusicId) => staticFile(manifest.music[id].file),
  sfx: (id: SfxId) => staticFile(manifest.sfx[id].file),
};

export {manifest};
