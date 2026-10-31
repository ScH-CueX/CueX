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
import type { DoctorLineRequest, FollowupPhase, ScenarioPack } from '../src/contracts';
import { ANSHU_PACK } from '../src/scenario/anshu';
import { loadS2Runtime, type S2Runtime } from '../src/system2/config';
import { createDoctorStore, memoryBullets, recordSessionMemory, type DoctorStore } from '../src/system2/doctors';
import { LI_PACK, buildBenchRequests } from '../src/system2/fixtures';
import { PiSystemTwo } from '../src/system2/PiSystemTwo';
import { stripFiller } from '../src/system2/spoken';

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
    assert.equal(draft.text, '那 eGFR 低于 30 的患者能不能用？', 'the filler 到底 is removed from the spoken line');
    assert.deepEqual(draft.targetPointIds, ['c3']);
    assert.equal(draft.sourceEvidence, '安舒平说明书，禁忌与慎用');
    assert.equal(phases[0][0], 'retrieving');
    const drafting = phases.filter(([p]) => p === 'drafting');
    assert.ok(drafting.length >= 1 && drafting.every(([, t]) => typeof t === 'string'), 'drafting carries the partial text');
    assert.equal(stripFiller(drafting.at(-1)![1]!), draft.text);
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
    assert.match(first, /<你对近来来访代表的印象>[\s\S]*eGFR 低于 30 能不能用，问到了也只答“整体安全”[\s\S]*<\/你对近来来访代表的印象>/);

    // The visit ends: the rep answered the 75+ point and the doctor's prepared follow-up was withdrawn.
    const outcome = {
      concernId: 'concern-scope', resolvedPointIds: ['c1'],
      candidates: [{ draftText: '那 eGFR 低于 30 的患者到底能不能用？', fate: 'withdrawn' as const }],
    };
    assert.equal(await recordSessionMemory(ANSHU_PACK, outcome, store), true);
    const file = join(dir, 'dr-chen', 'MEMORY.md');
    const written = readFileSync(file, 'utf8');
    assert.ok(written.startsWith('# 陈主任对近来来访代表的印象'), 'the header stays');
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
    assert.ok(readFileSync(file, 'utf8').startsWith('# 陈主任对近来来访代表的印象'));

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

  ['a retried concern: the doctor presses on what the rep missed, answers what the rep said, and never sounds scripted', async () => {
    const { faux, rt } = fauxRuntime();
    const s2 = new PiSystemTwo({ runtime: rt, doctors: createDoctorStore(scratchDir('no-doctors')) });
    const ctl = new AbortController();
    const asked = ANSHU_PACK.lineExamples.opening[1];
    const req: DoctorLineRequest = {
      sessionId: 'smoke', pack: ANSHU_PACK, kind: 'retry', concernId: 'concern-scope', signal: ctl.signal,
      missedPointIds: ['c3'],
      history: [
        { who: 'doctor', text: asked },
        { who: 'rep', text: 'eGFR 30 到 60 的亚组有 412 人，降压幅度和总体一致。另外我们还有一项覆盖两万多名患者的真实世界研究。' },
      ],
    };
    const textOf = (m: { content: unknown } | undefined) => {
      const c = m?.content;
      return typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (b && typeof b === 'object' && 'text' in b ? String(b.text) : '')).join('') : '';
    };
    const say = (text: string) => fauxAssistantMessage([fauxToolCall('say', { text })], { stopReason: 'toolUse' });

    // 1) What the model is told, and what comes back.
    let system = '';
    let user = '';
    faux.setResponses([
      (context) => {
        system = textOf(context.messages.find((m) => m.role === 'system'));
        user = textOf([...context.messages].reverse().find((m) => m.role === 'user'));
        return say('真实世界研究先放一边，eGFR 低于 30 的患者到底能不能用？');
      },
    ]);
    const phases: PhaseLog = [];
    const line = await s2.prepareDoctorLine(req, (p, t) => phases.push([p, t]));
    assert.equal(line, '真实世界研究先放一边，eGFR 低于 30 的患者能不能用？');
    assert.equal(faux.state.callCount, 1);
    assert.equal(phases[0][0], 'retrieving');
    assert.equal(stripFiller(phases.filter(([p]) => p === 'drafting').at(-1)?.[1] ?? ''), line);

    const missedSection = user.slice(user.indexOf('【他上一轮没答到的要点】'), user.indexOf('【这次的切入点】'));
    assert.ok(missedSection.includes('eGFR 低于 30'), 'the missed point is in the task');
    assert.ok(!missedSection.includes('eGFR 30–60') && !missedSection.includes('75 岁以上患者'), 'points the rep answered are not pressed again');
    assert.ok(user.includes('412 人') && user.includes('真实世界研究'), 'the rep\'s own words are in the prompt, so the doctor can react to them');
    assert.ok(system.includes('<资料>') && system.includes('说明书不建议使用'), 'the evidence pack is in the prompt');
    assert.ok(/<近来说过的话>[\s\S]*结果先放一放[\s\S]*<\/近来说过的话>/.test(system), 'the line the doctor said last time is marked as already used');

    // 2) A line the doctor must not say is rejected, so the Controller speaks a pack example instead.
    const tryBad = async (bad: string): Promise<Error> => {
      faux.setResponses([say(bad), say(bad)]); // the agent writes a rejected line once more, so the model must fail twice
      return rejects(s2.prepareDoctorLine(req));
    };
    const repeat = await tryBad(asked);
    const earlier = await tryBad('上次你没答清楚，eGFR 低于 30 的患者能用吗？');
    const invented = await tryBad('eGFR 低于 45 的患者能不能用？');
    for (const e of [repeat, earlier, invented]) assert.equal(e.name, 'LineRejectedError');
    assert.match(repeat.message, /repeats/);
    assert.match(earlier.message, /earlier visit/);
    assert.match(invented.message, /number outside the pack: 45/);

    // 3) The next visitor gets a new wording: the line spoken above is now remembered as used.
    faux.setResponses([say('真实世界研究先放一边，eGFR 低于 30 的患者到底能不能用？'), say('真实世界研究先放一边，eGFR 低于 30 的患者到底能不能用？')]);
    assert.match((await rejects(s2.prepareDoctorLine(req))).message, /repeats/);

    // A rejected line is written again once, with the rejected line shown as "do not say this". The visitor never hears a script.
    let redoPrompt = '';
    faux.setResponses([
      say('上次你没答清楚，eGFR 低于 30 的患者能用吗？'),
      (context) => {
        redoPrompt = textOf([...context.messages].reverse().find((m) => m.role === 'user'));
        return say('eGFR 低于 30 这一块，研究里有没有证据？');
      },
    ]);
    const callsBefore = faux.state.callCount;
    const redone = await s2.prepareDoctorLineWithMetrics(req);
    assert.equal(redone.line, 'eGFR 低于 30 这一块，研究里有没有证据？');
    assert.equal(faux.state.callCount - callsBefore, 2);
    assert.equal(redone.metrics.attempts, 2);
    assert.ok(redoPrompt.includes('【上一稿被否掉】') && redoPrompt.includes('提到了上次'), 'the second attempt is told why the first was rejected');

    // A bare last clause is closed with punctuation, so the voice pauses.
    faux.setResponses([say('这个药在 eGFR 低于 30 的患者里到底有没有证据')]);
    assert.equal(await s2.prepareDoctorLine(req), '这个药在 eGFR 低于 30 的患者里有没有证据？');

    // 3b) The visit moves on to the next concern (no missed points): the doctor must see what the rep just answered.
    let moveOn = '';
    faux.setResponses([
      (context) => {
        moveOn = textOf([...context.messages].reverse().find((m) => m.role === 'user'));
        return say('eGFR 低于 30 没有证据，这个我记下了。高龄患者起始剂量要调整吗？');
      },
    ]);
    const next = await s2.prepareDoctorLine({
      ...req, concernId: 'concern-dose', missedPointIds: undefined,
      history: [{ who: 'doctor', text: asked }, { who: 'rep', text: 'eGFR 低于 30 的患者被排除在研究之外，没有证据，说明书不建议使用。' }],
    });
    assert.ok(next.includes('起始剂量'));
    assert.ok(moveOn.includes('高龄起始剂量') && moveOn.includes('被排除在研究之外'), 'the next concern and the rep\'s last answer are both in the task');
    assert.ok(!moveOn.includes('【他上一轮没答到的要点】'), 'a move to the next concern is not a retry of missed points');

    // A curt dismissal is redrafted: the demo does not end by sending the visitor away.
    faux.setResponses([say('资料留下，你先回去吧。'), say('资料留在这儿，我回头再看。')]);
    assert.equal(await s2.prepareDoctorLine({ ...req, kind: 'closing', concernId: 'concern-dose' }), '资料留在这儿，我回头再看。');

    // 3c) The visitor retries the scope concern, but the dialogue ends on the dose exchange. The line must stay on scope.
    const crossReq: DoctorLineRequest = {
      sessionId: 'smoke', pack: ANSHU_PACK, kind: 'retry', concernId: 'concern-scope', missedPointIds: [], signal: ctl.signal,
      history: [
        { who: 'doctor', text: ANSHU_PACK.lineExamples.opening[2] },
        { who: 'rep', text: '75 岁以上的患者约占 11%，eGFR 30 到 60 的亚组有 412 人，eGFR 低于 30 被排除，没有证据。' },
        { who: 'doctor', text: ANSHU_PACK.lineExamples.retry['concern-dose'][0] },
        { who: 'rep', text: '起始剂量请按说明书来，高龄患者从低剂量开始。' },
      ],
    };
    let crossFirst = '';
    let crossRedo = '';
    faux.setResponses([
      (context) => {
        crossFirst = textOf([...context.messages].reverse().find((m) => m.role === 'user'));
        return say('对于刚才的起始剂量，说明书里是怎么规定的？');
      },
      (context) => {
        crossRedo = textOf([...context.messages].reverse().find((m) => m.role === 'user'));
        return say('我换个角度问：高龄、肾功能不好的患者，研究里有他们吗？');
      },
    ]);
    const cross = await s2.prepareDoctorLineWithMetrics(crossReq);
    assert.equal(cross.line, '我换个角度问：高龄、肾功能不好的患者，研究里有他们吗？');
    assert.equal(cross.metrics.attempts, 2);
    assert.match(cross.metrics.redoReason ?? '', /another concern/);
    assert.ok(crossFirst.includes('【这次只问这个关切】“适用范围”') && crossFirst.includes('不要问“高龄起始剂量”'), 'the task names the target concern and forbids the other');
    assert.ok(crossFirst.includes('412 人'), 'the rep\'s answers on the target concern are in the task');
    assert.ok(!crossFirst.includes('从低剂量开始') && !crossFirst.includes(ANSHU_PACK.lineExamples.retry['concern-dose'][0]), 'the dose exchange is not shown as history of the scope concern');
    assert.ok(crossRedo.includes('【上一稿被否掉】') && crossRedo.includes('别的关切'), 'the second try is told it followed the wrong concern');

    // 3d) Ten visitors must not hear the same lead-in: a line that opens like the one before it is written again, and rejected if it still does.
    const leadReq: DoctorLineRequest = {
      ...req, concernId: 'concern-dose', missedPointIds: undefined,
      history: [{ who: 'rep', text: '起始剂量请按说明书来，高龄患者从低剂量开始。' }],
    };
    faux.setResponses([say('你刚才说按说明书来，那高龄患者起始剂量要不要调整？')]);
    assert.ok((await s2.prepareDoctorLine(leadReq)).startsWith('你刚才'));
    faux.setResponses([say('你刚才讲的我记下了，高龄起始剂量怎么调？'), say('你刚才说得很快，高龄起始剂量怎么调？')]);
    const sameLead = await s2.prepareDoctorLineWithMetrics(leadReq);
    assert.equal(sameLead.metrics.attempts, 2, 'the first draft opened like the previous line, so the doctor wrote it again');
    assert.match(sameLead.metrics.redoReason ?? '', /starts like an earlier line/);
    assert.equal(sameLead.line, '你刚才说得很快，高龄起始剂量怎么调？', 'a second try with the same lead-in is spoken, not replaced by a pack example');

    // A line over the limit is written again, not cut; if it is still too long the Controller speaks a pack example.
    faux.setResponses([say(LONG_LINE), say(LONG_LINE)]);
    assert.match((await rejects(s2.prepareDoctorLine(leadReq))).message, /too long/);

    // 4) Cancel works for lines too, and the line agent has its own model call: a follow-up draft in flight does not block it.
    const slow = fauxRuntime(25);
    slow.faux.setResponses([
      fauxAssistantMessage([submit({ basis: '长'.repeat(600) })], { stopReason: 'toolUse' }), // the follow-up draft: slow
      say('先说 eGFR 低于 30 的患者，能不能用？'),                                                  // the line: fast
    ]);
    const both = new PiSystemTwo({ runtime: slow.rt, doctors: createDoctorStore(scratchDir('no-doctors')) });
    const followup = both.prepareFollowup(buildBenchRequests(ctl.signal)[1]);
    followup.catch(() => undefined);
    const t0 = performance.now();
    const quick = await both.prepareDoctorLine({ ...req, history: [{ who: 'rep', text: '我不太确定，回头补充。' }] });
    assert.ok(quick.length > 0);
    assert.ok(performance.now() - t0 < 1500, `the line waited ${Math.round(performance.now() - t0)} ms behind the follow-up`);
    const cancel = new AbortController();
    slow.faux.setResponses([say('先说 eGFR 低于 30 的患者，能不能用？'.repeat(3))]);
    const pending = both.prepareDoctorLine({ ...req, signal: cancel.signal });
    await new Promise((r) => setTimeout(r, 120));
    cancel.abort();
    assert.equal((await rejects(pending)).name, 'AbortError');
  }],

  ['the closing line is written before the last concern is answered: it ends the visit, asks nothing new and claims nothing about the unanswered concern', async () => {
    const { faux, rt } = fauxRuntime();
    const s2 = new PiSystemTwo({ runtime: rt, doctors: createDoctorStore(scratchDir('no-doctors')) });
    const ctl = new AbortController();
    const textOf = (m: { content: unknown } | undefined) => {
      const c = m?.content;
      return typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (b && typeof b === 'object' && 'text' in b ? String(b.text) : '')).join('') : '';
    };
    const say = (text: string) => fauxAssistantMessage([fauxToolCall('say', { text })], { stopReason: 'toolUse' });
    // What the Controller really prefetches: the dialogue stops after the scope concern. The dose concern has not started.
    const req: DoctorLineRequest = {
      sessionId: 'smoke', pack: ANSHU_PACK, kind: 'closing', concernId: 'concern-dose', signal: ctl.signal,
      history: [
        { who: 'doctor', text: ANSHU_PACK.lineExamples.opening[2] },
        { who: 'rep', text: '75 岁以上的患者约占 11%，降压幅度和总体一致。eGFR 低于 30 的患者被排除在研究之外，没有证据，说明书不建议使用。' },
      ],
    };

    // 1) The failure seen in a real rehearsal: a recap of the latest point that never ends the visit. It is written again.
    let redoPrompt = '';
    let firstPrompt = '';
    faux.setResponses([
      (context) => {
        firstPrompt = textOf([...context.messages].reverse().find((m) => m.role === 'user'));
        return say('说明书说 eGFR 低于 30 不能用，这我心里有数了。');
      },
      (context) => {
        redoPrompt = textOf([...context.messages].reverse().find((m) => m.role === 'user'));
        return say('谢谢你跑一趟，资料先留下，我回头自己看。');
      },
    ]);
    const done = await s2.prepareDoctorLineWithMetrics(req);
    assert.equal(done.line, '谢谢你跑一趟，资料先留下，我回头自己看。');
    assert.equal(done.metrics.attempts, 2);
    assert.ok(redoPrompt.includes('没有收尾'), 'the second try is told the first one did not end the visit');
    assert.ok(firstPrompt.includes('可能还没聊完') && firstPrompt.includes('不要提它的内容') && firstPrompt.includes('听出门诊结束了') && firstPrompt.includes('认下'),
      'the task says the last concern is unfinished and that the line must end the visit');

    // 2) Lines the doctor must not say at the end of a visit. Each is tried twice, so the model fails the redo too.
    const bad = async (line: string): Promise<Error> => {
      faux.setResponses([say(line), say(line)]);
      return rejects(s2.prepareDoctorLine(req));
    };
    assert.match((await bad('谢谢，资料留下。高龄患者的剂量要调整吗？')).message, /asks a new question/);
    assert.match((await bad('eGFR 低于 30 我记下了，起始剂量你说要调整，谢谢，资料先留下。')).message, /mentions what was never said/);
    assert.match((await bad('谢谢，今天先到这儿，你先回去吧。')).message, /sends the rep away/);
    assert.match((await bad('谢谢，资料留下，你都说到了。')).message, /judges the answers/);
    assert.match((await bad('谢谢，资料留下，这些情况你都说过了。')).message, /judges the answers/); // claims the rep covered everything, which the closing cannot know

    // 3) A plain, good closing passes at the first try.
    faux.setResponses([say('后面还有病人，今天先到这儿，资料我留着。')]);
    const ok = await s2.prepareDoctorLineWithMetrics(req);
    assert.equal(ok.metrics.attempts, 1);
    assert.ok(ok.line.endsWith('。'));
  }],

  ['filler 到底 and 究竟 are removed from spoken lines, and kept where they are part of the sentence', async () => {
    const { faux, rt } = fauxRuntime();
    const s2 = new PiSystemTwo({ runtime: rt, doctors: createDoctorStore(scratchDir('no-doctors')) });
    const ctl = new AbortController();
    const say = (text: string) => fauxAssistantMessage([fauxToolCall('say', { text })], { stopReason: 'toolUse' });
    const opening: DoctorLineRequest = { sessionId: 'smoke', pack: ANSHU_PACK, kind: 'opening', concernId: 'concern-scope', history: [], signal: ctl.signal };
    faux.setResponses([say('我门诊高龄患者多，这药究竟能用在谁身上？')]);
    assert.equal(await s2.prepareDoctorLine(opening), '我门诊高龄患者多，这药能用在谁身上？');
    for (const [spoken, expected] of [
      ['这药到底能用在谁身上？', '这药能用在谁身上？'],
      ['研究里究竟有多少人？', '研究里有多少人？'],
      ['到底怎么办？', '怎么办？'],
      ['这件事我会坚持到底。', '这件事我会坚持到底。'],
      ['我想问个究竟。', '我想问个究竟。'],
      ['那我就一探究竟，资料先留下。', '那我就一探究竟，资料先留下。'],
    ]) assert.equal(stripFiller(spoken), expected);
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

    ['live: the time-pressed doctor asks shorter follow-ups than 陈主任 in the same situations', async () => {
      const rt = loadS2Runtime();
      const ask = async (pack: ScenarioPack) => {
        const ctl = new AbortController();
        const s2 = new PiSystemTwo({ runtime: rt, doctors: realDoctors });
        const reqs = buildBenchRequests(ctl.signal, pack);
        const out: string[] = [];
        for (let i = 0; i < 2 * reqs.length; i++) out.push((await s2.prepareFollowup(reqs[i % reqs.length])).text);
        return out;
      };
      // The two doctors work at the same time, as in a busy hall. Each asks every situation twice, because one pair of lines is too noisy to compare.
      const [chen, li] = await Promise.all([ask(ANSHU_PACK), ask(LI_PACK)]);
      const mean = (xs: string[]) => xs.reduce((a, x) => a + x.length, 0) / xs.length;
      console.log(`      陈主任 (avg ${mean(chen).toFixed(1)} chars): ${chen.slice(0, 3).join(' | ')}\n      李医生 (avg ${mean(li).toFixed(1)} chars): ${li.slice(0, 3).join(' | ')}`);
      assert.ok(Math.max(...li.map((x) => x.length)) <= 32, '李医生 asks in one very short line');
      assert.ok(mean(li) < mean(chen), `李医生 (${mean(li).toFixed(1)} chars on average) should be shorter than 陈主任 (${mean(chen).toFixed(1)})`);
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
    catch (e) {
      failed++;
      const where = (e as Error).stack?.split('\n').find((l) => l.includes('s2-smoke.ts'))?.trim() ?? '';
      console.log(`FAIL  ${name}\n      ${(e as Error).message.split('\n').join('\n      ')}\n      at ${where}`);
    }
  }
  console.log(`${scenarios.length - failed}/${scenarios.length} passed`);
  rmSync(SCRATCH_ROOT, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
main();
