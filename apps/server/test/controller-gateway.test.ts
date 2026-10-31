import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { WebSocket } from 'ws';
import type { ServerMessage } from '@cuex/protocol';
import { WebSocketGateway } from '../src/gateway/WebSocketGateway';
import { FakeSystemOne, FakeSystemTwo, TextOnlyAsr, SilentTts } from '../src/fakes/engines';
import { ANSHU_PACK } from '../src/scenario/anshu';

type Predicate = (event: ServerMessage) => boolean;
const isPhase = (phase: string): Predicate => (event) => event.type === 'system2.candidate' && (!event.payload.task || event.payload.task === 'followup') && event.payload.candidate.phase === phase;

async function setup(overrides: Partial<import('../src/gateway/WebSocketGateway').GatewayOptions> = {}, waitOpening = true, retryConcernId?: string) {
  const gateway = new WebSocketGateway({
    port: 0,
    host: '127.0.0.1',
    pack: { ...ANSHU_PACK, lineExamples: { ...ANSHU_PACK.lineExamples, opening: [ANSHU_PACK.lineExamples.opening[0]], retry: Object.fromEntries(Object.entries(ANSHU_PACK.lineExamples.retry).map(([id, examples]) => [id, [examples[0]]])), closing: [ANSHU_PACK.lineExamples.closing[0]] } },
    createEngines: async () => {
      if (process.env.CUEX_TEST_REAL_S2 === '1') {
        const { createEngines, readConfig } = await import('../src/config');
        return createEngines({ ...readConfig(), system1: 'real', system2: 'real', asr: 'fake', tts: 'fake' }, ANSHU_PACK);
      }
      const system2 = new FakeSystemTwo(35);
      system2.prepareDoctorLine = undefined as never;
      return { system1: new FakeSystemOne(), system2, asr: new TextOnlyAsr(), tts: new SilentTts() };
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
  send('session.start', { scenarioId: ANSHU_PACK.scenario.id, mode: 'performance', ...(retryConcernId ? { retry: { concernId: retryConcernId } } : {}) });
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
  const from = h.events.length;
  await h.speech('主要终点是十二周时的诊室收缩压，多降了6.2毫米汞柱，');
  assert.equal(h.events.slice(from).filter(isPhase('retrieving')).length, 0, 'one sentence must not trigger preparation');
  await h.speech('而且不良反应发生率与安慰剂相当，我们还有华东地区上市后的结果，');
  await h.waitFor(isPhase('ready'), from);
}

test('continued pitch prepares, rechecks and interrupts before final speech', async () => {
  const h = await setup();
  try {
    await drift(h);
    await h.waitFor(e => e.type === 'controller.dispatch' && e.payload.action.type === 'interrupt_speak' && !!e.payload.action.candidateId);
    await h.waitFor(isPhase('spoken'));
    await h.waitFor(e => e.type === 'tts.stream_chunk' && e.payload.isLastChunk && h.events.some(isPhase('spoken')));
    const phases = h.events.filter(e => e.type === 'system2.candidate' && (!e.payload.task || e.payload.task === 'followup')).map(e => e.payload.candidate.phase).filter((phase, index, all) => index === 0 || phase !== all[index - 1]);
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
    assert.equal(h.events.filter(e => e.type === 'system2.candidate' && (!e.payload.task || e.payload.task === 'followup')).length, 0);
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
    assert.equal(h.events.filter(e => e.type === 'system2.candidate' && (!e.payload.task || e.payload.task === 'followup')).length, 0);
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


test('answering one over-listed candidate target withdraws the question while other points stay open', async () => {
  const h = await setup({
    createEngines: () => ({
      system1: new FakeSystemOne(), asr: new TextOnlyAsr(), tts: new SilentTts(),
      system2: {
        backend: 'over-listed-targets',
        async prepareFollowup(req, onPhase) {
          req.signal.throwIfAborted();
          onPhase?.('drafting');
          return {
            text: '七十五岁以上的患者有多少？', basis: '高龄人群仍未说明',
            triggerCondition: '代表仍未说明75岁以上患者', targetPointIds: ['c1', 'c2', 'c3'],
          };
        },
      },
    }),
    controller: { debounceMs: 5, minDriftMs: 0, minDriftChars: 30, candidateHoldMs: 1000, minInterruptGapMs: 0 },
  });
  try {
    await drift(h);
    const ready = h.events.find(isPhase('ready'));
    assert(ready?.type === 'system2.candidate');
    // The latest 80 characters are another pitch, so withdrawal must follow point resolution,
    // not just the separate "currently responding" judgment.
    const pitch = '主要终点是诊室收缩压，不良反应与安慰剂相当，还有上市后研究的结果，'.repeat(4);
    await h.speech(`75岁以上患者约占11%。${pitch}`, true);
    await h.waitFor(e => isPhase('withdrawn')(e) && e.type === 'system2.candidate' && e.payload.candidate.id === ready.payload.candidate.id);
    await h.waitFor(e => e.type === 'controller.dispatch' && e.payload.action.type === 'withdraw_question');
    assert.deepEqual(h.gateway.inspectSessions()[0].resolvedPointIds, ['c1']);
    assert(!h.events.some(isPhase('spoken')));
    assert(!h.events.some(e => e.type === 'controller.dispatch' && e.payload.action.type === 'interrupt_speak'));
    await h.speech('好的，请您继续。', true);
    await h.waitFor(e => e.type === 'controller.dispatch' && e.payload.pose === 'listening' && e.payload.concernProgress.resolvedCount === 1);
    assert.equal(h.gateway.inspectSessions()[0].candidates[0].fate, 'withdrawn');
  } finally { await h.close(); }
});


test('retry visit rephrases the concern, resolves the visit and speaks the closing line last', async () => {
  const h = await setup({}, true, 'concern-scope');
  try {
    const opening = h.gateway.inspectSessions()[0];
    assert.deepEqual(opening.resolvedPointIds, []);
    assert.equal(opening.history[0].text, ANSHU_PACK.lineExamples.retry['concern-scope'][0]);
    assert.equal(opening.candidates.length, 0);
    await h.speech('75岁以上患者约占11%，降压幅度与总体一致。', true);
    await h.speech('eGFR30到60的亚组有412人，结果与总体一致。', true);
    await h.speech('eGFR低于30被排除，没有证据，说明书不建议使用。', true);
    await h.waitFor(e => e.type === 'controller.dispatch' && e.payload.concernProgress.concernId === 'concern-dose');
    await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.text === ANSHU_PACK.lineExamples.retry['concern-dose'][0] && e.payload.isFinal);
    await h.speech('高龄患者的起始剂量需要调整，应核对说明书。', true);
    await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.text === ANSHU_PACK.lineExamples.closing[0] && e.payload.isFinal);
    const completed = h.gateway.inspectSessions()[0];
    assert.deepEqual(completed.resolvedPointIds, ['c1', 'c2', 'c3', 'd1']);
    assert.equal(completed.history.at(-1)?.text, ANSHU_PACK.lineExamples.closing[0]);
    assert.equal(completed.candidates.length, 0);
    const verdictCount = h.events.filter(e => e.type === 'system1.verdict').length;
    const from = h.events.length;
    h.send('speech.delta', { text: '主要终点还有更多结果。', isFinal: true });
    h.ws.send(JSON.stringify({ type: 'ping', payload: { t: Date.now() } }));
    // A restarted dose retry proves prior concerns stay resolved and no old candidates carry over.
    h.send('session.start', { scenarioId: ANSHU_PACK.scenario.id, mode: 'performance', retry: { concernId: 'concern-dose' } });
    await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.text === ANSHU_PACK.lineExamples.retry['concern-dose'][0] && e.payload.isFinal, from);
    assert.equal(h.events.filter(e => e.type === 'system1.verdict').length, verdictCount);
    const doseRetry = h.gateway.inspectSessions()[0];
    assert.deepEqual(doseRetry.resolvedPointIds, ['c1', 'c2', 'c3']);
    assert.equal(doseRetry.candidates.length, 0);
  } finally { await h.close(); }
});


test('retry uses the one-use System 2 line prefetched from the heard visit and missed points', async () => {
  const requests: import('../src/contracts').DoctorLineRequest[] = [];
  const system2 = new FakeSystemTwo(10);
  system2.prepareDoctorLine = async (req, phase) => {
    requests.push(req);
    phase?.('drafting');
    return req.kind === 'opening' ? '我们先谈高龄和肾功能患者。' : req.kind === 'retry' ? '刚才的人群问题再来一次，先说明高龄患者。' : '今天这次交流就到这里，感谢你把边界说清楚。';
  };
  const h = await setup({ createEngines: () => ({ system1: new FakeSystemOne(), system2, asr: new TextOnlyAsr(), tts: new SilentTts() }) });
  try {
    await drift(h);
    await h.speech('我先回答您的人群问题。', true);
    await h.waitFor(isPhase('withdrawn'));
    const from = h.events.length;
    h.send('session.stop', { sessionId: 'current' });
    await h.waitFor(e => e.type === 'system2.candidate' && e.payload.task === 'retry' && e.payload.candidate.phase === 'ready', from);
    const retry = requests.find(req => req.kind === 'retry' && req.concernId === 'concern-scope');
    assert(retry);
    assert.deepEqual(retry.missedPointIds, ['c1', 'c2', 'c3']);
    assert(retry.history.some(turn => turn.who === 'rep' && turn.text.includes('主要终点')));
    h.send('session.start', { scenarioId: ANSHU_PACK.scenario.id, mode: 'performance', retry: { concernId: 'concern-scope' } });
    await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.isFinal && e.payload.text === '刚才的人群问题再来一次，先说明高龄患者。', from);
    assert(!ANSHU_PACK.lineExamples.retry['concern-scope'].includes(h.gateway.inspectSessions()[0].history[0].text));
    assert.equal(requests.filter(req => req.kind === 'retry' && req.concernId === 'concern-scope').length, 1, 'ready retry should be consumed instead of redrafted');
  } finally { await h.close(); }
});

test('slow System 2 opening uses a pack example within the 1200 ms visitor budget', async () => {
  let signal: AbortSignal | undefined;
  const system2 = new FakeSystemTwo(10);
  system2.prepareDoctorLine = async (req, phase) => {
    if (req.kind === 'opening') signal = req.signal;
    phase?.('drafting');
    await new Promise<void>((_resolve, reject) => req.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
    return '不应等到这句。';
  };
  const start = performance.now();
  const h = await setup({ createEngines: () => ({ system1: new FakeSystemOne(), system2, asr: new TextOnlyAsr(), tts: new SilentTts() }) });
  try {
    const elapsed = performance.now() - start;
    const opening = h.gateway.inspectSessions()[0].history[0].text;
    assert(ANSHU_PACK.lineExamples.opening.includes(opening));
    assert(elapsed >= 1100 && elapsed < 1800, `opening fallback took ${Math.round(elapsed)} ms`);
    assert(signal?.aborted);
    console.log(JSON.stringify({ flow: 'doctor-line-budget', fallbackMs: Math.round(elapsed) }));
  } finally { await h.close(); }
});

test('closing is drafted when the last concern starts and is spoken from the ready prefetch', async () => {
  let closingStarted = false;
  const system2 = new FakeSystemTwo(10);
  system2.prepareDoctorLine = async (req, phase) => {
    phase?.('drafting');
    if (req.kind === 'closing') { closingStarted = true; return '人群和剂量都说明白了，资料请留下。'; }
    return req.kind === 'opening' ? '我们先确认这项研究的人群。' : '接下来谈高龄患者的起始剂量。';
  };
  const h = await setup({ createEngines: () => ({ system1: new FakeSystemOne(), system2, asr: new TextOnlyAsr(), tts: new SilentTts() }) });
  try {
    await h.speech('75岁以上患者约占11%，eGFR30到60亚组有412人。', true);
    await h.speech('eGFR低于30被排除，没有证据，说明书不建议使用。', true);
    await h.waitFor(e => e.type === 'system2.candidate' && e.payload.task === 'closing' && e.payload.candidate.phase === 'ready');
    assert(closingStarted);
    await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.text === '接下来谈高龄患者的起始剂量。' && e.payload.isFinal);
    const start = performance.now();
    await h.speech('高龄起始剂量需要调整，应核对说明书。', true);
    await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.text === '人群和剂量都说明白了，资料请留下。' && e.payload.isFinal);
    assert(performance.now() - start < 800, 'ready closing should not spend the fallback budget');
    assert.equal(h.gateway.inspectSessions()[0].history.at(-1)?.text, '人群和剂量都说明白了，资料请留下。');
  } finally { await h.close(); }
});


test('next concern is already drafted and a later visitor retry replaces the previous visit history', async () => {
  const requests: import('../src/contracts').DoctorLineRequest[] = [];
  const system2 = new FakeSystemTwo(10);
  system2.prepareDoctorLine = async (req, phase) => {
    requests.push(req); phase?.('drafting');
    if (req.kind === 'opening') return '先说研究覆盖的人群。';
    if (req.kind === 'closing') return '好，资料留给我。';
    return req.concernId === 'concern-dose' ? '高龄起始剂量怎么安排？' : `我们继续${req.history.some(turn => turn.text.includes('第二位')) ? '第二位' : '第一位'}刚才的人群问题。`;
  };
  const h = await setup({ createEngines: () => ({ system1: new FakeSystemOne(), system2, asr: new TextOnlyAsr(), tts: new SilentTts() }) });
  try {
    assert(requests.some(req => req.kind === 'retry' && req.concernId === 'concern-dose'), 'dose line should start before scope is answered');
    for (const visitor of ['第一位', '第二位']) {
      const visitStart = h.events.length;
      await drift(h);
      await h.speech(`${visitor}，我先回答您的人群问题。`, true);
      await h.waitFor(isPhase('withdrawn'), visitStart);
      const from = h.events.length;
      h.send('session.stop', { sessionId: 'current' });
      await h.waitFor(e => e.type === 'system2.candidate' && e.payload.task === 'retry' && e.payload.candidate.targetConcernId === 'concern-scope' && e.payload.candidate.phase === 'ready', from);
      h.send('session.start', { scenarioId: ANSHU_PACK.scenario.id, mode: 'performance' });
      await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.text === '先说研究覆盖的人群。' && e.payload.isFinal, from);
    }
    const retryRequests = requests.filter(req => req.kind === 'retry' && req.concernId === 'concern-scope');
    assert.equal(retryRequests.length, 2);
    assert(retryRequests[0].history.some(turn => turn.text.includes('第一位')));
    assert(retryRequests[1].history.some(turn => turn.text.includes('第二位')));
    assert(!retryRequests[1].history.some(turn => turn.text.includes('第一位')));
  } finally { await h.close(); }
});


