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
