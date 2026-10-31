import type { SystemTwo } from '../contracts';
import { PiSystemTwo, type PiSystemTwoOptions } from './PiSystemTwo';

export { PiSystemTwo } from './PiSystemTwo';
export type { PiSystemTwoOptions, S2Metrics } from './PiSystemTwo';
export { loadS2Runtime } from './config';

/** Real System 2. Reads CUEX_S2_PROVIDER, CUEX_S2_MODEL, CUEX_S2_API_KEY, CUEX_S2_BASE_URL, CUEX_S2_RETRIEVAL, PRIME_MODELS_JSON. */
export function createSystemTwo(opts?: PiSystemTwoOptions): SystemTwo {
  return new PiSystemTwo(opts);
}
