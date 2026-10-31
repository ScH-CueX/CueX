import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { WebSocket } from 'ws';
import type { ServerMessage } from '@cuex/protocol';
import { WebSocketGateway } from '../src/gateway/WebSocketGateway';
import { FakeSystemOne, FakeSystemTwo, TextOnlyAsr, SilentTts } from '../src/fakes/engines';
import { ANSHU_PACK } from '../src/scenario/anshu';

type Predicate = (event: ServerMessage) => boolean;
const isPhase = (phase: string): Predicate => (event) => event.type === 'system2.candidate' && event.payload.candidate.phase === phase;

async function setup(overrides: Partial<import('../src/gateway/WebSocketGateway').GatewayOptions> = {}, waitOpening = true) {
  const gateway = new WebSocketGateway({
    port: 0,
    host: '127.0.0.1',
    pack: ANSHU_PACK,
    createEngines: async () => {
      if (process.env.CUEX_TEST_REAL_S2 === '1') {
        const { createEngines, readConfig } = await import('../src/config');
        return createEngines({ ...readConfig(), system1: 'real', system2: 'real', asr: 'fake', tts: 'fake' }, ANSHU_PACK);
      }
      return { system1: new FakeSystemOne(), system2: new FakeSystemTwo(35), asr: new TextOnlyAsr(), tts: new SilentTts() };
    },
    controller: { debounceMs: 5, minDriftMs: 0, minDriftChars: 30, candidateHoldMs: 120, minInterruptGapMs: 0 },
    ...overrides,
  });
  await gateway.start();
  const ws = new WebSocket(`ws://127.0.0.1:${gateway.port}/ws/session`);
  const events: ServerMessage[] = [];
  const pending = new Set<{ predicate: Predicate; resolve: (event: ServerMessage) => void }>();
  ws.on('message', (raw) => {
    const event = JSON.parse(raw.toString()) as ServerMessage;
    events.push(event);
    for (const waiter of pending) if (waiter.predicate(event)) { pending.delete(waiter); waiter.resolve(event); }
  });
  await once(ws, 'open');
  function waitFor(predicate: Predicate, from = 0, timeoutMs = process.env.CUEX_TEST_REAL_S2 === '1' ? 20000 : 2500): Promise<ServerMessage> {
    const existing = events.slice(from).find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(waiter); reject(new Error(`Event timeout: ${events.map(e => e.type === 'system2.candidate' ? e.type + ':' + e.payload.candidate.phase : e.type).join(', ')}`)); }, timeoutMs);
      const waiter = { predicate, resolve: (event: ServerMessage) => { clearTimeout(timer); resolve(event); } };
      pending.add(waiter);
    });
  }
  const send = (type: string, payload: unknown) => ws.send(JSON.stringify({ type, payload }));
  send('session.start', { scenarioId: ANSHU_PACK.scenario.id, mode: 'performance' });
  await waitFor(e => e.type === 'session.ready');
  if (waitOpening) await waitFor(e => e.type === 'controller.dispatch' && e.payload.pose === 'listening');
  async function speech(text: string, isFinal = false) {
    const from = events.length;
    send('speech.delta', { text, isFinal });
    await waitFor(e => e.type === 'system1.verdict', from);
  }
  return { gateway, ws, events, waitFor, send, speech, close: async () => { ws.close(); await gateway.stop(); } };
}

async function drift(h: Awaited<ReturnType<typeof setup>>) {
  await h.speech('主要终点是十二周时的诊室收缩压，多降了6.2毫米汞柱，');
  assert.equal(h.events.filter(isPhase('retrieving')).length, 0, 'one sentence must not trigger preparation');
  await h.speech('而且不良反应发生率与安慰剂相当，我们还有华东地区上市后的结果，');
  await h.waitFor(isPhase('ready'));
}

