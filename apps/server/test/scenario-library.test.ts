import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { ANSHU_PACK } from '../src/scenario/anshu';
import { LibraryStore } from '../src/library/LibraryStore';
import { LibraryApi } from '../src/library/LibraryApi';
import type { ScenarioGenerator } from '../src/library/ScenarioSynthesizer';
import { WebSocketGateway } from '../src/gateway/WebSocketGateway';
import { createEngines, readConfig } from '../src/config';

const input = { doctorStyle: 'impatient', timeConstraintSec: 45, experienceIds: [] as string[] };
const experience = { scenarioContext: '医生先问适用人群', goldenTactic: '先回应关切，再给资料出处', sourceSeniorRep: '测试团队', antiPatternWarning: '' };
function fixture(generator: ScenarioGenerator) {
  const dir = mkdtempSync(join(tmpdir(), 'cuex-library-test-'));
  const store = new LibraryStore(dir, ANSHU_PACK);
  const observed: string[] = [];
  const ended: string[] = [];
  const gateway = new WebSocketGateway({ pack: ANSHU_PACK, library: new LibraryApi(store, generator), port: 0,
    createEngines: pack => { observed.push(pack.scenario.id); return createEngines(readConfig({}), pack); },
    onSessionEnd: (_, pack) => { ended.push(pack.scenario.id); },
  });
  return { dir, store, gateway, observed, ended };
}
const generator: ScenarioGenerator = { async generate(base, settings, entries) {
  const pack = structuredClone(base); pack.scenario.id = 'synth-test'; pack.scenario.sceneTitle = '测试团队场景';
  pack.scenario.doctor.id = 'dr-synth-test'; pack.scenario.doctor.style = settings.doctorStyle; pack.scenario.expertRules = entries;
  pack.lineExamples.opening = ['先说高龄患者的证据。']; return pack;
} };
const post = (url: string, value: unknown, extra: Record<string, string> = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(value) });

test('experience -> persisted scene -> matching briefing and WebSocket, including after restart', async () => {
  const f = fixture(generator); await f.gateway.start(); const base = `http://127.0.0.1:${f.gateway.port}`;
  let ws: WebSocket | undefined;
  try {
    const e = await post(base + '/api/experiences', experience); assert.equal(e.status, 201); const saved = await e.json() as { id: string };
    const response = await post(base + '/api/scenarios', { ...input, experienceIds: [saved.id] }); assert.equal(response.status, 201);
    const scene = await response.json() as { id: string; experienceCount: number }; assert.equal(scene.experienceCount, 1);
    const restarted = new LibraryStore(f.dir, ANSHU_PACK); assert.equal(restarted.experiences().length, 1); assert.equal(restarted.pack(scene.id)?.scenario.doctor.style, 'impatient');
    const briefing = await fetch(base + '/briefing?scenarioId=' + scene.id); assert.equal(briefing.status, 200);
    assert.equal((await briefing.json() as { facts: unknown[] }).facts.length, ANSHU_PACK.facts.length);
    ws = new WebSocket(`ws://127.0.0.1:${f.gateway.port}/ws/session?scenarioId=${scene.id}`);
    const messages: any[] = []; ws.on('message', data => messages.push(JSON.parse(data.toString())));
    await new Promise<void>(resolve => ws!.once('open', resolve));
    ws.send(JSON.stringify({ type: 'session.start', payload: { scenarioId: scene.id, mode: 'performance' } }));
    for (let n = 0; n < 100 && !messages.some(m => m.type === 'session.ready'); n++) await new Promise(r => setTimeout(r, 10));
    const ready = messages.find(m => m.type === 'session.ready'); assert.equal(ready?.payload.scenario.id, scene.id);
    assert.deepEqual(f.observed, [scene.id]);
    ws.send(JSON.stringify({ type: 'session.stop', payload: { sessionId: ready.payload.sessionId } }));
    for (let n = 0; n < 100 && !f.ended.length; n++) await new Promise(r => setTimeout(r, 10));
    assert.deepEqual(f.ended, [scene.id]);
    ws.send(JSON.stringify({ type: 'session.start', payload: { scenarioId: scene.id, mode: 'performance', retry: { concernId: 'concern-scope' } } }));
    for (let n = 0; n < 100 && messages.filter(m => m.type === 'session.ready').length < 2; n++) await new Promise(r => setTimeout(r, 10));
    assert.equal(messages.filter(m => m.type === 'session.ready').length, 2);
    assert.equal((await fetch(base + '/briefing?scenarioId=missing')).status, 404);
  } finally { ws?.terminate(); await f.gateway.stop(); rmSync(f.dir, { recursive: true }); }
});

