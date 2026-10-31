/**
 * System 2 feature tests. Each scenario drives one behavior the demo depends on, through the real Pi agent loop,
 * the real tools and the real doctor files. Nothing here tests a helper on its own.
 *
 *   Offline (scripted model, no network, no key):
 *     cd apps/server && PATH=/opt/homebrew/opt/node@22/bin:$PATH npx tsx scripts/s2-smoke.ts
 *   Live (real provider from models.json or CUEX_S2_* env; about 8 small requests):
 *     cd apps/server && PATH=/opt/homebrew/opt/node@22/bin:$PATH npx tsx scripts/s2-smoke.ts --live
 *
 * Exit code 0 when every scenario passes. MEMORY.md files in the repo are never written: every scenario that
 * writes works on a copy in a temp directory.
 */
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall, type Api, type Model } from '@earendil-works/pi-ai';
import type { FollowupPhase, ScenarioPack } from '../src/contracts';
import { ANSHU_PACK } from '../src/scenario/anshu';
import { loadS2Runtime, type S2Runtime } from '../src/system2/config';
import { createDoctorStore, memoryBullets, recordSessionMemory, type DoctorStore } from '../src/system2/doctors';
import { LI_PACK, buildBenchRequests } from '../src/system2/fixtures';
import { PiSystemTwo } from '../src/system2/PiSystemTwo';

type PhaseLog = Array<[FollowupPhase, string | undefined]>;
type Scenario = [name: string, run: () => Promise<void>];

const FAKE_KEY = 'sk-smoke-0123456789abcdef';
const SCRATCH_ROOT = mkdtempSync(join(tmpdir(), 'cuex-s2-smoke-'));
process.env.CUEX_AGENTS_DIR = join(SCRATCH_ROOT, 'unused-default-store');
const REAL_AGENTS_DIR = new URL('../agents/doctors', import.meta.url).pathname;