test('continued pitch prepares, rechecks and interrupts before final speech', async () => {
  const h = await setup();
  try {
    await drift(h);
    await h.waitFor(e => e.type === 'controller.dispatch' && e.payload.action.type === 'interrupt_speak' && !!e.payload.action.candidateId);
    await h.waitFor(isPhase('spoken'));
    await h.waitFor(e => e.type === 'tts.stream_chunk' && e.payload.isLastChunk && h.events.some(isPhase('spoken')));
    const phases = h.events.filter(e => e.type === 'system2.candidate').map(e => e.payload.candidate.phase).filter((phase, index, all) => index === 0 || phase !== all[index - 1]);
    assert.deepEqual(phases, ['retrieving', 'drafting', 'ready', 'spoken']);
    const readyIndex = h.events.findIndex(isPhase('ready'));
    const spokenIndex = h.events.findIndex(isPhase('spoken'));
    assert(h.events.slice(readyIndex + 1, spokenIndex).some(e => e.type === 'system1.verdict'), 'must re-run System 1 just before speaking');
    const cutoff = h.events.findIndex(e => e.type === 'asr.transcript' && e.payload.speaker === 'rep' && e.payload.isFinal);
    assert(cutoff > readyIndex, 'controller closes the interrupted rep partial only after candidate readiness');
    assert.equal(h.gateway.inspectSessions()[0].history.filter(t => t.who === 'rep').length, 1);
    assert(h.events.some(e => e.type === 'tts.stream_chunk' && e.payload.isLastChunk));
    assert(h.events.some(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.isFinal));
    const stats = h.gateway.inspectSessions()[0];
    assert.equal(stats.candidates[0].fate, 'asked');
    console.log(JSON.stringify({ flow: 'interrupt', eventCount: h.events.length, readyToInterruptMs: h.events[spokenIndex].type === 'system2.candidate' ? h.events[spokenIndex].payload.candidate.decidedAtMs! - h.events[spokenIndex].payload.candidate.readyAtMs! : 0 }));
  } finally { await h.close(); }
});

test('ready candidate is withdrawn as soon as rep starts responding; never enters dialogue', async () => {
  const h = await setup();
  try {
    await drift(h);
    const ready = h.events.find(isPhase('ready'));
    assert(ready?.type === 'system2.candidate');
    await h.speech('我先回答您的人群问题，');
    await h.waitFor(isPhase('withdrawn'));
    await h.waitFor(e => e.type === 'controller.dispatch' && e.payload.action.type === 'withdraw_question' && e.payload.pose === 'withdrawing');
    assert(!h.events.some(isPhase('spoken')));
    assert(!h.gateway.inspectSessions()[0].history.some(t => t.who === 'doctor' && t.text.includes(ready.payload.candidate.draftText)));
    await h.speech('75岁以上患者约占11%，eGFR在30到60的亚组有412人，降压幅度与总体一致。', true);
    await h.speech('eGFR低于30的患者被排除，没有证据，说明书不建议使用。', true);
    await h.waitFor(e => e.type === 'controller.dispatch' && e.payload.concernProgress.concernId === 'concern-dose');
    assert.equal(h.events.filter(isPhase('retrieving')).length, 1);
  } finally { await h.close(); }
});

test('direct answers resolve separate concern points without preparing a candidate', async () => {
  const h = await setup();
  try {
    await h.speech('75岁以上患者约占11%，降压幅度与总体一致。', true);
    assert(h.events.some(e => e.type === 'system1.verdict' && e.payload.resolvedPointIds.includes('c1') && !e.payload.resolvedPointIds.includes('c3')));
    await h.speech('eGFR30到60的亚组有412人，结果与总体一致。', true);
    await h.speech('eGFR低于30被排除在研究外，没有证据，说明书不建议使用。', true);
    await h.waitFor(e => e.type === 'controller.dispatch' && e.payload.concernProgress.concernId === 'concern-dose');
    assert.equal(h.events.filter(e => e.type === 'system2.candidate').length, 0);
    assert(h.events.some(e => e.type === 'controller.dispatch' && e.payload.concernProgress.concernId === 'concern-scope' && e.payload.concernProgress.isFullyResolved));
    const repFinals = h.events.filter(e => e.type === 'asr.transcript' && e.payload.speaker === 'rep' && e.payload.isFinal);
    assert.equal(repFinals.length, 3);
  } finally { await h.close(); }
});

