import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
export function getChromium() {
  const candidates = [process.env.CUEX_PLAYWRIGHT_PATH, 'playwright'];
  for (const candidate of candidates.filter(Boolean)) {
    try { return require(candidate).chromium; } catch {}
  }
  throw new Error('Install playwright, or set CUEX_PLAYWRIGHT_PATH to its package directory.');
}