test('visitor reads the product briefing and sourced facts before starting the visit', async () => {
  const h = await setup();
  try {
    const response = await fetch(`http://127.0.0.1:${h.gateway.port}/briefing`);
    assert.equal(response.status, 200);
    const briefing = await response.json() as import('@cuex/protocol').BriefingResponse;
    assert.deepEqual(Object.keys(briefing).sort(), ['doctor', 'facts', 'packTitle', 'productName', 'studyName']);
    assert.deepEqual(Object.keys(briefing.doctor).sort(), ['department', 'name', 'title']);
    assert.equal(briefing.productName, ANSHU_PACK.scenario.productName);
    assert.equal(briefing.packTitle, ANSHU_PACK.scenario.packTitle);
    assert.equal(briefing.studyName, ANSHU_PACK.scenario.studyName);
    assert.deepEqual(briefing.facts, ANSHU_PACK.facts);
    assert(briefing.facts.some(fact => fact.id === 'f-dose-elderly' && fact.text.includes('2.5')));
    assert(!JSON.stringify(briefing).includes('anchorQuestion'));
    await h.speech('我先回答您的人群问题。', true);
    assert(h.events.some(e => e.type === 'system1.verdict'));
  } finally { await h.close(); }
});


test('natural elderly dose answer resolves d1 and the doctor closes the visit', async () => {
  const { createSystemOne } = await import('../src/system1/index');
  const h = await setup({ createEngines: () => ({ system1: createSystemOne(ANSHU_PACK), system2: new FakeSystemTwo(10), asr: new TextOnlyAsr(), tts: new SilentTts() }) }, true, 'concern-dose');
  try {
    const from = h.events.length;
    const answer = '75岁以上患者从每日2.5毫克开始，两周后按照血压调整。';
    await h.speech(answer, true);
    await h.waitFor(e => e.type === 'system1.verdict' && e.payload.resolvedPointIds.includes('d1'), from);
    await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.isFinal, from);
    const session = h.gateway.inspectSessions()[0];
    assert(session.completed);
    assert(session.resolvedPointIds.includes('d1'));
    assert(session.history.at(-1)?.who === 'doctor');
    assert(!session.candidates.length);
  } finally { await h.close(); }
});


