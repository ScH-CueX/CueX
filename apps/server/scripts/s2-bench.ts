/**
 * System 2 latency benchmark.
 *
 *   cd apps/server && PATH=/opt/homebrew/opt/node@22/bin:$PATH npx tsx scripts/s2-bench.ts \
 *     --models gpt-kanglives:gemini-3.1-flash-lite,gpt-kanglives-anthropic:claude-haiku-4-5 --n 5 --retrieval both
 *
 * Options:
 *   --models   comma list of providerId:modelId (required)
 *   --n        counted requests per model and mode (default 5)
 *   --warmup   untimed requests before counting, to open the connection (default 1)
 *   --retrieval inline | tool | both (default inline)
 *   --thinking off | minimal | low | medium | high (default off)
 *   --pack     anshu (陈主任, default) | li (李医生, same facts, time-pressed profile from agents/doctors/dr-li)
 *   --memory   on (default) | off: off hides MEMORY.md, to compare drafts with and without the doctor's memory
 *   --json     write the full result to this path (default /tmp/cuex-s2-bench.json)
 * The API key is never printed. Error text is redacted.
 */
import { writeFileSync } from 'node:fs';
import { loadS2Runtime } from '../src/system2/config';
import { LI_PACK, buildBenchRequests } from '../src/system2/fixtures';
import { ANSHU_PACK } from '../src/scenario/anshu';
import { defaultDoctorStore, type DoctorStore } from '../src/system2/doctors';
import { PiSystemTwo, type S2Metrics } from '../src/system2/PiSystemTwo';
import type { RetrievalMode } from '../src/system2/prompt';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const a = [...values].sort((x, y) => x - y);
  const idx = (a.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}

interface Row { spec: string; mode: RetrievalMode; i: number; ok: boolean; error?: string; text?: string; targets?: string[]; m?: S2Metrics; phases?: string[] }

async function runOne(spec: string, mode: RetrievalMode, thinking: string, n: number, warmup: number, pack = ANSHU_PACK): Promise<{ rows: Row[]; warm: number[] }> {
  const [providerId, modelId] = spec.split(':');
  const rt = loadS2Runtime({ providerId, modelId });
  const base = defaultDoctorStore();
  const doctors: DoctorStore = arg('memory', 'on') === 'off' ? { ...base, loadDoctor: (id) => ({ ...base.loadDoctor(id), memory: '' }) } : base;
  const s2 = new PiSystemTwo({ runtime: rt, retrieval: mode, thinkingLevel: thinking as never, doctors });
  const ctl = new AbortController();
  const reqs = buildBenchRequests(ctl.signal, pack);
  const rows: Row[] = [];
  const warm: number[] = [];
  for (let k = 0; k < warmup + n; k++) {
    const req = reqs[k % reqs.length];
    const phases: string[] = [];
    try {
      const { draft, metrics } = await s2.prepareFollowupWithMetrics(req, (ph, partial) => {
        if (phases[phases.length - 1] !== ph) phases.push(ph);
        void partial;
      });
      if (k < warmup) { warm.push(metrics.totalMs); continue; }
      rows.push({ spec, mode, i: k - warmup, ok: true, text: draft.text, targets: draft.targetPointIds, m: metrics, phases });
    } catch (err) {
      if (k < warmup) continue;
      rows.push({ spec, mode, i: k - warmup, ok: false, error: rt.redact((err as Error).message).slice(0, 200) });
    }
  }
  return { rows, warm };
}

async function main() {
  const models = (arg('models') ?? '').split(',').filter(Boolean);
  if (models.length === 0) throw new Error('--models providerId:modelId[,..] is required');
  const n = Number(arg('n', '5'));
  const warmup = Number(arg('warmup', '1'));
  const thinking = arg('thinking', 'off')!;
  const rmode = arg('retrieval', 'inline')!;
  const modes: RetrievalMode[] = rmode === 'both' ? ['inline', 'tool'] : [rmode as RetrievalMode];
  const all: Row[] = [];
  const f = (x: number) => (Number.isFinite(x) ? String(Math.round(x)).padStart(5) : '    -');
  console.log(`n=${n} warmup=${warmup} thinking=${thinking}`);
  console.log('model'.padEnd(46), 'mode'.padEnd(7), 'ok', ' ttft p50  p95 | total p50  p95 | calls ungrounded');
  for (const spec of models) {
    for (const mode of modes) {
      const { rows, warm } = await runOne(spec, mode, thinking, n, warmup, arg('pack', 'anshu') === 'li' ? LI_PACK : ANSHU_PACK);
      all.push(...rows);
      const ok = rows.filter((r) => r.ok);
      const ttft = ok.map((r) => r.m!.ttftMs).filter((x): x is number => x !== null);
      const tot = ok.map((r) => r.m!.totalMs);
      const bad = ok.filter((r) => !r.m!.grounded).length;
      const calls = ok.length ? (ok.reduce((a, r) => a + r.m!.llmCalls, 0) / ok.length).toFixed(1) : '-';
      console.log(spec.padEnd(46), mode.padEnd(7), `${ok.length}/${rows.length}`.padEnd(3),
        f(percentile(ttft, 0.5)), f(percentile(ttft, 0.95)), '|', f(percentile(tot, 0.5)), f(percentile(tot, 0.95)), '|', calls.padStart(4), String(bad).padStart(6),
        warm.length ? ` (warmup ${Math.round(warm[0])} ms)` : '');
      for (const r of rows) {
        if (!r.ok) console.log(`   #${r.i} ERROR ${r.error}`);
        else console.log(`   #${r.i} ${Math.round(r.m!.totalMs)}ms [${r.targets!.join(',')}] ${r.text}${r.m!.grounded ? '' : `  !!UNGROUNDED ${r.m!.ungroundedNumbers.join(',')}`}${r.m!.usedTextFallback ? '  (text fallback)' : ''}`);
      }
    }
  }
  const out = arg('json', '/tmp/cuex-s2-bench.json')!;
  writeFileSync(out, JSON.stringify(all, null, 1));
  console.log(`full result: ${out}`);
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
