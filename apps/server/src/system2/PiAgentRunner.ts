import { PiSystemTwo } from './PiSystemTwo';

/**
 * Name used by src/config.ts (owned by the controller worker): `new PiAgentRunner()`.
 * Same class as PiSystemTwo. Settings come from CUEX_S2_* env vars and models.json.
 */
export class PiAgentRunner extends PiSystemTwo {}