test('closing playback ends the visit once with heard interruption and withdrawal moments, then retry ends separately', async () => {
  const h = await setup();
  async function finishLastDoctor(from: number, status: 'finished' | 'stopped' = 'finished') {
    const final = await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.isFinal, from);
    assert(final.type === 'asr.transcript');
    const chunks = h.events.slice(from).filter(e => e.type === 'tts.stream_chunk');
    const audio = chunks.find(e => e.type === 'tts.stream_chunk' && e.payload.audioBase64);
    assert(audio?.type === 'tts.stream_chunk');
    await h.waitFor(e => e.type === 'tts.stream_chunk' && e.payload.utteranceId === audio.payload.utteranceId && e.payload.isLastChunk, from);
    const sessionId = h.gateway.inspectSessions()[0].sessionId;
    h.send('tts.playback', { sessionId, utteranceId: audio.payload.utteranceId, completedChunks: chunks.filter(e => e.type === 'tts.stream_chunk' && e.payload.audioBase64).length, playedMs: 10, status });
    return { final, audio, sessionId };
  }
  try {
    const opening = h.gateway.inspectSessions()[0].history[0].text;
    await drift(h);
    await h.waitFor(isPhase('spoken'));
    await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.isFinal && e.payload.text !== opening);
    await h.speech('75岁以上约占11%，降压幅度与总体一致。', true);
    await h.speech('eGFR30到60亚组有412人，结果与总体一致。', true);
    let from = h.events.length;
    await h.speech('主要终点和上市后研究还有更多结果，', true);
    await h.speech('不良反应与安慰剂相当，真实世界覆盖两万多人，华东地区的疗效结果也一样，', true);
    await h.waitFor(isPhase('ready'), from);
    await h.speech('我先回答您的人群问题，eGFR低于30这一点我先说明。', true);
    await h.waitFor(isPhase('withdrawn'), from);
    from = h.events.length;
    await h.speech('eGFR低于30被排除，没有证据，说明书不建议使用。', true);
    await finishLastDoctor(from);
    const closeFrom = h.events.length;
    await h.speech('高龄起始剂量需要调整，应核对说明书。', true);
    const closing = await finishLastDoctor(closeFrom);
    const ended = await h.waitFor(e => e.type === 'visit.ended', closeFrom);
    assert(ended.type === 'visit.ended');
    assert(ended.payload.durationMs > 0);
    assert.equal(ended.payload.retry, false);
    assert.equal(ended.payload.doctorOpening, opening);
    assert(ended.payload.concerns.every(concern => concern.points.every(point => point.resolved)));
    assert.deepEqual(ended.payload.moments.map(moment => moment.kind), ['interrupted', 'withdrawn']);
    assert(ended.payload.moments[0].repSaid.includes('不良反应'));
    assert(ended.payload.moments[0].doctorSaid?.length);
    assert(ended.payload.moments[0].openPointIds.includes('c1'));
    assert(ended.payload.moments[1].repSaid.includes('我先回答'));
    assert(ended.payload.moments[1].withdrawnText?.length);
    assert.deepEqual(ended.payload.moments[1].openPointIds, ['c3']);
    assert.equal(ended.payload.suggestedRetryConcernId, 'concern-scope');
    h.send('tts.playback', { sessionId: closing.sessionId, utteranceId: closing.audio.payload.utteranceId, completedChunks: 99, playedMs: 999, status: 'finished' });
    from = h.events.length;
    h.send('session.start', { scenarioId: ANSHU_PACK.scenario.id, mode: 'performance', retry: { concernId: 'concern-dose' } });
    const retryOpening = await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.isFinal, from);
    assert(retryOpening.type === 'asr.transcript');
    const retryCloseFrom = h.events.length;
    await h.speech('高龄起始剂量需要调整，应核对说明书。', true);
    await finishLastDoctor(retryCloseFrom, 'stopped');
    const retryEnded = await h.waitFor(e => e.type === 'visit.ended', retryCloseFrom);
    assert(retryEnded.type === 'visit.ended');
    assert.equal(retryEnded.payload.retry, true);
    assert.equal(retryEnded.payload.doctorOpening, retryOpening.payload.text);
    assert.equal(retryEnded.payload.moments.length, 0);
    assert.equal(h.events.filter(e => e.type === 'visit.ended').length, 2);
    // A third visit that stops before closing produces no summary.
    const stopFrom = h.events.length;
    h.send('session.start', { scenarioId: ANSHU_PACK.scenario.id, mode: 'performance' });
    await h.waitFor(e => e.type === 'session.ready', stopFrom);
    h.send('session.stop', { sessionId: 'current' });
    h.send('speech.delta', { text: '这轮先停。', isFinal: true });
    await h.waitFor(e => e.type === 'session.error' && e.payload.code === 'SESSION_NOT_STARTED', stopFrom);
    assert.equal(h.events.filter(e => e.type === 'visit.ended').length, 2);
  } finally { await h.close(); }
});


test('blocked audio device still reaches review after closing duration plus 1500 ms without a playback report', async () => {
  const h = await setup({}, true, 'concern-dose');
  try {
    const from = h.events.length;
    await h.speech('高龄起始剂量需要调整，应核对说明书。', true);
    const closing = await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.isFinal, from);
    const last = h.events.slice(from).find(e => e.type === 'tts.stream_chunk' && e.payload.isLastChunk);
    assert(last?.type === 'tts.stream_chunk');
    const sentAt = performance.now();
    const ended = await h.waitFor(e => e.type === 'visit.ended', from, 2500);
    assert(ended.type === 'visit.ended');
    assert(performance.now() - sentAt >= 1400);
    assert.equal(ended.payload.retry, true);
    assert(closing.type === 'asr.transcript' && closing.payload.text.length > 0);
    assert.equal(h.events.filter(e => e.type === 'visit.ended').length, 1);
  } finally { await h.close(); }
});
