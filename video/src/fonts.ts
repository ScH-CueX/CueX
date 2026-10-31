import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';
import {manifest} from './assets';

let started = false;

// Registers every font in the manifest. loadFont holds the render until each file is ready.
export const loadFonts = () => {
  if (started) return;
  started = true;
  for (const font of Object.values(manifest.fonts)) {
    loadFont({family: font.family, url: staticFile(font.file), weight: font.weight, style: font.style}).catch((err) => {
      console.error(`Font ${font.family} failed to load`, err);
    });
  }
};
