import type { ScenarioPack } from './contracts';
import type { ControllerOptions } from './controller/TurnController';
import type { SessionEngines } from './gateway/WebSocketGateway';
import { FakeSystemOne, FakeSystemTwo, SilentTts, TextOnlyAsr } from './fakes/engines';

type EngineMode = 'fake' | 'real';
export interface ServerConfig {
  port: number;
  host: string;
  system1: EngineMode;
  system2: EngineMode;
  asr: EngineMode;
  tts: EngineMode;
  controller: Omit<ControllerOptions, 'doctorLines'>;
}
function mode(env: NodeJS.ProcessEnv, key: string): EngineMode {
  const value = env[key] ?? 'fake';
  if (value !== 'fake' && value !== 'real') throw new Error(`${key} must be fake or real`);
  return value;
}
function number(env: NodeJS.ProcessEnv, key: string, fallback: number, minimum = 0): number {
  const value = env[key] === undefined ? fallback : Number(env[key]);
  if (!Number.isInteger(value) || value < minimum || value > 65535) throw new Error(`${key} must be an integer in ${minimum}..65535`);
  return value;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: number(env, 'PORT', 8765), host: env.HOST || '127.0.0.1',
    system1: mode(env, 'CUEX_SYSTEM1'), system2: mode(env, 'CUEX_SYSTEM2'), asr: mode(env, 'CUEX_ASR'), tts: mode(env, 'CUEX_TTS'),
    controller: {
      debounceMs: number(env, 'CUEX_DEBOUNCE_MS', 280), minDriftMs: number(env, 'CUEX_MIN_DRIFT_MS', 900),
      minDriftChars: number(env, 'CUEX_MIN_DRIFT_CHARS', 35), candidateHoldMs: number(env, 'CUEX_CANDIDATE_HOLD_MS', 650),
      minInterruptGapMs: number(env, 'CUEX_MIN_INTERRUPT_GAP_MS', 2000),
    },
  };
}

/** Dynamic imports keep fake-only demos independent of model runtimes and credentials. */
export async function createEngines(config: ServerConfig, pack: ScenarioPack): Promise<SessionEngines> {
  const system1 = config.system1 === 'fake' ? new FakeSystemOne() : (await import('./system1/index')).createSystemOne(pack);
  const system2 = config.system2 === 'fake' ? new FakeSystemTwo() : await createRealSystemTwo();
  const asr = config.asr === 'fake' ? new TextOnlyAsr() : await createRealAsr();
  const tts = config.tts === 'fake' ? new SilentTts() : await createRealTts();
  return { system1, system2, asr, tts };
}

async function createRealSystemTwo(): Promise<SessionEngines['system2']> {
  const module = await import('./system2/PiAgentRunner');
  return new module.PiAgentRunner();
}
async function createRealAsr(): Promise<SessionEngines['asr']> {
  const module = await import('./voice/index');
  return module.createAsrEngine();
}
async function createRealTts(): Promise<SessionEngines['tts']> {
  const module = await import('./voice/index');
  return module.createTtsEngine();
}