function scratchDir(name: string): string {
  const dir = join(SCRATCH_ROOT, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** A scripted model behind the same Models collection and Agent loop the real provider uses. */
function fauxRuntime(tokensPerSecond?: number) {
  const faux = fauxProvider({ tokensPerSecond });
  const models = createModels();
  models.setProvider(faux.provider);
  const model = faux.getModel() as Model<Api>;
  const rt: S2Runtime = {
    models, model, providerId: model.provider, modelId: model.id, api: model.api, baseUrl: 'faux://local',
    backend: 'faux', redact: (t) => t.split(FAKE_KEY).join('***'), listModelIds: () => [model.id],
  };
  return { faux, rt };
}

const submit = (over: Record<string, unknown> = {}) =>
  fauxToolCall('submit_followup', {
    text: '那 eGFR 低于 30 的患者到底能不能用？', basis: '代表还没回答重度肾功能', triggerCondition: '代表仍未提到 eGFR 低于 30',
    targetPointIds: ['c3'], factIds: ['f-egfr-lt30'], ...over,
  });

async function rejects(p: Promise<unknown>): Promise<Error> {
  try { await p; } catch (e) { return e as Error; }
  throw new Error('expected a rejection');
}

/** Runs one follow-up request for the pack's doctor and returns the system prompt the model received. */
async function promptSeenByModel(pack: ScenarioPack, doctors: DoctorStore, afterSessionStart?: () => void): Promise<string> {
  const { faux, rt } = fauxRuntime();
  let prompt = '';
  faux.setResponses([
    (context) => {
      const sys = context.messages.find((m) => m.role === 'system');
      const c = sys && 'content' in sys ? sys.content : '';
      prompt = typeof c === 'string' ? c : c.map((b) => b.text).join('');
      return fauxAssistantMessage([submit()], { stopReason: 'toolUse' });
    },
  ]);
  const s2 = new PiSystemTwo({ runtime: rt, doctors }); // a new PiSystemTwo is a new session
  afterSessionStart?.();
  const ctl = new AbortController();
  await s2.prepareFollowup(buildBenchRequests(ctl.signal, pack)[1]);
  return prompt;
}

const LONG_LINE = '那么请问您能不能详细说明一下，在这项研究当中，七十五岁以上并且肾功能 eGFR 低于 30 的患者到底有多少人，结论能不能用在他们身上？';

const offline: Scenario[] = [
  ['follow-up is prepared in the background: phases, spoken line, targets, evidence', async () => {
    const { faux, rt } = fauxRuntime();
    const ctl = new AbortController();
    const req = buildBenchRequests(ctl.signal)[1]; // the rep already answered c1; c2 and c3 are open
    const s2 = new PiSystemTwo({ runtime: rt, doctors: createDoctorStore(scratchDir('no-doctors')) });

    // The model names a resolved point (c1), an unknown point (zz) and an unknown fact. Only valid open points may stay.
    faux.setResponses([fauxAssistantMessage([submit({ targetPointIds: ['c3', 'c1', 'zz'], factIds: ['f-egfr-lt30', 'nope'] })], { stopReason: 'toolUse' })]);
    const phases: PhaseLog = [];
    const { draft, metrics } = await s2.prepareFollowupWithMetrics(req, (p, t) => phases.push([p, t]));
    assert.equal(draft.text, '那 eGFR 低于 30 的患者到底能不能用？');
    assert.deepEqual(draft.targetPointIds, ['c3']);
    assert.equal(draft.sourceEvidence, '安舒平说明书，禁忌与慎用');
    assert.equal(phases[0][0], 'retrieving');
    const drafting = phases.filter(([p]) => p === 'drafting');
    assert.ok(drafting.length >= 1 && drafting.every(([, t]) => typeof t === 'string'), 'drafting carries the partial text');
    assert.equal(drafting.at(-1)![1], draft.text);
    assert.ok(!phases.slice(1).some(([p]) => p === 'retrieving'), 'inline mode never goes back to retrieving');
    assert.equal(faux.state.callCount, 1, 'inline mode needs one model call');
    assert.ok(metrics.ttftMs !== null && metrics.ttftMs <= metrics.totalMs);

    // A model that talks too much: the doctor still says one short line.
    assert.ok(LONG_LINE.length > 48);
    faux.setResponses([fauxAssistantMessage([submit({ text: LONG_LINE })], { stopReason: 'toolUse' })]);
    const long = await s2.prepareFollowup(req);
    assert.ok(long.text.length >= 12 && long.text.length <= 48, `spoken line length ${long.text.length}`);

    // A model that ignores the tool and answers in plain text: the demo still gets a draft.
    faux.setResponses([fauxAssistantMessage([fauxText('那 eGFR 低于 30 的患者能用吗？')])]);
    const plain = await s2.prepareFollowup(req);
    assert.equal(plain.text, '那 eGFR 低于 30 的患者能用吗？');
    assert.deepEqual(plain.targetPointIds, req.unresolvedPointIds);
    assert.equal(plain.basis, req.reason);
  }],

  ['the doctor can look up the evidence pack with a tool before drafting', async () => {
    const { faux, rt } = fauxRuntime();
    const ctl = new AbortController();
    const req = buildBenchRequests(ctl.signal)[2];
    let toolText = '';
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('lookup_facts', { query: 'eGFR 低于 30' })], { stopReason: 'toolUse' }),
      (context) => {
        const tr = [...context.messages].reverse().find((m) => m.role === 'toolResult');
        if (tr && tr.role === 'toolResult') toolText = tr.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
        return fauxAssistantMessage([submit()], { stopReason: 'toolUse' });
      },
    ]);
    const phases: PhaseLog = [];
    const s2 = new PiSystemTwo({ runtime: rt, retrieval: 'tool', doctors: createDoctorStore(scratchDir('no-doctors')) });
    const { draft, metrics } = await s2.prepareFollowupWithMetrics(req, (p, t) => phases.push([p, t]));
    assert.deepEqual(metrics.toolCalls, ['lookup_facts', 'submit_followup']);
    assert.ok(toolText.includes('f-egfr-lt30'), `the model should receive the matching fact, got: ${toolText}`);
    assert.equal(phases[0][0], 'retrieving');
    assert.ok(phases.some(([p]) => p === 'drafting'));
    assert.deepEqual(draft.targetPointIds, ['c3']);
  }],

  ['the rep answers while the follow-up is being prepared: the request is cancelled', async () => {
    const { faux, rt } = fauxRuntime(25);
    const ctl = new AbortController();
    const req = buildBenchRequests(ctl.signal)[1];
    faux.setResponses([fauxAssistantMessage([submit({ basis: '长'.repeat(600) })], { stopReason: 'toolUse' })]);
    const phases: PhaseLog = [];
    const p = new PiSystemTwo({ runtime: rt, doctors: createDoctorStore(scratchDir('no-doctors')) }).prepareFollowup(req, (ph, t) => phases.push([ph, t]));
    await new Promise((r) => setTimeout(r, 250));
    const seen = phases.length;
    assert.ok(seen > 0, 'the draft was under way');
    const t0 = performance.now();
    ctl.abort();
    const e = await rejects(p);
    assert.equal(e.name, 'AbortError');
    assert.ok(performance.now() - t0 < 500, `abort took ${Math.round(performance.now() - t0)} ms`);
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(phases.length, seen, 'no phase events after the cancel');

    // A request that arrives already cancelled never reaches the model.
    const calls = faux.state.callCount;
    const late = await rejects(new PiSystemTwo({ runtime: rt, doctors: createDoctorStore(scratchDir('no-doctors')) }).prepareFollowup(buildBenchRequests(ctl.signal)[1]));
    assert.equal(late.name, 'AbortError');
    assert.equal(faux.state.callCount, calls);
  }],

  ['a doctor remembers earlier visits, and the profile shapes what the model is told', async () => {
    const dir = scratchDir('doctors');
    cpSync(REAL_AGENTS_DIR, dir, { recursive: true }); // the seed files as shipped, in a copy
    const store = createDoctorStore(dir);

    // Visit 1 with 陈主任: profile and the memory of earlier visits are in the prompt.
    const first = await promptSeenByModel(ANSHU_PACK, store);
    assert.match(first, /<人物档案>[\s\S]*120 秒[\s\S]*<\/人物档案>/);
    assert.match(first, /<往次拜访的记忆>[\s\S]*上次没说清 eGFR 低于 30[\s\S]*<\/往次拜访的记忆>/);

    // The visit ends: the rep answered the 75+ point and the doctor's prepared follow-up was withdrawn.
    const outcome = {
      concernId: 'concern-scope', resolvedPointIds: ['c1'],
      candidates: [{ draftText: '那 eGFR 低于 30 的患者到底能不能用？', fate: 'withdrawn' as const }],
    };
    assert.equal(await recordSessionMemory(ANSHU_PACK, outcome, store), true);
    const file = join(dir, 'dr-chen', 'MEMORY.md');
    const written = readFileSync(file, 'utf8');
    assert.ok(written.startsWith('# 陈主任对这位代表的记忆'), 'the header stays');
    assert.match(written, /适用范围：75 岁以上患者，答清楚了/);
    assert.match(written, /适用范围：eGFR 30 到 60、eGFR 低于 30，没答到/);
    assert.ok(!written.includes('好的陈主任'), 'the rep\'s own words are not stored');

    // Visit 2 (a new session) already knows how visit 1 went.
    const second = await promptSeenByModel(ANSHU_PACK, store);
    assert.match(second, /适用范围：eGFR 30 到 60、eGFR 低于 30，没答到/);

    // A busy practice does not grow the file without limit.
    for (let i = 0; i < 10; i++) await recordSessionMemory(ANSHU_PACK, outcome, store);
    const bullets = readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('- '));
    assert.equal(bullets.length, 20);
    assert.ok(readFileSync(file, 'utf8').startsWith('# 陈主任对这位代表的记忆'));

    // 李医生 is another person: his own profile, none of 陈主任's memory.
    const li = await promptSeenByModel(LI_PACK, store);
    assert.match(li, /45 秒/);
    assert.ok(li.includes('降压幅度是多少毫米汞柱'));
    assert.ok(!li.includes('120 秒') && !li.includes('适用范围：'), 'no content from 陈主任');
    assert.ok(memoryBullets(store.loadDoctor('dr-li').memory).length >= 2);

    // Files are read when the session starts, never while the live loop runs.
    const live = await promptSeenByModel(ANSHU_PACK, store, () => rmSync(dir, { recursive: true, force: true }));
    assert.match(live, /<人物档案>[\s\S]*120 秒/);
  }],

  ['a failing or hung model fails fast, and the API key never appears in the error', async () => {
    const ctl = new AbortController();
    const req = buildBenchRequests(ctl.signal)[1];
    const doctors = createDoctorStore(scratchDir('no-doctors'));

    const broken = fauxRuntime();
    const bad = () => fauxAssistantMessage('', { stopReason: 'error', errorMessage: `401 invalid key ${FAKE_KEY}` });
    broken.faux.setResponses([bad(), bad(), bad(), bad()]);
    const failed = await rejects(new PiSystemTwo({ runtime: broken.rt, doctors }).prepareFollowup(req));
    assert.match(failed.message, /failed/);
    assert.ok(!failed.message.includes(FAKE_KEY), 'key leaked into the error text');

    const slow = fauxRuntime(25);
    slow.faux.setResponses([fauxAssistantMessage([submit({ basis: '长'.repeat(600) })], { stopReason: 'toolUse' })]);
    const t0 = performance.now();
    const timedOut = await rejects(new PiSystemTwo({ runtime: slow.rt, doctors, timeoutMs: 200 }).prepareFollowup(req));
    assert.notEqual(timedOut.name, 'AbortError', 'a timeout is not a cancel: the Controller must be able to tell them apart');
    assert.match(timedOut.message, /timed out/);
    assert.ok(performance.now() - t0 < 1500);
  }],
];

