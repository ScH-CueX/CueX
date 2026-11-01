import type { ExperienceInput, ScenarioSummary, SynthesisInput, TeamExperience } from '@cuex/protocol';
async function request<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '服务暂时不可用，请稍后重试。');
  return data as T;
}
export const listExperiences = () => request<TeamExperience[]>('/api/experiences');
export const saveExperience = (value: ExperienceInput) => request<TeamExperience>('/api/experiences', value);
export const listScenarios = () => request<ScenarioSummary[]>('/api/scenarios');
export const synthesizeScenario = (value: SynthesisInput, signal: AbortSignal) => request<ScenarioSummary>('/api/scenarios', value, signal);
