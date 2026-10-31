/**
 * System 2 provider config.
 * Reads Prime Agent's models.json and builds a pi-ai provider for one (provider, model) pair.
 * The API key stays inside a closure. It is never logged, and error text goes through runtime.redact().
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createModels, createProvider, type Api, type Model, type MutableModels } from '@earendil-works/pi-ai';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';

export const DEFAULT_S2_PROVIDER = 'gpt-kanglives';
/** Default model per API family. Chosen from scripts/s2-bench.ts results and a read of the drafts. Backup for openai-completions: gemini-3.1-flash-lite. */
export const DEFAULT_S2_MODEL: Record<string, string> = {
  'openai-completions': 'gemini-3-flash',
  'anthropic-messages': 'claude-haiku-4-5',
};
/** The follow-up is one short sentence plus a few fields. Cap output so a slow model cannot ramble. */
const MAX_OUTPUT_TOKENS = 1024;

interface RawModelEntry {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: string[];
  contextWindow?: number;
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  thinkingLevelMap?: Record<string, string | null>;
}
interface RawProviderEntry {
  name?: string;
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  models?: RawModelEntry[];
}

export interface S2Runtime {
  models: MutableModels;
  model: Model<Api>;
  providerId: string;
  modelId: string;
  api: string;
  baseUrl: string;
  /** Label for logs, for example "pi-agent:gpt-kanglives/gemini-3.1-flash-lite". No secrets. */
  backend: string;
  /** Replaces the API key in any text with "***". */
  redact(text: string): string;
  /** Model ids that models.json lists for this provider. */
  listModelIds(): string[];
}

export interface LoadS2Options {
  providerId?: string;
  modelId?: string;
  env?: NodeJS.ProcessEnv;
}

function resolveKey(raw: string | undefined, env: NodeJS.ProcessEnv): string | undefined {
  if (!raw) return undefined;
  // models.json can name an env var instead of holding the key. Shell-command keys ("!cmd") are not run here.
  if (raw.startsWith('!')) throw new Error('models.json apiKey uses a shell command; set CUEX_S2_API_KEY instead');
  if (/^[A-Z][A-Z0-9_]*$/.test(raw) && env[raw]) return env[raw];
  return raw;
}

export function loadModelsJson(env: NodeJS.ProcessEnv = process.env): { providers: Record<string, RawProviderEntry> } {
  const path = env.PRIME_MODELS_JSON || join(homedir(), '.prime', 'agent', 'models.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read models.json at ${path}: ${(err as Error).message}`);
  }
  const providers = (parsed as { providers?: Record<string, RawProviderEntry> }).providers;
  if (!providers) throw new Error(`models.json at ${path} has no "providers"`);
  return { providers };
}

export function loadS2Runtime(opts: LoadS2Options = {}): S2Runtime {
  const env = opts.env ?? process.env;
  const providerId = opts.providerId ?? env.CUEX_S2_PROVIDER ?? DEFAULT_S2_PROVIDER;

  // Env overrides can replace the whole entry, so models.json is optional when both are set.
  let raw: RawProviderEntry = {};
  try {
    const entry = loadModelsJson(env).providers[providerId];
    if (entry) raw = entry;
    else if (!env.CUEX_S2_BASE_URL) throw new Error(`provider "${providerId}" not found in models.json`);
  } catch (err) {
    if (!env.CUEX_S2_BASE_URL || !env.CUEX_S2_API_KEY) throw err;
  }

  const api = raw.api ?? 'openai-completions';
  if (api !== 'openai-completions' && api !== 'anthropic-messages') {
    throw new Error(`provider "${providerId}" uses api "${api}"; System 2 supports openai-completions and anthropic-messages`);
  }
  const baseUrl = env.CUEX_S2_BASE_URL || raw.baseUrl;
  if (!baseUrl) throw new Error(`provider "${providerId}" has no baseUrl`);
  const key = env.CUEX_S2_API_KEY || resolveKey(raw.apiKey, env);
  if (!key) throw new Error(`no API key for provider "${providerId}" (set CUEX_S2_API_KEY or fix models.json)`);

  const modelId = opts.modelId ?? env.CUEX_S2_MODEL ?? DEFAULT_S2_MODEL[api];
  const entry: RawModelEntry = raw.models?.find((m) => m.id === modelId) ?? { id: modelId };

  const common = {
    id: entry.id,
    name: entry.name ?? entry.id,
    provider: providerId,
    baseUrl,
    reasoning: entry.reasoning ?? false,
    input: (entry.input?.includes('image') ? ['text', 'image'] : ['text']) as ('text' | 'image')[],
    cost: entry.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: entry.contextWindow ?? 128_000,
    maxTokens: MAX_OUTPUT_TOKENS,
    thinkingLevelMap: entry.thinkingLevelMap as Model<Api>['thinkingLevelMap'],
  };
  const model: Model<Api> =
    api === 'openai-completions'
      ? ({ ...common, api, compat: { supportsDeveloperRole: false, supportsStore: false } } as Model<Api>)
      : ({ ...common, api } as Model<Api>);

  const provider = createProvider({
    id: providerId,
    name: raw.name ?? providerId,
    baseUrl,
    auth: { apiKey: { name: providerId, resolve: async () => ({ auth: { apiKey: key }, source: 'models.json' }) } },
    models: [model],
    api: { 'openai-completions': openAICompletionsApi(), 'anthropic-messages': anthropicMessagesApi() },
  });
  const models = createModels();
  models.setProvider(provider);

  return {
    models,
    model,
    providerId,
    modelId,
    api,
    baseUrl,
    backend: `pi-agent:${providerId}/${modelId}`,
    redact: (text) => (key ? text.split(key).join('***') : text),
    listModelIds: () => (raw.models ?? []).map((m) => m.id),
  };
}
