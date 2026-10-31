/**
 * Shared guard for one short-lived Pi agent run: caller cancel and a hard deadline.
 * A cancel throws an Error named AbortError. A deadline throws a plain Error, so the Controller can tell them apart.
 */
import type { Agent } from '@earendil-works/pi-agent-core';

export function abortError(): Error {
  const e = new Error('System 2 request aborted');
  e.name = 'AbortError';
  return e;
}

export async function runAgentGuarded(agent: Agent, prompt: string, signal: AbortSignal, timeoutMs: number, label: string): Promise<void> {
  const onAbort = () => agent.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    agent.abort();
  }, timeoutMs);
  try {
    await agent.prompt(prompt);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
  if (signal.aborted) throw abortError();
  if (timedOut) throw new Error(`System 2 timed out after ${timeoutMs} ms (${label})`);
}
