import type { ScenarioPack, SystemOneClient, SystemOneResult, JevQuestion } from '../contracts';
import { LlamaSystemOne } from './LlamaSystemOne';
import { HeuristicSystemOne } from './HeuristicSystemOne';
export { LlamaSystemOne, HeuristicSystemOne };
export type { LlamaSystemOneOptions } from './LlamaSystemOne';

/** Try the model once; after a failure use local rules for a short recovery window. */
export class FallbackSystemOne implements SystemOneClient {
  private retryAfter = 0;
  constructor(private readonly primary: SystemOneClient, private readonly fallback: SystemOneClient, private readonly cooldownMs = 5000) {}
  get backend(): string { return Date.now() < this.retryAfter ? this.fallback.backend : this.primary.backend; }
  async health(): Promise<{ ok: boolean; detail?: string }> {
    const health = await this.primary.health();
    if (health.ok) return health;
    const local = await this.fallback.health();
    return { ok: local.ok, detail: `${this.primary.backend} unavailable; ${this.fallback.backend} ready` };
  }
  async decide(state: string, questions: Record<string, JevQuestion>, signal?: AbortSignal): Promise<SystemOneResult> {
    signal?.throwIfAborted();
    const start = performance.now();
    if (Date.now() >= this.retryAfter) {
      try { return await this.primary.decide(state, questions, signal); }
      catch (error) {
        signal?.throwIfAborted();
        if (error instanceof Error && error.name === 'AbortError') throw error;
        this.retryAfter = Date.now() + this.cooldownMs;
      }
    }
    const result = await this.fallback.decide(state, questions, signal);
    return { ...result, latencyMs: performance.now() - start };
  }
}

export function createSystemOne(pack: ScenarioPack): SystemOneClient {
  const heuristic = new HeuristicSystemOne(pack);
  return process.env.CUEX_S1_URL ? new FallbackSystemOne(new LlamaSystemOne(), heuristic) : heuristic;
}
