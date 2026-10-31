/**
 * Doctor profile and memory files.
 *
 *   agents/doctors/<doctorId>/PROFILE.md   who the doctor is (edited by people)
 *   agents/doctors/<doctorId>/MEMORY.md    the doctor's impressions of recent reps (header lines plus "- " bullets).
 *                                          Every visitor is a new rep, so the impressions steer what the doctor presses on and no spoken line may refer to an earlier visit.
 *
 * loadDoctor() is synchronous and cached. Call it at session start (PiSystemTwo does) so the live loop never reads files.
 * appendMemory() is asynchronous, runs at session end, and does not touch the live loop.
 * The directory defaults to apps/server/agents/doctors. CUEX_AGENTS_DIR overrides it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScenarioPack } from '../contracts';

export const MAX_MEMORY_BULLETS = 20;
const MAX_LINES_PER_APPEND = 3;
const MAX_LINE_CHARS = 120;
/** Doctor ids become directory names, so keep them to a safe character set. */
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export interface DoctorRecord {
  doctorId: string;
  /** Text of PROFILE.md. Empty when the file is missing. */
  profile: string;
  /** Text of MEMORY.md. Empty when the file is missing. */
  memory: string;
  /** True when at least one of the two files exists. */
  found: boolean;
}

export interface DoctorStore {
  readonly dir: string;
  /** Reads both files on the first call for an id, then serves the cache. Unknown or invalid ids give found:false. */
  loadDoctor(doctorId: string): DoctorRecord;
  /**
   * Appends up to 3 short lines as "- YYYY-MM-DD text" bullets and keeps the last 20 bullets.
   * Returns the lines that were written. Rejects on an invalid id or a write error.
   */
  appendMemory(doctorId: string, lines: string[]): Promise<string[]>;
  clearCache(): void;
  /** Drops the cache and reads every doctor directory again. Call at session start, not inside the live loop. Returns the ids found. */
  reload(): string[];
}

function readOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw err;
  }
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function normalizeLine(line: string): string {
  return line
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/^\s*(?:[-*•]\s+)+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LINE_CHARS);
}

const isBullet = (line: string) => /^- /.test(line);

/** Keeps every non-bullet line in place and trims the bullets to the newest MAX_MEMORY_BULLETS. */
export function mergeMemory(existing: string, newBullets: string[], fallbackHeader: string): string {
  const lines = existing.split('\n');
  const others = lines.filter((l) => !isBullet(l));
  const bullets = [...lines.filter(isBullet), ...newBullets].slice(-MAX_MEMORY_BULLETS);
  const head = others.join('\n').trim() || fallbackHeader;
  return `${head}\n\n${bullets.join('\n')}\n`;
}

/** Bullet text without the leading "- ", oldest first. */
export function memoryBullets(memory: string): string[] {
  return memory.split('\n').filter(isBullet).map((l) => l.slice(2).trim());
}