test('invalid input, missing experience and failed AI never save a scene or expose the provider error', async () => {
  let calls = 0;
  const f = fixture({ async generate() { calls++; throw new Error('private-provider-detail'); } });
  await f.gateway.start(); const base = `http://127.0.0.1:${f.gateway.port}`;
  try {
    assert.equal((await post(base + '/api/experiences', { ...experience, goldenTactic: '' })).status, 400);
    assert.equal((await post(base + '/api/scenarios', { ...input, experienceIds: ['missing'] })).status, 400);
    assert.equal((await post(base + '/api/scenarios', input, { origin: 'https://untrusted.example' })).status, 403);
    const response = await post(base + '/api/scenarios', input); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private-provider-detail'));
    assert.equal(calls, 1); assert.equal(new LibraryStore(f.dir, ANSHU_PACK).scenarios().length, 1);
  } finally { await f.gateway.stop(); rmSync(f.dir, { recursive: true }); }
});

test('experience added during generation survives the later scene save; damaged storage is not reset', async () => {
  const f = fixture(generator);
  try {
    const first = f.store.addExperience(experience);
    const pending = generator.generate(ANSHU_PACK, input as any, [first], new AbortController().signal);
    f.store.addExperience({ ...experience, scenarioContext: '第二条真实录入' });
    f.store.addScenario(await pending);
    assert.equal(new LibraryStore(f.dir, ANSHU_PACK).experiences().length, 2);
    writeFileSync(join(f.dir, 'library.json'), '{broken');
    assert.throws(() => new LibraryStore(f.dir, ANSHU_PACK), /未覆盖/);
  } finally { rmSync(f.dir, { recursive: true }); }
});

test('two scene connections keep their own engine pack and reject a mismatched start id', async () => {
  const f = fixture(generator); const sockets: WebSocket[] = [];
  try {
    for (const id of ['synth-one', 'synth-two']) { const pack = structuredClone(ANSHU_PACK); pack.scenario.id = id; pack.scenario.doctor.id = 'dr-' + id; f.store.addScenario(pack); }
    await f.gateway.start();
    const tracks = await Promise.all(['synth-one', 'synth-two'].map(async id => {
      const ws = new WebSocket(`ws://127.0.0.1:${f.gateway.port}/ws/session?scenarioId=${id}`); sockets.push(ws);
      const messages: any[] = []; ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
      await new Promise<void>(resolve => ws.once('open', resolve));
      ws.send(JSON.stringify({ type: 'session.start', payload: { scenarioId: id, mode: 'performance' } }));
      for (let n = 0; n < 100 && !messages.some(m => m.type === 'session.ready'); n++) await new Promise(r => setTimeout(r, 10));
      assert.equal(messages.find(m => m.type === 'session.ready')?.payload.scenario.id, id);
      return { ws, messages };
    }));
    assert.deepEqual(new Set(f.observed), new Set(['synth-one', 'synth-two']));
    tracks[0].ws.send(JSON.stringify({ type: 'session.start', payload: { scenarioId: 'synth-two', mode: 'performance' } }));
    for (let n = 0; n < 100 && !tracks[0].messages.some(m => m.type === 'session.error'); n++) await new Promise(r => setTimeout(r, 10));
    assert.equal(tracks[0].messages.find(m => m.type === 'session.error')?.payload.code, 'UNKNOWN_SCENARIO');
    assert.equal(f.gateway.inspectSessions().length, 2);
  } finally { sockets.forEach(ws => ws.terminate()); await f.gateway.stop(); rmSync(f.dir, { recursive: true }); }
});


test('malformed HTTP targets return 400 without dropping a live session', async () => {
  const { request } = await import('node:http');
  const f = fixture(generator); await f.gateway.start();
  const ws = new WebSocket(`ws://127.0.0.1:${f.gateway.port}/ws/session`);
  const messages: any[] = []; ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
  const waitFor = async (predicate: () => boolean) => {
    for (let n = 0; n < 200 && !predicate(); n++) await new Promise(r => setTimeout(r, 10));
    assert.ok(predicate());
  };
  try {
    await new Promise<void>(resolve => ws.once('open', resolve));
    ws.send(JSON.stringify({ type: 'session.start', payload: { scenarioId: ANSHU_PACK.scenario.id, mode: 'performance' } }));
    await waitFor(() => messages.some(m => m.type === 'session.ready'));
    const ready = messages.find(m => m.type === 'session.ready');
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: f.gateway.port, path: '//%', method: 'GET' }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(status, 400);
    assert.equal((await fetch(`http://127.0.0.1:${f.gateway.port}/health`)).status, 200);
    assert.equal(f.gateway.inspectSessions()[0]?.sessionId, ready.payload.sessionId);
    ws.send(JSON.stringify({ type: 'session.stop', payload: { sessionId: ready.payload.sessionId } }));
    await waitFor(() => f.ended.length === 1);
    assert.equal(ws.readyState, WebSocket.OPEN);
  } finally { ws.terminate(); await f.gateway.stop(); rmSync(f.dir, { recursive: true }); }
});

