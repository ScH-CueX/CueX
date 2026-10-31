/**
 * Doctor-line benchmark: opening, retry and closing lines written live by System 2.
 *
 *   cd apps/server && PATH=/opt/homebrew/opt/node@22/bin:$PATH npx tsx scripts/s2-lines.ts --n 10
 *
 * Options:
 *   --n         lines per kind (default 10, spread over 5 retry situations and 3 closing situations)
 *   --kinds     comma list of opening,retry,closing (default all)
 *   --model     providerId:modelId (default: CUEX_S2_* env, then the System 2 default)
 *   --pack      anshu (陈主任, default) | li (李医生)
 *   --parallel  also run the same number of follow-up drafts alongside each line, to show the two agents do not slow each other
 *   --json      write every line and metric to this path (default /tmp/cuex-s2-lines.json)
 * Every line is printed so a person can read it. The API key is never printed.
 */
import { writeFileSync } from 'node:fs';
import type { DoctorLineKind } from '../src/contracts';
import { ANSHU_PACK } from '../src/scenario/anshu';
import { loadS2Runtime } from '../src/system2/config';
import { LineRejectedError, type LineMetrics } from '../src/system2/DoctorLineAgent';
import { LI_PACK, buildBenchRequests, buildLineRequests } from '../src/system2/fixtures';
import { PiSystemTwo } from '../src/system2/PiSystemTwo';
import { bigramDice } from '../src/system2/spoken';