export function createDoctorStore(dir: string): DoctorStore {
  const root = resolve(dir);
  const cache = new Map<string, DoctorRecord>();
  const chains = new Map<string, Promise<unknown>>();

  const load = (doctorId: string): DoctorRecord => {
    const hit = cache.get(doctorId);
    if (hit) return hit;
    if (!ID_PATTERN.test(doctorId)) return { doctorId, profile: '', memory: '', found: false };
    const profile = readOrEmpty(join(root, doctorId, 'PROFILE.md'));
    const memory = readOrEmpty(join(root, doctorId, 'MEMORY.md'));
    const rec: DoctorRecord = { doctorId, profile, memory, found: profile !== '' || memory !== '' };
    cache.set(doctorId, rec);
    return rec;
  };

  return {
    dir: root,
    loadDoctor: load,
    clearCache: () => cache.clear(),
    reload() {
      cache.clear();
      let names: string[] = [];
      try {
        names = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
      } catch {
        return [];
      }
      return names.filter((n) => ID_PATTERN.test(n) && load(n).found);
    },
    async appendMemory(doctorId, lines) {
      if (!ID_PATTERN.test(doctorId)) throw new Error(`invalid doctor id "${doctorId}"`);
      const clean = lines.map(normalizeLine).filter(Boolean).slice(0, MAX_LINES_PER_APPEND);
      if (clean.length === 0) return [];
      const write = async () => {
        const dirPath = join(root, doctorId);
        await mkdir(dirPath, { recursive: true });
        const file = join(dirPath, 'MEMORY.md');
        let current = '';
        try {
          current = await readFile(file, 'utf8');
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
        const date = today();
        const next = mergeMemory(current, clean.map((l) => `- ${date} ${l}`), `# ${doctorId} 对近来来访代表的印象`);
        const tmp = `${file}.${process.pid}.tmp`;
        await writeFile(tmp, next, 'utf8');
        await rename(tmp, file);
        const prev = cache.get(doctorId);
        cache.set(doctorId, { doctorId, profile: prev?.profile ?? readOrEmpty(join(dirPath, 'PROFILE.md')), memory: next, found: true });
      };
      // One write at a time per doctor, so two sessions ending together cannot lose a line.
      const run = (chains.get(doctorId) ?? Promise.resolve()).then(write, write);
      chains.set(doctorId, run.catch(() => undefined));
      await run;
      return clean;
    },
  };
}

let defaultStore: DoctorStore | null = null;
function store(): DoctorStore {
  if (!defaultStore) {
    const dir = process.env.CUEX_AGENTS_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '../../agents/doctors');
    defaultStore = createDoctorStore(dir);
  }
  return defaultStore;
}

export const defaultDoctorStore = (): DoctorStore => store();
export const loadDoctor = (doctorId: string): DoctorRecord => store().loadDoctor(doctorId);
export const appendMemory = (doctorId: string, lines: string[]): Promise<string[]> => store().appendMemory(doctorId, lines);

// ---------- Session end: deterministic memory lines ----------

export interface SessionOutcome {
  concernId: string;
  /** Point ids the rep answered. The Controller's snapshot() has this field. */
  resolvedPointIds: string[];
  /** Candidates prepared in the session. The Controller's snapshot() has this field. */
  candidates?: Array<{ draftText: string; fate?: 'asked' | 'withdrawn' }>;
}

/**
 * Up to 3 short lines in the doctor's own voice: points answered, points not answered, and what happened to the follow-up.
 * It uses only point labels and the doctor's own follow-up text. The rep's raw speech never goes into memory.
 */
export function summarizeSession(pack: ScenarioPack, outcome: SessionOutcome): string[] {
  const concern = pack.scenario.concerns.find((c) => c.id === outcome.concernId);
  if (!concern) return [];
  // Ranges are stored in spoken form ("30 到 60"), so the model does not copy a dash into a spoken line.
  const say = (label: string) => label.replace(/(\d)\s*[–—-]\s*(\d)/g, '$1 到 $2');
  const answered = concern.points.filter((p) => outcome.resolvedPointIds.includes(p.id)).map((p) => say(p.label));
  const open = concern.points.filter((p) => !outcome.resolvedPointIds.includes(p.id)).map((p) => say(p.label));
  const lines: string[] = [];
  if (answered.length > 0) lines.push(`${concern.title}：${answered.join('、')}，答清楚了。`);
  if (open.length > 0) lines.push(`${concern.title}：${open.join('、')}，没答到。`);
  const asked = outcome.candidates?.filter((c) => c.fate === 'asked').at(-1);
  const withdrawn = outcome.candidates?.some((c) => c.fate === 'withdrawn');
  if (asked) lines.push(`追问过：“${asked.draftText.slice(0, 40)}”`);
  else if (withdrawn) lines.push('备好的追问撤掉了，没问出口。');
  return lines.slice(0, MAX_LINES_PER_APPEND);
}

/** summarizeSession + appendMemory. Never rejects. Resolves true when something was written. */
export async function recordSessionMemory(pack: ScenarioPack, outcome: SessionOutcome, target: DoctorStore = store()): Promise<boolean> {
  try {
    const written = await target.appendMemory(pack.scenario.doctor.id, summarizeSession(pack, outcome));
    return written.length > 0;
  } catch {
    return false;
  }
}