test('synthesis rejects a duration used as a dose but accepts the selected time in seconds', async t => {
  const { Agent } = await import('@earendil-works/pi-agent-core');
  const { ScenarioSynthesizer } = await import('../src/library/ScenarioSynthesizer');
  const savedEnv = { ...process.env };
  process.env.CUEX_S2_BASE_URL = 'http://127.0.0.1:1'; process.env.CUEX_S2_API_KEY = 'test';
  process.env.PRIME_MODELS_JSON = '/tmp/cuex-review-no-models.json';
  let opening = '75 岁以上患者从每日 45 mg 起始。';
  let doctorNote = '这次交流只有 45 秒。';
  t.mock.method(Agent.prototype, 'prompt', async function(this: InstanceType<typeof Agent>) {
    await this.state.tools[0].execute('test', {
      sceneTitle: '45 秒门诊交流', doctorNote, concernIds: ['concern-scope'],
      opening, closing: '谢谢，资料留下，我再核对。', retries: [{ concernId: 'concern-scope', text: '先核对高龄患者的研究结果。' }],
    }, new AbortController().signal);
  });
  const f = fixture(new ScenarioSynthesizer()); await f.gateway.start();
  try {
    const url = `http://127.0.0.1:${f.gateway.port}/api/scenarios`;
    assert.equal((await post(url, input)).status, 503);
    assert.equal(f.store.scenarios().length, 1);
    opening = '我只有 45 秒，先说高龄患者的证据。';
    doctorNote = '高龄患者从每日 45 mg 起始。';
    assert.equal((await post(url, input)).status, 503);
    assert.equal(f.store.scenarios().length, 1);
    doctorNote = '这次交流只有 45 秒。';
    const response = await post(url, input); assert.equal(response.status, 201);
    const saved = await response.json() as { id: string };
    const pack = new LibraryStore(f.dir, ANSHU_PACK).pack(saved.id)!;
    assert.equal(pack.scenario.sceneTitle, '45 秒门诊交流');
    assert.equal(pack.scenario.doctor.note, '这次交流只有 45 秒。');
    assert.deepEqual(pack.lineExamples.opening, [opening]);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
    await f.gateway.stop(); rmSync(f.dir, { recursive: true });
  }
});

test('selected experience, style and time reach normal dialogue and the visit outcome', async () => {
  const { createModels, fauxProvider, fauxAssistantMessage, fauxToolCall } = await import('@earendil-works/pi-ai');
  const { PiSystemTwo } = await import('../src/system2/PiSystemTwo');
  const { createDoctorStore } = await import('../src/system2/doctors');
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider); const model = faux.getModel();
  const runtime = { models, model, providerId: model.provider, modelId: model.id, api: model.api, baseUrl: 'faux://local', backend: 'faux-library', redact: (s: string) => s, listModelIds: () => [model.id] };
  const contexts: string[] = [];
  const rule = '先询问医生希望核对哪一份原始资料';
  const pack = structuredClone(ANSHU_PACK); pack.scenario.id = 'synth-dialogue'; pack.scenario.doctor.id = 'dr-synth-dialogue';
  pack.scenario.doctor.style = 'impatient'; pack.scenario.doctor.timeConstraintSec = 45; pack.scenario.doctor.note = '按资料沟通。';
  pack.scenario.expertRules = [{ id: 'exp-dialogue', sourceSeniorRep: '团队', scenarioContext: '核对资料时', goldenTactic: rule, antiPatternWarning: '' }];
  const dir = mkdtempSync(join(tmpdir(), 'cuex-library-dialogue-'));
  try {
    const store = new LibraryStore(dir, ANSHU_PACK); store.addScenario(pack);
    const savedPack = new LibraryStore(dir, ANSHU_PACK).pack(pack.scenario.id)!;
    const system2 = new PiSystemTwo({ runtime, doctors: createDoctorStore(join(dir, 'doctors')) });
    faux.setResponses([
      context => { contexts.push(JSON.stringify(context)); return fauxAssistantMessage([fauxToolCall('submit_turn', { text: '先看研究原表吧。', action: 'reply', basis: '先核对原始证据。', assessments: [], spokenFactIds: [] })], { stopReason: 'toolUse' }); },
      context => { contexts.push(JSON.stringify(context)); return fauxAssistantMessage([fauxToolCall('submit_outcome', { stance: 'needs_evidence', doctorResponse: '我还需要核对亚组原表。', rationale: '当前证据不足。', strengths: [], gaps: [{ explanation: '需要亚组原表。' }], nextStep: '请补充亚组原表。', factIds: [] })], { stopReason: 'toolUse' }); },
    ]);
    const history = [{ who: 'rep' as const, text: '您想先核对哪份资料？' }];
    const common = { sessionId: 'dialogue', pack: savedPack, history, resolvedPointIds: [], signal: new AbortController().signal };
    const reply = await system2.prepareTurn({ ...common, concernId: 'concern-scope', repSpeech: history[0].text, trigger: 'turn_end', silenceStage: 0 });
    assert.equal(reply.text, '先看研究原表吧。');
    const outcome = await system2.prepareOutcome({ ...common, endReason: 'user_requested' });
    assert.equal(outcome.stance, 'needs_evidence');
    assert.equal(contexts.length, 2);
    for (const context of contexts) { assert.ok(context.includes(rule)); assert.ok(context.includes('时间紧')); assert.ok(context.includes('45')); }
  } finally { rmSync(dir, { recursive: true }); }
});