const argv = (name: string, fallback?: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

/** Six-character phrases that appear in at least three of the lines. A high count means the doctor sounds scripted. */
function reusedPhrases(lines: string[], len = 6, minCount = 3): string[] {
  const count = new Map<string, number>();
  for (const line of lines) {
    const s = line.replace(/[\s，。、；：？！,.;:?!“”"'（）()…]/g, '');
    const seen = new Set<string>();
    for (let i = 0; i + len <= s.length; i++) seen.add(s.slice(i, i + len));
    for (const g of seen) count.set(g, (count.get(g) ?? 0) + 1);
  }
  const chosen: string[] = [];
  for (const [g, c] of [...count].filter(([, c]) => c >= minCount).sort((a, b) => b[1] - a[1])) {
    if (chosen.length >= 3) break;
    if (chosen.some((x) => x.includes(g.slice(0, 5)) || x.includes(g.slice(1)) || g.includes(x.slice(0, 5)))) continue;
    chosen.push(`${g}×${c}`);
  }
  return chosen;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const a = [...values].sort((x, y) => x - y);
  const idx = (a.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}
const ms = (x: number) => (Number.isFinite(x) ? String(Math.round(x)).padStart(5) : '    -');

interface Row { kind: DoctorLineKind; i: number; ok: boolean; line: string; rejected?: string; error?: string; m?: LineMetrics }

async function main() {
  const n = Number(argv('n', '10'));
  const kinds = (argv('kinds', 'opening,retry,closing') as string).split(',') as DoctorLineKind[];
  const pack = argv('pack', 'anshu') === 'li' ? LI_PACK : ANSHU_PACK;
  const spec = argv('model');
  const [providerId, modelId] = spec ? spec.split(':') : [undefined, undefined];
  const rt = loadS2Runtime({ providerId, modelId });
  const s2 = new PiSystemTwo({ runtime: rt });
  const ctl = new AbortController();
  console.log(`${s2.backend}  pack=${pack.scenario.doctor.id}  n=${n} per kind`);

  // One untimed line opens the connection.
  await s2.prepareDoctorLine(buildLineRequests(ctl.signal, 'closing', pack)[0]).catch(() => undefined);

  const all: Row[] = [];
  const examples = [...pack.lineExamples.opening, ...Object.values(pack.lineExamples.retry).flat(), ...pack.lineExamples.closing];
  console.log('kind     ok/rej  ttft p50  p95 | total p50  p95 | chars avg max | ungrounded copies redo | distinct maxSim');
  for (const kind of kinds) {
    const situations = buildLineRequests(ctl.signal, kind, pack);
    const rows: Row[] = [];
    for (let i = 0; i < n; i++) {
      const req = situations[i % situations.length];
      try {
        const { line, metrics } = await s2.prepareDoctorLineWithMetrics(req);
        rows.push({ kind, i, ok: true, line, m: metrics });
      } catch (err) {
        if (err instanceof LineRejectedError) rows.push({ kind, i, ok: false, line: err.line, rejected: err.reason, m: err.metrics });
        else rows.push({ kind, i, ok: false, line: '', error: rt.redact((err as Error).message).slice(0, 160) });
      }
    }
    all.push(...rows);
    const timed = rows.filter((r) => r.m);
    const lines = rows.filter((r) => r.ok).map((r) => r.line);
    let maxSim = 0;
    for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) maxSim = Math.max(maxSim, bigramDice(lines[a], lines[b]));
    const chars = timed.map((r) => r.m!.chars);
    console.log(
      kind.padEnd(8), `${rows.filter((r) => r.ok).length}/${rows.length - rows.filter((r) => r.ok).length}`.padEnd(7),
      ms(percentile(timed.map((r) => r.m!.ttftMs ?? NaN).filter(Number.isFinite), 0.5)), ms(percentile(timed.map((r) => r.m!.ttftMs ?? NaN).filter(Number.isFinite), 0.95)), '|',
      ms(percentile(timed.map((r) => r.m!.totalMs), 0.5)), ms(percentile(timed.map((r) => r.m!.totalMs), 0.95)), '|',
      (chars.reduce((a, b) => a + b, 0) / Math.max(1, chars.length)).toFixed(0).padStart(5), String(Math.max(0, ...chars)).padStart(3), '|',
      String(timed.filter((r) => r.m!.ungroundedNumbers.length > 0).length).padStart(9), String(timed.filter((r) => r.m!.copiesExample).length).padStart(6), String(timed.filter((r) => r.m!.attempts === 2).length).padStart(5), '|',
      String(new Set(lines).size).padStart(8), maxSim.toFixed(2).padStart(6),
    );
    const redos = timed.filter((r) => r.m!.redoReason).map((r) => r.m!.redoReason);
    if (redos.length) console.log(`   redo reasons: ${redos.join(' | ')}`);
    const reused = reusedPhrases(lines);
    console.log(`   reused phrases (6 chars, in 3+ lines): ${reused.length ? reused.join('  ') : 'none'}`);
    const leads = new Map<string, number>();
    for (const l of lines) {
      const k = l.replace(/[\s，。、；：？！,.;:?!“”"'（）()…]/g, '').slice(0, 3);
      leads.set(k, (leads.get(k) ?? 0) + 1);
    }
    const sameLead = [...leads].filter(([, c]) => c >= 3).map(([k, c]) => `${k}×${c}`);
    console.log(`   same first 3 chars in 3+ lines: ${sameLead.length ? sameLead.join('  ') : 'none'}`);
    for (const r of rows) {
      const tag = r.ok ? '' : r.rejected ? `  !!REJECTED(${r.rejected})` : `  !!ERROR ${r.error}`;
      console.log(`   #${r.i} ${r.m ? Math.round(r.m.totalMs) : '-'}ms ${r.line}${tag}`);
    }
  }

  if (process.argv.includes('--parallel')) {
    const followups = buildBenchRequests(ctl.signal, pack);
    const lineReqs = buildLineRequests(ctl.signal, 'retry', pack);
    const tLine: number[] = [];
    const tFollow: number[] = [];
    for (let i = 0; i < Math.min(n, 5); i++) {
      const [l, f] = await Promise.allSettled([s2.prepareDoctorLineWithMetrics(lineReqs[i % lineReqs.length]), s2.prepareFollowupWithMetrics(followups[i % followups.length])]);
      if (l.status === 'fulfilled') tLine.push(l.value.metrics.totalMs);
      if (f.status === 'fulfilled') tFollow.push(f.value.metrics.totalMs);
    }
    console.log(`parallel line + follow-up (${tLine.length} pairs): line total p50 ${ms(percentile(tLine, 0.5))} p95 ${ms(percentile(tLine, 0.95))} | follow-up total p50 ${ms(percentile(tFollow, 0.5))} p95 ${ms(percentile(tFollow, 0.95))}`);
  }
  void examples;
  const out = argv('json', '/tmp/cuex-s2-lines.json') as string;
  writeFileSync(out, JSON.stringify(all, null, 1));
  console.log(`full result: ${out}`);
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