function live(): Scenario[] {
  const realDoctors = createDoctorStore(REAL_AGENTS_DIR); // read only
  return [
    ['live: the default model prepares grounded follow-ups in time', async () => {
      const rt = loadS2Runtime();
      const s2 = new PiSystemTwo({ runtime: rt, doctors: realDoctors });
      const ctl = new AbortController();
      const reqs = buildBenchRequests(ctl.signal);
      const warm: number[] = [];
      for (const i of [0, 1, 2]) { // the first request opens the connection, so only the next two are timed
        const phases: PhaseLog = [];
        const { draft, metrics } = await s2.prepareFollowupWithMetrics(reqs[i], (p, t) => phases.push([p, t]));
        console.log(`      #${i} ${Math.round(metrics.totalMs)} ms (ttft ${Math.round(metrics.ttftMs ?? -1)}) [${draft.targetPointIds}] ${draft.text}`);
        assert.ok(draft.text.length > 0 && draft.text.length <= 48);
        assert.equal(phases[0][0], 'retrieving');
        assert.ok(phases.some(([p, t]) => p === 'drafting' && t), 'a drafting phase with text');
        assert.ok(draft.targetPointIds.every((id) => reqs[i].unresolvedPointIds.includes(id)));
        assert.ok(metrics.grounded, `numbers outside the pack: ${metrics.ungroundedNumbers}`);
        if (i > 0) warm.push(metrics.totalMs);
      }
      assert.ok(Math.max(...warm) < 4000, `warm drafts took ${warm.map(Math.round)} ms`);
    }],

    ['live: the same situation gets a different follow-up from a different doctor', async () => {
      const rt = loadS2Runtime();
      const ask = async (pack: ScenarioPack) => {
        const ctl = new AbortController();
        const s2 = new PiSystemTwo({ runtime: rt, doctors: realDoctors });
        const out: string[] = [];
        for (const i of [0, 3]) out.push((await s2.prepareFollowup(buildBenchRequests(ctl.signal, pack)[i])).text);
        return out;
      };
      const [chen, li] = [await ask(ANSHU_PACK), await ask(LI_PACK)];
      console.log(`      陈主任: ${chen.join(' | ')}\n      李医生: ${li.join(' | ')}`);
      const longest = (xs: string[]) => Math.max(...xs.map((x) => x.length));
      const total = (xs: string[]) => xs.reduce((a, x) => a + x.length, 0);
      assert.ok(longest(li) <= 30, `李医生 asks in one very short line, got ${longest(li)} characters`);
      assert.ok(total(li) < total(chen), `李医生 (${total(li)} chars) should be shorter than 陈主任 (${total(chen)} chars)`);
    }],

    ['live: the rep answers while the model is working: cancel is immediate', async () => {
      const rt = loadS2Runtime();
      const ctl = new AbortController();
      const p = new PiSystemTwo({ runtime: rt, doctors: realDoctors }).prepareFollowup(buildBenchRequests(ctl.signal)[0]);
      await new Promise((r) => setTimeout(r, 300));
      const t0 = performance.now();
      ctl.abort();
      const e = await rejects(p);
      const ms = Math.round(performance.now() - t0);
      console.log(`      cancel settled in ${ms} ms`);
      assert.equal(e.name, 'AbortError');
      assert.ok(ms < 800, `cancel took ${ms} ms`);
    }],

    ['live: a wrong API key fails fast and is not printed', async () => {
      const wrong = 'sk-invalid-smoke-key-000000';
      const rt = loadS2Runtime({ env: { ...process.env, CUEX_S2_API_KEY: wrong } });
      const ctl = new AbortController();
      const t0 = performance.now();
      const e = await rejects(new PiSystemTwo({ runtime: rt, doctors: realDoctors, timeoutMs: 8000 }).prepareFollowup(buildBenchRequests(ctl.signal)[0]));
      const ms = Math.round(performance.now() - t0);
      console.log(`      rejected in ${ms} ms: ${e.message.slice(0, 120)}`);
      assert.ok(!e.message.includes(wrong));
      assert.ok(ms < 5000);
    }],
  ];
}

async function main() {
  const scenarios = [...offline, ...(process.argv.includes('--live') ? live() : [])];
  let failed = 0;
  for (const [name, run] of scenarios) {
    try { await run(); console.log(`PASS  ${name}`); }
    catch (e) { failed++; console.log(`FAIL  ${name}\n      ${(e as Error).message.split('\n').join('\n      ')}`); }
  }
  console.log(`${scenarios.length - failed}/${scenarios.length} passed`);
  rmSync(SCRATCH_ROOT, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
main();