test('gateway isolates concurrent sessions', async () => {
  const h = await setup();
  const second = new WebSocket(`ws://127.0.0.1:${h.gateway.port}/ws/session`);
  try {
    const secondEvents: ServerMessage[] = [];
    second.on('message', raw => secondEvents.push(JSON.parse(raw.toString())));
    await once(second, 'open');
    second.send(JSON.stringify({ type: 'session.start', payload: { scenarioId: ANSHU_PACK.scenario.id, mode: 'performance' } }));
    while (!secondEvents.some(e => e.type === 'session.ready')) await new Promise<void>(resolve => setImmediate(resolve));
    await h.speech('75岁以上患者约占11%。', true);
    const sessions = h.gateway.inspectSessions();
    assert.equal(sessions.length, 2);
    assert.notEqual(sessions[0].sessionId, sessions[1].sessionId);
    assert(sessions[0].resolvedPointIds.includes('c1'));
    assert.deepEqual(sessions[1].resolvedPointIds, []);
  } finally { second.close(); await h.close(); }
});

test('a substantive answer in one point does not resolve other renal points', async () => {
  const h = await setup();
  try {
    await h.speech('eGFR30到60亚组有412人。', true);
    const snapshot = h.gateway.inspectSessions()[0];
    assert.deepEqual(snapshot.resolvedPointIds, ['c2']);
    await h.speech('我会接下来回答eGFR低于30的患者。', true);
    assert.deepEqual(h.gateway.inspectSessions()[0].resolvedPointIds, ['c2']);
    assert.equal(h.events.filter(e => e.type === 'system2.candidate').length, 0);
  } finally { await h.close(); }
});


test('stopped before first completed chunk removes doctor line from actual dialogue', async () => {
  const h = await setup();
  try {
    const ready = h.events.find(e => e.type === 'session.ready');
    const audio = h.events.find(e => e.type === 'tts.stream_chunk');
    assert(ready?.type === 'session.ready' && audio?.type === 'tts.stream_chunk');
    assert.equal(ready.payload.scenario.id, ANSHU_PACK.scenario.id);
    const from = h.events.length;
    h.send('tts.playback', { sessionId: ready.payload.sessionId, utteranceId: audio.payload.utteranceId, completedChunks: 0, playedMs: 50, status: 'stopped' });
    await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.text === '', from);
    assert.equal(h.gateway.inspectSessions()[0].history.length, 0);
  } finally { await h.close(); }
});


test('ASR revision retracts provisional progress and a delayed old stop cannot end the current visit', async () => {
  let callbacks!: import('../src/contracts').AsrCallbacks;
  const h = await setup({ createEngines: () => ({ system1: new FakeSystemOne(), system2: new FakeSystemTwo(30), tts: new SilentTts(), asr: { backend: 'controlled-asr', async open(_opts, cb) { callbacks = cb; return { write() {}, end() {} }; } } }) });
  try {
    h.send('audio.chunk', { format: 'pcm16', sampleRate: 16000, channels: 1, data: Buffer.alloc(4).toString('base64'), timestamp: Date.now() });
    while (!callbacks) await new Promise<void>(resolve => setImmediate(resolve));
    let from = h.events.length;
    callbacks.onPartial('75岁以上约占11%。');
    await h.waitFor(e => e.type === 'system1.verdict' && e.payload.resolvedPointIds.includes('c1'), from);
    from = h.events.length;
    callbacks.onFinal('75岁以上患者人数不详。');
    await h.waitFor(e => e.type === 'controller.dispatch' && e.payload.concernProgress.resolvedCount === 0, from);
    assert.deepEqual(h.gateway.inspectSessions()[0].resolvedPointIds, []);
    from = h.events.length;
    callbacks.onPartial('eGFR30到60亚组有412人。');
    await h.waitFor(e => e.type === 'system1.verdict' && e.payload.resolvedPointIds.includes('c2'), from);
    from = h.events.length;
    callbacks.onFinal('');
    await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'rep' && e.payload.isFinal && e.payload.text === '', from);
    await h.waitFor(e => e.type === 'controller.dispatch' && e.payload.concernProgress.resolvedCount === 0, from);
    assert.deepEqual(h.gateway.inspectSessions()[0].resolvedPointIds, []);
    h.send('session.stop', { sessionId: 'a-previous-session' });
    await h.speech('我先回答您的人群问题。', true);
    assert.equal(h.gateway.inspectSessions().length, 1);
  } finally { await h.close(); }
});

