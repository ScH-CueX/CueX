import type { AsrCorrection } from '../contracts';

interface Rule {
  regex: RegExp;
  replacement: string;
}

const compiled = new WeakMap<readonly AsrCorrection[], Rule[]>();

function compile(corrections: readonly AsrCorrection[]): Rule[] {
  const rules: Rule[] = [];
  for (const { pattern, replacement } of corrections) {
    try {
      rules.push({ regex: new RegExp(pattern, 'g'), replacement });
    } catch (error) {
      // A typo in the table must not take the microphone down. test/voice-asr-corrections.test.ts guards the shipped table.
      console.warn(`[voice] ignoring invalid ASR correction ${JSON.stringify(pattern)}: ${(error as Error).message}`);
    }
  }
  return rules;
}

/**
 * Rewrite known misrecognitions in rep ASR text, for example 克瑞三十到六十 to eGFR 30到60.
 * Rules run in table order, each on the output of the one before. Call it on partials and finals alike.
 * Keep this module free of heavy imports: the gateway loads it even in fake mode.
 */
export function correctAsrText(text: string, corrections?: readonly AsrCorrection[]): string {
  if (!text || !corrections?.length) return text;
  let rules = compiled.get(corrections);
  if (!rules) {
    rules = compile(corrections);
    compiled.set(corrections, rules);
  }
  let out = text;
  for (const { regex, replacement } of rules) out = out.replace(regex, replacement);
  return out;
}
