import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ExperienceInput, ScenarioSummary, TeamExperience } from '@cuex/protocol';
import type { ScenarioPack } from '../contracts';

interface StoredScenario { pack: ScenarioPack; createdAt: string }
interface LibraryData { version: 1; experiences: TeamExperience[]; scenarios: StoredScenario[] }
export class InputError extends Error {}
export function shortText(value: unknown, name: string, max: number, optional = false): string {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new InputError(`${name}需要填写，且不能超过 ${max} 字。`);
  return value.trim();
}
export function experienceInput(value: unknown): ExperienceInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('请填写经验内容。');
  const x = value as Record<string, unknown>;
  return { sourceSeniorRep: shortText(x.sourceSeniorRep, '经验来源', 100, true), scenarioContext: shortText(x.scenarioContext, '适用情境', 500), goldenTactic: shortText(x.goldenTactic, '应对经验', 1500), antiPatternWarning: shortText(x.antiPatternWarning, '需要避免的做法', 500, true) };
}
/** Single-process store. Each synchronous atomic write includes all prior completed writes. */
export class LibraryStore {
  private data: LibraryData;
  private readonly file: string;
  constructor(private readonly directory: string, readonly base: ScenarioPack) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = join(directory, 'library.json');
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as LibraryData;
      if (parsed.version !== 1 || !Array.isArray(parsed.experiences) || !Array.isArray(parsed.scenarios)
        || parsed.experiences.some(e => !e.id || !e.goldenTactic) || parsed.scenarios.some(s => !s.pack?.scenario?.id || !s.pack.facts || !s.pack.lineExamples)) throw new Error('Invalid library format');
      this.data = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('团队库无法读取，请检查备份；未覆盖已有数据。');
      this.data = { version: 1, experiences: [], scenarios: [] };
    }
  }
  private save(next: LibraryData): void {
    const tmp = join(this.directory, `.library-${randomUUID()}.tmp`);
    try { writeFileSync(tmp, JSON.stringify(next), { mode: 0o600, flag: 'wx' }); renameSync(tmp, this.file); this.data = next; }
    finally { try { unlinkSync(tmp); } catch {} }
  }
  experiences(): TeamExperience[] { return structuredClone(this.data.experiences); }
  addExperience(input: ExperienceInput): TeamExperience {
    const entry = { ...experienceInput(input), id: `exp-${randomUUID()}`, createdAt: new Date().toISOString() };
    this.save({ ...this.data, experiences: [...this.data.experiences, entry] });
    return structuredClone(entry);
  }
  pack(id: string): ScenarioPack | undefined {
    const pack = id === this.base.scenario.id ? this.base : this.data.scenarios.find(s => s.pack.scenario.id === id)?.pack;
    return pack && structuredClone(pack);
  }
  scenarios(): ScenarioSummary[] {
    return [{ pack: this.base, createdAt: undefined }, ...this.data.scenarios].map(({ pack, createdAt }) => ({ id: pack.scenario.id, sceneTitle: pack.scenario.sceneTitle, doctor: structuredClone(pack.scenario.doctor), createdAt, experienceCount: pack.scenario.expertRules?.length ?? 0, generated: !!createdAt }));
  }
  addScenario(pack: ScenarioPack): ScenarioSummary {
    if (this.pack(pack.scenario.id)) throw new InputError('场景编号已存在。');
    this.save({ ...this.data, scenarios: [...this.data.scenarios, { pack: structuredClone(pack), createdAt: new Date().toISOString() }] });
    return this.scenarios().find(s => s.id === pack.scenario.id)!;
  }
}