test('rep answer cancels a doctor opening that has not reached audio yet', async () => {
  let release!: () => void;
  const h = await setup({ createEngines: () => ({ system1: new FakeSystemOne(), system2: new FakeSystemTwo(20), asr: new TextOnlyAsr(), tts: { backend: 'slow-tts', async *synthesize(text, signal) { await new Promise<void>(resolve => { release = resolve; }); signal.throwIfAborted(); yield* new SilentTts().synthesize(text, signal); } } }) }, false);
  try {
    while (!release) await new Promise<void>(resolve => setImmediate(resolve));
    await h.speech('75岁以上约占11%。', true);
    await h.waitFor(e => e.type === 'tts.abort');
    release();
    await h.speech('我先回答肾功能问题。', true);
    assert(!h.events.some(e => e.type === 'tts.stream_chunk'));
    assert(!h.gateway.inspectSessions()[0].history.some(t => t.who === 'doctor'));
  } finally { await h.close(); }
});

test('self-correction during slow TTS preparation withdraws instead of playing a stale question', async () => {
  let release!: () => void;
  let ttsCalls = 0;
  const silent = new SilentTts();
  const h = await setup({ createEngines: () => ({ system1: new FakeSystemOne(), system2: new FakeSystemTwo(10), asr: new TextOnlyAsr(), tts: { backend: 'delayed-followup', async *synthesize(text, signal) { ttsCalls++; if (text.includes('先停一下')) await new Promise<void>(resolve => { release = resolve; }); signal.throwIfAborted(); yield* silent.synthesize(text, signal); } } }) });
  try {
    await drift(h);
    while (!release) await new Promise<void>(resolve => setImmediate(resolve));
    await h.speech('我先回答您的人群问题。', true);
    await h.waitFor(isPhase('withdrawn'));
    release();
    await h.speech('75岁以上约占11%。', true);
    assert(!h.events.some(isPhase('spoken')));
    assert(!h.events.some(e => e.type === 'controller.dispatch' && e.payload.action.type === 'interrupt_speak'));
  } finally { await h.close(); }
});

test('interrupted ASR sentence resumes without repeating the already heard prefix', async () => {
  let callbacks!: import('../src/contracts').AsrCallbacks;
  const h = await setup({ createEngines: () => ({ system1: new FakeSystemOne(), system2: new FakeSystemTwo(10), tts: new SilentTts(), asr: { backend: 'controlled-asr', async open(_opts, cb) { callbacks = cb; return { write() {}, end() {} }; } } }) });
  try {
    h.send('audio.chunk', { format: 'pcm16', sampleRate: 16000, channels: 1, data: Buffer.alloc(4).toString('base64'), timestamp: Date.now() });
    while (!callbacks) await new Promise<void>(resolve => setImmediate(resolve));
    callbacks.onPartial('主要终点是收缩压，多降了6.2毫米汞柱，');
    await h.waitFor(e => e.type === 'system1.verdict');
    const prefix = '主要终点是收缩压，多降了6.2毫米汞柱，而且不良反应与安慰剂相当，还有区域上市后研究结果和真实世界研究更多结果，';
    callbacks.onPartial(prefix);
    await h.waitFor(isPhase('spoken'));
    callbacks.onFinal(prefix.replace('与安慰剂', '和安慰剂') + '我先回答您的人群问题。');
    await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'rep' && e.payload.text === '我先回答您的人群问题。');
    const turns = h.gateway.inspectSessions()[0].history.filter(t => t.who === 'rep');
    assert.equal(turns.length, 2);
    assert.equal(turns[0].text, prefix);
    assert.equal(turns[1].text, '我先回答您的人群问题。');
  } finally { await h.close(); }
});

test('playback report trims unheard doctor clauses before the next reply enters history', async () => {
  const h = await setup();
  try {
    const ready = h.events.find(e => e.type === 'session.ready');
    const audio = h.events.find(e => e.type === 'tts.stream_chunk');
    assert(ready?.type === 'session.ready' && audio?.type === 'tts.stream_chunk');
    h.send('tts.playback', { sessionId: ready.payload.sessionId, utteranceId: audio.payload.utteranceId, completedChunks: 1, playedMs: 200, status: 'stopped' });
    await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.text === '你说这个研究结果不错。' && e.payload.isFinal);
    await h.speech('我先回答您的人群问题。', true);
    assert.equal(h.gateway.inspectSessions()[0].history[0].text, '你说这个研究结果不错。');
  } finally { await h.close(); }
});
