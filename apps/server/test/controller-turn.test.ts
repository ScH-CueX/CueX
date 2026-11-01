import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { WebSocket } from 'ws';
import type { ServerMessage, VisitOutcome } from '@cuex/protocol';
import type { DoctorTurnDraft, DoctorTurnRequest, SystemTwo, TtsEngine, DoctorOutcomeRequest } from '../src/contracts';
import { WebSocketGateway } from '../src/gateway/WebSocketGateway';
import { ANSHU_PACK } from '../src/scenario/anshu';
import { FakeSystemOne, SilentTts, TextOnlyAsr } from '../src/fakes/engines';
import { readConfig } from '../src/config';

const reply = (text: string, extra: Partial<DoctorTurnDraft> = {}): DoctorTurnDraft => ({ text, action: 'reply', resolvedPointIds: [], contradictedPointIds: [], basis: 'grounded turn assessment', ...extra });
async function session(prepare: (req: DoctorTurnRequest) => Promise<DoctorTurnDraft> | DoctorTurnDraft, tts: TtsEngine = new SilentTts(), options: { outcome?: (req: DoctorOutcomeRequest) => Promise<VisitOutcome>; retryConcernId?: string; outcomeTimeoutMs?: number; playbackAckGraceMs?: number; turnTimeoutMs?: number } = {}) {
  const requests: DoctorTurnRequest[] = [];
  const system2: SystemTwo = { backend: 'prepared-turns', prepareOutcome: options.outcome, async prepareFollowup() { return { text: '尚未回应的患者呢？', basis: '持续偏离', triggerCondition: '仍偏离', targetPointIds: ['c1'] }; }, async prepareTurn(req) { requests.push(req); return prepare(req); } };
  const gateway = new WebSocketGateway({ port: 0, pack: ANSHU_PACK, createEngines: () => ({ system1: new FakeSystemOne(), system2, asr: new TextOnlyAsr(), tts }), controller: { debounceMs: 1, minDriftMs: 900, minDriftChars: 35, finalQuietMs: 25, partialQuietMs: 45, idleFirstMs: 45, idleSecondMs: 60, idleCloseMs: 80, turnTimeoutMs: options.turnTimeoutMs ?? 100, outcomeTimeoutMs: options.outcomeTimeoutMs ?? 100, playbackAckGraceMs: options.playbackAckGraceMs ?? 15000 } });
  await gateway.start();
  const ws = new WebSocket(`ws://127.0.0.1:${gateway.port}/ws/session`); const events: ServerMessage[] = [];
  const waiters = new Set<{ pred: (event: ServerMessage) => boolean; done: (event: ServerMessage) => void }>();
  ws.on('message', raw => { const event = JSON.parse(raw.toString()) as ServerMessage; events.push(event); for (const waiter of waiters) if (waiter.pred(event)) { waiters.delete(waiter); waiter.done(event); } });
  await once(ws, 'open');
  const send = (type: string, payload: unknown) => ws.send(JSON.stringify({ type, payload }));
  function wait(pred: (event: ServerMessage) => boolean, from = 0, timeout = 1500): Promise<ServerMessage> { const event = events.slice(from).find(pred); if (event) return Promise.resolve(event); return new Promise((resolve, reject) => { const waiter = { pred, done: (event: ServerMessage) => { clearTimeout(timer); resolve(event); } }; const timer = setTimeout(() => { waiters.delete(waiter); reject(new Error(`timeout: ${events.map(e => e.type).join(',')}`)); }, timeout); waiters.add(waiter); }); }
  async function playback(from = 0, status: 'finished' | 'stopped' = 'finished') { const existing = events.slice(from).filter(e => e.type === 'tts.stream_chunk' && e.payload.isLastChunk).at(-1); const last = existing ?? await wait(e => e.type === 'tts.stream_chunk' && e.payload.isLastChunk, from); assert(last.type === 'tts.stream_chunk'); const ready = events.find(e => e.type === 'session.ready'); assert(ready?.type === 'session.ready'); send('tts.playback', { sessionId: ready.payload.sessionId, utteranceId: last.payload.utteranceId, completedChunks: 99, playedMs: 1, status }); }
  send('session.start', { scenarioId: ANSHU_PACK.scenario.id, mode: 'performance', ...(options.retryConcernId ? { retry: { concernId: options.retryConcernId } } : {}) }); await wait(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.isFinal);
  return { gateway, ws, events, requests, send, wait, playback, close: async () => { ws.terminate(); await gateway.stop(); } };
}
const doctor = (text: string) => (e: ServerMessage) => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.isFinal && e.payload.text === text;



test('a final explicit farewell closes through outcome without asking the normal-turn model to decide', async () => {
  const farewellInputs = ['再见。', '谢谢您，今天先聊到这，再见。', '今天先不打扰您了，资料核对好再来，再见。', '那我先走了，主任再见。'];
  for (const text of farewellInputs) {
    const outcomes: DoctorOutcomeRequest[] = [];
    const generatedClosing = '资料我留下再核对，今天先到这里。';
    const h = await session(() => reply('这句临床追问不能再说。'), new SilentTts(), { outcome: async req => { outcomes.push(req); return { assessment: 'completed', stance: 'needs_evidence', doctorResponse: generatedClosing, rationale: '仍有证据待核对', strengths: [], gaps: [{ explanation: '亚组资料尚未核对' }], nextStep: '核对资料后再交流' }; } });
    try {
      const from = h.events.length;
      h.send('speech.delta', { text, isFinal: true });
      await h.wait(doctor(generatedClosing), from);
      assert.equal(h.requests.length, 0, text);
      assert.equal(outcomes.length, 1);
      assert.equal(outcomes[0].endReason, 'farewell');
      assert.equal(outcomes[0].history.at(-1)?.text, text, 'outcome sees actual final farewell');
      assert.deepEqual(outcomes[0].resolvedPointIds, []);
      await h.playback(from);
      const ended = await h.wait(e => e.type === 'visit.ended', from); assert(ended.type === 'visit.ended');
      assert.equal(ended.payload.outcome?.assessment, 'completed');
      assert(ended.payload.concerns.some(c => c.points.some(p => !p.resolved)));
      assert(!h.events.some(doctor('这句临床追问不能再说。')));
    } finally { await h.close(); }
  }
});

test('farewell questions, negations and reported quotes keep the visit open', async () => {
  const nonExits = ['能结束吗？', '您刚才说的是再见吗', '不是再见，我还想继续问。', '他说再见。', '这句话里的“再见”是什么意思。', '再见面的患者需要看什么证据？'];
  for (const text of nonExits) {
    let assessed = false;
    const h = await session(() => reply('可以，先听你继续说。'), new SilentTts(), { outcome: async () => { assessed = true; throw new Error('must stay open'); } });
    try {
      const from = h.events.length;
      h.send('speech.delta', { text, isFinal: true });
      await h.wait(doctor('可以，先听你继续说。'), from);
      assert.equal(h.requests.length, 1, text);
      assert.equal(assessed, false, text);
      assert(!h.events.some(e => e.type === 'visit.ended'), text);
    } finally { await h.close(); }
  }
});

test('a partial farewell corrected before final quiet does not end the visit', async () => {
  const h = await session(() => reply('我继续听你的问题。'));
  try {
    const from = h.events.length;
    h.send('speech.delta', { text: '再见', isFinal: false });
    await h.wait(e => e.type === 'asr.transcript' && e.payload.speaker === 'rep' && e.payload.text === '再见', from);
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.equal(h.requests.length, 0, 'a partial farewell waits for final ASR instead of prompting or ending');
    assert(!h.events.some(e => e.type === 'visit.ended'));
    h.send('speech.delta', { text: '不是再见，我继续问高龄患者。', isFinal: true });
    await h.wait(doctor('我继续听你的问题。'), from);
    assert.equal(h.requests.length, 1);
    assert(!h.events.some(e => e.type === 'visit.ended'));
  } finally { await h.close(); }
});



test('normal-turn budget is bounded, configurable and gives the default ten-second engine budget room', () => {
  assert.equal(readConfig({}).controller.turnTimeoutMs, 22000);
  assert.equal(readConfig({}).controller.outcomeTimeoutMs, 22000);
  assert.equal(readConfig({ CUEX_OUTCOME_TIMEOUT_MS: '15000' }).controller.outcomeTimeoutMs, 15000);
  assert.equal(readConfig({ CUEX_TURN_TIMEOUT_MS: '13500' }).controller.turnTimeoutMs, 13500);
  assert.throws(() => readConfig({ CUEX_TURN_TIMEOUT_MS: '0' }));
});

test('normal-turn diagnostics separate timeout, rejected result and provider error without raw content', async () => {
  const logs: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => { logs.push(args.join(' ')); };
  try {
    for (const [message, expected] of [
      ['System 2 turn rejected: private transcript SECRET https://provider.invalid/key', 'TURN_RESULT_REJECTED'],
      ['upstream failed SECRET https://provider.invalid/key', 'TURN_PROVIDER_ERROR'],
      ['System 2 timed out after 10000 ms (SECRET https://provider.invalid/key)', 'TURN_TIMEOUT'],
    ]) {
      const h = await session(() => { throw new Error(message); });
      try {
        h.send('speech.delta', { text: '我想问一下具体数据。', isFinal: true });
        await h.wait(e => e.type === 'session.error' && e.payload.code === 'SYSTEM2_TURN_ERROR');
        const rows = logs.map(line => { try { return JSON.parse(line); } catch { return {}; } }).filter(row => row.sessionId === h.gateway.inspectSessions()[0].sessionId);
        assert.equal(rows.length, 2);
        assert(rows.every(row => row.category === expected && row.taskId && Number.isInteger(row.revision)));
      } finally { await h.close(); }
    }
    const stalled = await session(() => new Promise(() => {}), new SilentTts(), { turnTimeoutMs: 30 });
    try {
      stalled.send('speech.delta', { text: '这个问题需要核对。', isFinal: true });
      await stalled.wait(e => e.type === 'session.error' && e.payload.code === 'SYSTEM2_TURN_ERROR');
      const rows = logs.map(line => { try { return JSON.parse(line); } catch { return {}; } }).filter(row => row.sessionId === stalled.gateway.inspectSessions()[0].sessionId);
      assert.equal(rows.length, 2);
      assert(rows.every(row => row.category === 'TURN_TIMEOUT' && row.timeoutMs === 30));
    } finally { await stalled.close(); }
    assert(!logs.join('\n').includes('SECRET'));
    assert(!logs.join('\n').includes('provider.invalid'));
    assert(!logs.join('\n').includes('具体数据'));
  } finally { console.warn = warn; }
});



test('the controller timeout flag survives an engine AbortError race', async () => {
  const logs: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => { logs.push(args.join(' ')); };
  const h = await session(req => new Promise((_resolve, reject) => req.signal.addEventListener('abort', () => { const error = new Error('System 2 request aborted'); error.name = 'AbortError'; reject(error); }, { once: true })), new SilentTts(), { turnTimeoutMs: 25 });
  try {
    h.send('speech.delta', { text: '我需要核对这个问题。', isFinal: true });
    await h.wait(e => e.type === 'session.error' && e.payload.code === 'SYSTEM2_TURN_ERROR');
    const rows = logs.map(line => JSON.parse(line));
    assert.equal(rows.length, 2);
    assert(rows.every(row => row.category === 'TURN_TIMEOUT'));
  } finally { await h.close(); console.warn = warn; }
});

test('a valid response inside the configured budget succeeds and stale aborts stay out of failure logs', async () => {
  const logs: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => { logs.push(args.join(' ')); };
  let release!: () => void;
  const h = await session(async req => {
    if (req.repSpeech === '旧问题。') await new Promise<void>(resolve => { release = resolve; });
    else await new Promise(resolve => setTimeout(resolve, 120));
    return reply(req.repSpeech === '旧问题。' ? '旧回复不能说。' : '新的问题我听到了。');
  }, new SilentTts(), { turnTimeoutMs: 180 });
  try {
    h.send('speech.delta', { text: '旧问题。', isFinal: true });
    while (!release) await new Promise<void>(resolve => setImmediate(resolve));
    h.send('speech.delta', { text: '新的问题。', isFinal: true });
    release();
    await h.wait(doctor('新的问题我听到了。'));
    assert(!h.events.some(doctor('旧回复不能说。')));
    assert(!h.events.some(e => e.type === 'session.error'));
    assert.equal(logs.length, 0);
  } finally { await h.close(); console.warn = warn; }
});



test('a transient normal failure stays preparing during its one retry and succeeds without a user error', async () => {
  let calls = 0;
  const h = await session(() => { if (++calls === 1) throw new Error('temporary provider failure'); return reply('数据我听到了，我们继续核对。'); });
  try {
    const from = h.events.length;
    h.send('speech.delta', { text: '我想核对亚组数据。', isFinal: true });
    await h.wait(e => e.type === 'system2.activity' && e.payload.phase === 'preparing' && e.payload.reason === '正在重新准备回应。', from);
    assert(!h.events.slice(from).some(e => e.type === 'system2.activity' && e.payload.phase === 'error'));
    await h.wait(doctor('数据我听到了，我们继续核对。'), from);
    assert.equal(calls, 2);
    assert(!h.events.slice(from).some(e => e.type === 'session.error'));
    const activities = h.events.slice(from).filter(e => e.type === 'system2.activity' && e.payload.kind === 'reply');
    assert(activities.every(e => e.type === 'system2.activity' && e.payload.taskId === (activities[0].type === 'system2.activity' ? activities[0].payload.taskId : '')));
    assert(activities.some(e => e.type === 'system2.activity' && e.payload.phase === 'completed'), 'one logical retry task reaches completed, with no abandoned preparing spinner');
    assert(!activities.some(e => e.type === 'system2.activity' && e.payload.phase === 'error'));
  } finally { await h.close(); }
});

test('outcome retries one transient provider error within one total budget and keeps feedback preparing', async () => {
  const logs: string[] = []; const warn = console.warn; console.warn = (...args: unknown[]) => { logs.push(args.join(' ')); };
  let calls = 0;
  const result: VisitOutcome = { assessment: 'completed', stance: 'needs_evidence', doctorResponse: '资料留给我再核对。', rationale: '需要核对', strengths: [], gaps: [], nextStep: '核对资料' };
  const h = await session(() => reply('继续说。'), new SilentTts(), { outcomeTimeoutMs: 150, outcome: async () => { if (++calls === 1) throw new Error('SECRET https://private.invalid temporary upstream'); return result; } });
  try {
    const ready = h.events.find(e => e.type === 'session.ready'); assert(ready?.type === 'session.ready'); const from = h.events.length;
    h.send('visit.end', { sessionId: ready.payload.sessionId });
    await h.wait(doctor(result.doctorResponse), from); await h.playback(from);
    const ended = await h.wait(e => e.type === 'visit.ended', from); assert(ended.type === 'visit.ended');
    assert.equal(calls, 2); assert.equal(ended.payload.outcome?.assessment, 'completed');
    assert(h.events.slice(from).some(e => e.type === 'system2.activity' && e.payload.phase === 'preparing' && e.payload.reason === '正在重新准备复盘。'));
    assert(!h.events.slice(from).some(e => e.type === 'system2.activity' && e.payload.phase === 'error'));
    const row = JSON.parse(logs[0]); assert.equal(row.category, 'OUTCOME_PROVIDER_ERROR'); assert.equal(row.attempt, 1);
    assert(!logs.join('\n').includes('SECRET')); assert(!logs.join('\n').includes('private.invalid'));
  } finally { await h.close(); console.warn = warn; }
});

test('a typed unavailable outcome is final and is not retried', async () => {
  let calls = 0;
  const h = await session(() => reply('继续说。'), new SilentTts(), { outcome: async () => { calls++; return { assessment: 'unavailable', stance: 'needs_evidence', doctorResponse: '', rationale: '复盘暂未生成，请重试。', strengths: [], gaps: [], nextStep: '重试复盘' }; } });
  try {
    const ready = h.events.find(e => e.type === 'session.ready'); assert(ready?.type === 'session.ready'); const from = h.events.length;
    h.send('visit.end', { sessionId: ready.payload.sessionId });
    await h.wait(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.isFinal, from); await h.playback(from);
    const ended = await h.wait(e => e.type === 'visit.ended', from); assert(ended.type === 'visit.ended');
    assert.equal(calls, 1); assert.equal(ended.payload.outcome?.assessment, 'unavailable');
    assert.equal(h.events.slice(from).filter(e => e.type === 'system2.activity' && e.payload.kind === 'assessment' && e.payload.phase === 'error').length, 1);
  } finally { await h.close(); }
});

test('an outcome retry shares the original deadline and stop cancellation emits no false failure', async () => {
  let calls = 0; const logs: string[] = []; const warn = console.warn; console.warn = (...args: unknown[]) => { logs.push(args.join(' ')); };
  const h = await session(() => reply('继续说。'), new SilentTts(), { outcomeTimeoutMs: 100, outcome: async () => { calls++; if (calls === 1) { await new Promise(resolve => setTimeout(resolve, 65)); throw new Error('temporary network failure'); } return new Promise(() => {}); } });
  try {
    const ready = h.events.find(e => e.type === 'session.ready'); assert(ready?.type === 'session.ready'); const from = h.events.length;
    h.send('visit.end', { sessionId: ready.payload.sessionId });
    await h.wait(e => e.type === 'system2.activity' && e.payload.kind === 'assessment' && e.payload.phase === 'error', from);
    assert.equal(calls, 2); const rows = logs.map(line => JSON.parse(line)); const last = rows.at(-1);
    assert.equal(last.category, 'OUTCOME_TIMEOUT'); assert(last.elapsedMs < 155, `one shared100ms budget, not two: ${last.elapsedMs}`);
  } finally { await h.close(); console.warn = warn; }
  const cancelledLogs: string[] = []; console.warn = (...args: unknown[]) => { cancelledLogs.push(args.join(' ')); };
  const stopped = await session(() => reply('继续说。'), new SilentTts(), { outcome: req => new Promise((_resolve, reject) => req.signal.addEventListener('abort', () => reject(Object.assign(new Error('stopped'), { name: 'AbortError' })), { once: true })) });
  try {
    const ready = stopped.events.find(e => e.type === 'session.ready'); assert(ready?.type === 'session.ready');
    stopped.send('visit.end', { sessionId: ready.payload.sessionId });
    await stopped.wait(e => e.type === 'system2.activity' && e.payload.kind === 'assessment' && e.payload.phase === 'preparing');
    stopped.send('session.stop', { sessionId: ready.payload.sessionId }); await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(cancelledLogs.length, 0); assert(!stopped.events.some(e => e.type === 'visit.ended'));
  } finally { await stopped.close(); console.warn = warn; }
});



test('six consecutive replies plus speech during TTS keep same-visit state and the final outcome usable', async () => {
  const silent = new SilentTts(); let releaseOld!: () => void;
  const replies = new Map([
    ['第一轮问题。', '第一轮回应。'], ['第二轮问题。', '第二轮回应。'], ['第三轮问题。', '第三轮旧回应。'],
    ['第三轮改口。', '第三轮新回应。'], ['第四轮问题。', '第四轮回应。'], ['第五轮问题。', '第五轮回应。'], ['第六轮问题。', '第六轮回应。'],
  ]);
  const h = await session(req => reply(replies.get(req.repSpeech) ?? '没有预期的输入。'), { backend: 'held-third-reply', async *synthesize(text, signal) {
    yield* silent.synthesize(text, signal);
    if (text === '第三轮旧回应。') await new Promise<void>(resolve => { releaseOld = resolve; });
  } }, { outcome: async () => ({ assessment: 'completed', stance: 'needs_evidence', doctorResponse: '本次资料我再核对。', rationale: '仍待核对', strengths: [], gaps: [], nextStep: '核对资料' }) });
  try {
    const ready = h.events.find(e => e.type === 'session.ready'); assert(ready?.type === 'session.ready');
    for (const input of ['第一轮问题。', '第二轮问题。']) {
      const from = h.events.length; h.send('speech.delta', { text: input, isFinal: true }); await h.wait(doctor(replies.get(input)!), from); await h.playback(from);
    }
    let from = h.events.length; h.send('speech.delta', { text: '第三轮问题。', isFinal: true });
    await h.wait(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.text === '第三轮旧回应。', from);
    while (!releaseOld) await new Promise<void>(resolve => setImmediate(resolve));
    from = h.events.length; h.send('speech.delta', { text: '第三轮改口。', isFinal: true });
    await h.wait(doctor('第三轮新回应。'), from); await h.playback(from); releaseOld();
    for (const input of ['第四轮问题。', '第五轮问题。', '第六轮问题。']) {
      from = h.events.length; h.send('speech.delta', { text: input, isFinal: true }); await h.wait(doctor(replies.get(input)!), from); await h.playback(from);
    }
    assert.equal(h.requests.length, 7);
    assert.deepEqual(h.requests.map(req => req.repSpeech), [...replies.keys()]);
    assert(h.requests.every(req => req.sessionId === ready.payload.sessionId));
    assert(!h.events.some(e => e.type === 'session.error'));
    from = h.events.length; h.send('visit.end', { sessionId: ready.payload.sessionId });
    await h.wait(doctor('本次资料我再核对。'), from); await h.playback(from); await h.wait(e => e.type === 'visit.ended', from);
  } finally { releaseOld?.(); await h.close(); }
});



test('the same final words after a heard doctor reply form a new turn but duplicate finals before playback do not', async () => {
  const h = await session(() => reply('那我们换一种方式说明。'));
  try {
    let from = h.events.length;
    h.send('speech.delta', { text: '我不知道。', isFinal: true });
    await h.wait(doctor('那我们换一种方式说明。'), from);
    const afterFirst = h.events.length;
    h.send('speech.delta', { text: '我不知道。', isFinal: true });
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(h.requests.length, 1, 'same final while reply playback is pending is still a duplicate');
    await h.playback(from);
    from = h.events.length;
    h.send('speech.delta', { text: '我不知道。', isFinal: true });
    await h.wait(doctor('那我们换一种方式说明。'), from);
    assert.equal(h.requests.length, 2, 'the representative may legitimately repeat after hearing the reply');
    assert.equal(h.requests[1].repSpeech, '我不知道。');
    assert.equal(h.requests[1].history.filter(turn => turn.who === 'rep' && turn.text === '我不知道。').length, 2);
    assert(!h.events.slice(afterFirst).some(e => e.type === 'session.error'));
  } finally { await h.close(); }
});

test('short natural turns get grounded replies for greeting, vague answer, wrong claim and inability without drift', async () => {
  const h = await session(req => req.repSpeech.includes('不太好') ? reply('这组结果与总体一致。你能先说一下亚组人数吗？', { contradictedPointIds: ['c2'] }) : req.repSpeech.includes('不知道') ? reply('先看资料里的高龄患者比例，研究里是多少？') : reply('我们先谈高龄患者，研究里有多少？'));
  try {
    h.send('speech.delta', { text: '您好，我想先了解您最关心什么。', isFinal: true }); await h.wait(doctor('我们先谈高龄患者，研究里有多少？'));
    let from = h.events.length; h.send('speech.delta', { text: '30到60的结果不太好。', isFinal: true }); await h.wait(doctor('这组结果与总体一致。你能先说一下亚组人数吗？'), from);
    assert(!h.gateway.inspectSessions()[0].resolvedPointIds.includes('c2')); assert.equal(h.gateway.inspectSessions()[0].concernId, 'concern-scope');
    from = h.events.length; h.send('speech.delta', { text: '我不知道这个数字。', isFinal: true }); await h.wait(doctor('先看资料里的高龄患者比例，研究里是多少？'), from);
    assert.equal(h.events.filter(e => e.type === 'system2.candidate' && (!e.payload.task || e.payload.task === 'followup')).length, 0);
  } finally { await h.close(); }
});

test('idle starts after actual doctor playback, gives two cues then closes without a prompt loop', async () => {
  const h = await session(req => reply(req.silenceStage === 1 ? '你可以先说高龄患者。' : req.silenceStage === 2 ? '看一下资料，七十五岁以上占多少？' : '我们先到这里，下次再继续。', { action: req.silenceStage === 3 ? 'end_visit' : 'reply' }));
  try {
    await new Promise(resolve => setTimeout(resolve, 100)); assert.equal(h.requests.length, 0, 'not while opening audio awaits playback');
    await h.playback();
    await h.wait(doctor('你可以先说高龄患者。'));
    let from = h.events.length;
    await h.playback();
    await h.wait(doctor('看一下资料，七十五岁以上占多少？'), from);
    from = h.events.length;
    await h.playback();
    await h.wait(doctor('我们先到这里，下次再继续。'), from);
    await h.playback();
    await h.wait(e => e.type === 'visit.ended');
    await new Promise(resolve => setTimeout(resolve, 120)); assert.deepEqual(h.requests.map(req => req.silenceStage), [1, 2, 3]); assert(h.gateway.inspectSessions()[0].resolvedPointIds.length === 0);
  } finally { await h.close(); }
});

test('new partials cancel stale normal generation; duplicates do not postpone the quiet reply', async () => {
  let release!: () => void;
  const h = await session(async req => { if (req.repSpeech === '我想问个问题。') await new Promise<void>(resolve => { release = resolve; }); return reply(req.repSpeech.includes('改口') ? '好，先听你的新问题。' : '这句旧回复不能说。'); });
  try {
    h.send('speech.delta', { text: '我想问个问题。', isFinal: true }); while (!release) await new Promise<void>(resolve => setImmediate(resolve));
    h.send('speech.delta', { text: '我改口，先问高龄患者。', isFinal: false });
    await h.wait(e => e.type === 'asr.transcript' && e.payload.speaker === 'rep' && e.payload.text.includes('我改口'));
    release();
    const repeat = setInterval(() => h.send('speech.delta', { text: '我改口，先问高龄患者。', isFinal: false }), 8);
    await h.wait(doctor('好，先听你的新问题。')); clearInterval(repeat);
    assert(h.requests[0].signal.aborted); assert(!h.events.some(doctor('这句旧回复不能说。')));
  } finally { await h.close(); }
});

test('goodbye closes with unresolved points, retry gets fresh scheduler state and stop cancels pending work', async () => {
  const h = await session(req => reply('这句模型回复不决定告别。'), new SilentTts(), { outcome: async () => ({ assessment: 'completed', stance: 'needs_evidence', doctorResponse: '好，今天先到这里。', rationale: '证据仍待核对', strengths: [], gaps: [{ explanation: '仍有未回答要点' }], nextStep: '核对资料' }) });
  try {
    h.send('speech.delta', { text: '谢谢您，今天先聊到这，再见。', isFinal: true }); const from = h.events.length; await h.wait(doctor('好，今天先到这里。'), from); await h.playback(from); const ended = await h.wait(e => e.type === 'visit.ended'); assert(ended.type === 'visit.ended'); assert(ended.payload.concerns.some(c => c.points.some(p => !p.resolved)));
    const next = h.events.length; h.send('session.start', { scenarioId: ANSHU_PACK.scenario.id, mode: 'performance', retry: { concernId: 'concern-scope' } }); await h.wait(e => e.type === 'session.ready', next); h.send('speech.delta', { text: '我再试一次。', isFinal: true }); h.send('session.stop', { sessionId: 'current' }); await new Promise(resolve => setTimeout(resolve, 100)); assert.equal(h.requests.length, 0);
  } finally { await h.close(); }
});


test('wrong grounded claim never advances, a supported answer resolves, and a later contradiction reopens the point', async () => {
  const base = new FakeSystemOne();
  const h = await session(req => req.repSpeech.includes('不太好') ? reply('资料显示这组与总体一致，请核对人数。', { contradictedPointIds: ['c2'] }) : reply('收到，这个人数有资料支持。', { resolvedPointIds: ['c2'] }));
  try {
    let from = h.events.length;
    h.send('speech.delta', { text: 'eGFR30到60有412人，结果不太好。', isFinal: true });
    await h.wait(doctor('资料显示这组与总体一致，请核对人数。'), from);
    assert(!h.gateway.inspectSessions()[0].resolvedPointIds.includes('c2'));
    assert(!h.events.some(e => e.type === 'system1.verdict' && e.payload.resolvedPointIds.includes('c2')), 'neural keyword recognition is not factual validation');
    from = h.events.length;
    h.send('speech.delta', { text: '我看清了，亚组412人，降压结果与总体一致。', isFinal: true });
    await h.wait(e => e.type === 'conversation.progress' && e.payload.resolvedPointIds.includes('c2'), from);
    await h.wait(doctor('收到，这个人数有资料支持。'), from);
    from = h.events.length;
    h.send('speech.delta', { text: '我又说成不太好了。', isFinal: true });
    await h.wait(e => e.type === 'conversation.progress' && !e.payload.resolvedPointIds.includes('c2'), from);
    assert.equal(h.gateway.inspectSessions()[0].concernId, 'concern-scope');
  } finally { await h.close(); }
});

test('a final followed by new ASR and barge-in during TTS suppress stale speech without overlapping audio', async () => {
  let release!: () => void;
  const silent = new SilentTts();
  const h = await session(req => reply(req.repSpeech.includes('新问题') ? '我们来谈新问题。' : '这句旧回复。'), { backend: 'held-turn-tts', async *synthesize(text, signal) { if (text.includes('这句旧回复') && !release) await new Promise<void>(resolve => { release = resolve; }); if (!signal.aborted) yield* silent.synthesize(text, signal); } });
  try {
    const from = h.events.length;
    h.send('speech.delta', { text: '先停一下。', isFinal: true });
    while (!release) await new Promise<void>(resolve => setImmediate(resolve));
    h.send('speech.delta', { text: '新问题还没说完', isFinal: false });
    await h.wait(e => e.type === 'asr.transcript' && e.payload.speaker === 'rep' && e.payload.text.includes('新问题'), from);
    release();
    await h.wait(doctor('我们来谈新问题。'), from);
    assert(!h.events.some(doctor('这句旧回复。')));
    assert(h.events.some(e => e.type === 'tts.abort' && e.payload.reason === 'user_interrupted'));
    assert(!h.events.some(e => e.type === 'system2.candidate' && (!e.payload.task || e.payload.task === 'followup')));
  } finally { await h.close(); }
});

test('graceful visit.end validates session id and returns unavailable outcome without claiming persuasion', async () => {
  const h = await session(() => reply('先说你的问题。'));
  try {
    const ready = h.events.find(e => e.type === 'session.ready'); assert(ready?.type === 'session.ready');
    let from = h.events.length;
    h.send('visit.end', { sessionId: 'old-session' }); await h.wait(e => e.type === 'session.error' && e.payload.code === 'INVALID_SESSION', from);
    assert.equal(h.gateway.inspectSessions().length, 1);
    from = h.events.length; h.send('session.stop', { sessionId: 'old-session' }); await h.wait(e => e.type === 'session.error' && e.payload.code === 'INVALID_SESSION', from);
    assert.equal(h.gateway.inspectSessions().length, 1);
    from = h.events.length; h.send('visit.end', { sessionId: ready.payload.sessionId });
    await h.wait(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.isFinal, from);
    await h.playback(from);
    const ended = await h.wait(e => e.type === 'visit.ended', from); assert(ended.type === 'visit.ended');
    assert.equal(ended.payload.outcome?.assessment, 'unavailable'); assert.equal(ended.payload.outcome?.stance, 'needs_evidence');
    assert(ended.payload.concerns.some(c => c.points.some(p => !p.resolved)));
    assert.equal(h.gateway.inspectSessions().length, 1, 'graceful end does not disconnect the visitor');
  } finally { await h.close(); }
});


test('unknown clinical scope receives a professional evidence response and service failure leaves a retryable visit', async () => {
  let fail = true;
  const h = await session(req => { if (fail) throw new Error('service unavailable'); return reply('这份资料没有妊娠人群的证据。我们先确认说明书范围。'); });
  try {
    let from = h.events.length;
    h.send('speech.delta', { text: '孕妇可以用吗？我手里没有这方面资料。', isFinal: true });
    await h.wait(e => e.type === 'session.error' && e.payload.code === 'SYSTEM2_TURN_ERROR', from);
    assert.equal(h.requests.length, 2, 'one bounded retry, no automatic prompt storm');
    assert(!h.gateway.inspectSessions()[0].completed);
    assert(!h.events.some(e => e.type === 'visit.ended'));
    fail = false; from = h.events.length;
    h.send('speech.delta', { text: '我再问一下，妊娠人群有没有证据？', isFinal: true });
    await h.wait(doctor('这份资料没有妊娠人群的证据。我们先确认说明书范围。'), from);
    assert.equal(h.gateway.inspectSessions()[0].resolvedPointIds.length, 0);
  } finally { await h.close(); }
});

test('supported last-concern answer can end once with actual outcome; a hanging outcome remains bounded', async () => {
  const outcome: VisitOutcome = { assessment: 'completed', stance: 'needs_evidence', doctorResponse: '剂量依据说清楚了，我还需要再核对材料。', rationale: '仍需进一步核对', strengths: [{ quote: '2.5毫克', explanation: '给出起始剂量' }], gaps: [{ explanation: '仍需补充使用经验' }], nextStep: '留下资料供核对' };
  const h = await session(() => reply('谢谢，资料留下。', { action: 'end_visit', resolvedPointIds: ['d1'] }), new SilentTts(), { retryConcernId: 'concern-dose', outcome: async () => outcome });
  try {
    const from = h.events.length;
    h.send('speech.delta', { text: '75岁以上从2.5毫克开始，两周后按血压调整。', isFinal: true });
    await h.wait(doctor('谢谢，资料留下。'), from); await h.playback(from);
    const ended = await h.wait(e => e.type === 'visit.ended', from); assert(ended.type === 'visit.ended');
    assert.equal(ended.payload.outcome?.stance, 'needs_evidence'); assert(ended.payload.concerns.every(c => c.points.every(p => p.resolved))); assert.equal(h.events.filter(e => e.type === 'visit.ended').length, 1);
    assert(h.events.some(e => e.type === 'system2.activity' && e.payload.kind === 'assessment' && e.payload.phase === 'preparing'));
  } finally { await h.close(); }
  const stalled = await session(() => reply('继续说。'), new SilentTts(), { outcomeTimeoutMs: 40, outcome: async () => new Promise(() => {}) });
  try {
    const ready = stalled.events.find(e => e.type === 'session.ready'); assert(ready?.type === 'session.ready'); const from = stalled.events.length;
    stalled.send('visit.end', { sessionId: ready.payload.sessionId });
    await stalled.wait(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.isFinal, from);
    await stalled.playback(from); const ended = await stalled.wait(e => e.type === 'visit.ended', from); assert(ended.type === 'visit.ended'); assert.equal(ended.payload.outcome?.assessment, 'unavailable');
  } finally { await stalled.close(); }
});


test('visitor speaking before opening first audio receives a normal reply instead of an empty stalled visit', async () => {
  const silent = new SilentTts();
  let first = true;
  const gateway = new WebSocketGateway({ port: 0, pack: ANSHU_PACK, controller: { finalQuietMs: 15, partialQuietMs: 25 }, createEngines: () => ({ system1: new FakeSystemOne(), system2: { backend: 'early-turn', async prepareFollowup() { throw new Error('unused'); }, async prepareTurn() { return reply('您可以问，我先听你的问题。'); } }, asr: new TextOnlyAsr(), tts: { backend: 'delayed-opening', async *synthesize(text, signal) { if (first) { first = false; await new Promise<void>(resolve => setTimeout(resolve, 100)); } if (!signal.aborted) yield* silent.synthesize(text, signal); } } }) });
  await gateway.start(); const ws = new WebSocket(`ws://127.0.0.1:${gateway.port}/ws/session`); const events: ServerMessage[] = [];
  ws.on('message', raw => events.push(JSON.parse(raw.toString()))); await once(ws, 'open');
  try {
    ws.send(JSON.stringify({ type: 'session.start', payload: { scenarioId: ANSHU_PACK.scenario.id, mode: 'performance' } }));
    while (!events.some(e => e.type === 'session.ready')) await new Promise<void>(resolve => setImmediate(resolve));
    ws.send(JSON.stringify({ type: 'speech.delta', payload: { text: '我想问一句话。', isFinal: true } }));
    const deadline = Date.now() + 1000; while (!events.some(doctor('您可以问，我先听你的问题。')) && Date.now() < deadline) await new Promise<void>(resolve => setTimeout(resolve, 5));
    assert(events.some(doctor('您可以问，我先听你的问题。')));
    assert(events.some(e => e.type === 'tts.abort'));
    assert.equal(gateway.inspectSessions()[0].history.filter(turn => turn.who === 'doctor').length, 1);
  } finally { ws.terminate(); await gateway.stop(); }
});

test('capable normal-turn mode preserves mid-speech interruption and real self-correction withdrawal', async () => {
  const h = await session(req => reply('我先听你把人群问题说清楚。'));
  try {
    let from = h.events.length;
    h.send('speech.delta', { text: '主要终点是收缩压，多降六点二毫米汞柱，', isFinal: false });
    await h.wait(e => e.type === 'system1.verdict', from);
    // The shared fixture uses production900ms sustain; keep speaking across it.
    await new Promise(resolve => setTimeout(resolve, 950));
    h.send('speech.delta', { text: '主要终点是收缩压，多降六点二毫米汞柱，而且不良反应与安慰剂相当，还有两万多人上市后研究结果，', isFinal: false });
    const ready = await h.wait(e => e.type === 'system2.candidate' && (!e.payload.task || e.payload.task === 'followup') && e.payload.candidate.phase === 'ready', from);
    assert(ready.type === 'system2.candidate');
    h.send('speech.delta', { text: '我先回答您的人群问题。', isFinal: true });
    await h.wait(e => e.type === 'system2.candidate' && e.payload.candidate.id === ready.payload.candidate.id && e.payload.candidate.phase === 'withdrawn', from);
    assert(!h.events.some(e => e.type === 'system2.candidate' && e.payload.candidate.id === ready.payload.candidate.id && e.payload.candidate.phase === 'spoken'));
    await h.wait(doctor('我先听你把人群问题说清楚。'), from);
  } finally { await h.close(); }
});


test('TTS failure before or after its first chunk releases the output slot for another rep turn and graceful end', async () => {
  for (const partial of [false, true]) {
    let failed = false;
    const silent = new SilentTts();
    const h = await session(req => reply(req.repSpeech.includes('再问') ? '新的问题我听到了。' : '这句会遇到语音故障。'), { backend: 'failing-turn-audio', async *synthesize(text, signal) {
      if (text.includes('这句会遇到') && !failed) { failed = true; if (partial) yield* silent.synthesize(text, signal); throw new Error('audio service lost'); }
      yield* silent.synthesize(text, signal);
    } });
    try {
      let from = h.events.length; h.send('speech.delta', { text: '先问个问题。', isFinal: true });
      await h.wait(e => e.type === 'session.error' && e.payload.code === 'TTS_ERROR', from);
      assert(h.events.slice(from).some(e => e.type === 'tts.abort'));
      from = h.events.length; h.send('speech.delta', { text: '我再问一个问题。', isFinal: true }); await h.wait(doctor('新的问题我听到了。'), from);
      const ready = h.events.find(e => e.type === 'session.ready'); assert(ready?.type === 'session.ready');
      from = h.events.length; h.send('visit.end', { sessionId: ready.payload.sessionId });
      await h.wait(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.isFinal, from); await h.playback(from);
      await h.wait(e => e.type === 'visit.ended', from);
      assert.equal(h.events.filter(e => e.type === 'visit.ended').length, 1);
    } finally { await h.close(); }
  }
});


test('explicit withdrawal reopens only the withdrawn grounded point while ordinary uncertainty preserves prior evidence', async () => {
  const h = await session(req => req.repSpeech.includes('撤回')
    ? reply('那这条亚组结论先留待核对，高龄数据我们已经谈过。', { resolvedPointIds: ['c1', 'c2'], reopenedPointIds: ['c2', 'unknown-point'] })
    : req.repSpeech.includes('记不清')
      ? reply('没关系，先保留你刚才核对过的结果，我们再看说明书边界。')
      : reply('这两组数据有依据，低于三十的人群又怎么写？', { resolvedPointIds: ['c1', 'c2'] }));
  try {
    let from = h.events.length;
    h.send('speech.delta', { text: '七十五岁以上占百分之十一，三十到六十亚组四百一十二人，两个亚组的结果都与总体一致。', isFinal: true });
    await h.wait(e => e.type === 'conversation.progress' && e.payload.resolvedPointIds.includes('c1') && e.payload.resolvedPointIds.includes('c2'), from);
    await h.wait(doctor('这两组数据有依据，低于三十的人群又怎么写？'), from);
    from = h.events.length;
    h.send('speech.delta', { text: '具体数字我现在记不清了。', isFinal: true });
    const uncertain = await h.wait(e => e.type === 'conversation.progress', from); assert(uncertain.type === 'conversation.progress');
    assert.deepEqual(new Set(uncertain.payload.resolvedPointIds), new Set(['c1', 'c2']));
    await h.wait(doctor('没关系，先保留你刚才核对过的结果，我们再看说明书边界。'), from);
    from = h.events.length;
    h.send('speech.delta', { text: '我明确撤回刚才三十到六十那个亚组结论，需要回去核对。高龄的那条没有变。', isFinal: true });
    const withdrawn = await h.wait(e => e.type === 'conversation.progress' && !e.payload.resolvedPointIds.includes('c2'), from); assert(withdrawn.type === 'conversation.progress');
    assert.deepEqual(withdrawn.payload.resolvedPointIds, ['c1']);
    assert.deepEqual(h.gateway.inspectSessions()[0].resolvedPointIds, ['c1']);
    assert(h.requests.every(req => !req.resolvedPointIds.includes('unknown-point')));
    assert.equal(h.gateway.inspectSessions()[0].concernId, 'concern-scope');
  } finally { await h.close(); }
});


test('delayed playback acknowledgement past the old estimate never starts an idle cue, then one actual report starts one cue', async () => {
  const h = await session(req => reply('你可以先说高龄患者。'));
  try {
    await new Promise(resolve => setTimeout(resolve, 1650));
    assert.equal(h.requests.length, 0, 'generated audio duration is not proof that the opening was heard');
    assert(!h.events.some(e => e.type === 'system2.activity' && e.payload.kind === 'silence_prompt'));
    await h.playback();
    await h.wait(doctor('你可以先说高龄患者。'));
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(h.requests.length, 1, 'the pending cue itself waits for its real playback report');
    assert.equal(h.requests[0].trigger, 'silence');
    assert.equal(h.requests[0].silenceStage, 1);
  } finally { await h.close(); }
});

test('playback watchdog aborts without inferring silence and leaves barge-in and graceful end available', async () => {
  const h = await session(req => reply('新问题我听到了。'), new SilentTts(), { playbackAckGraceMs: 100 });
  try {
    await h.wait(e => e.type === 'session.error' && e.payload.code === 'PLAYBACK_TIMEOUT');
    assert.equal(h.requests.length, 0);
    assert(h.events.some(e => e.type === 'tts.abort'));
    // A delayed stopped report caused by the watchdog must not produce a silence prompt.
    await h.playback(0, 'stopped');
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(h.requests.length, 0);
    let from = h.events.length;
    h.send('speech.delta', { text: '我继续问一个问题。', isFinal: true });
    await h.wait(doctor('新问题我听到了。'), from);
    from = h.events.length;
    const ready = h.events.find(e => e.type === 'session.ready'); assert(ready?.type === 'session.ready');
    h.send('visit.end', { sessionId: ready.payload.sessionId });
    await h.wait(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.isFinal, from);
    await h.playback(from); await h.wait(e => e.type === 'visit.ended', from);
    assert(!h.requests.some(req => req.trigger === 'silence'));
  } finally { await h.close(); }
});

test('rep barge-in before a delayed playback acknowledgement cancels the old watchdog and gets a reply', async () => {
  const h = await session(req => reply('可以，先听你的问题。'), new SilentTts(), { playbackAckGraceMs: 150 });
  try {
    const from = h.events.length;
    h.send('speech.delta', { text: '我想直接问一下。', isFinal: true });
    await h.wait(doctor('可以，先听你的问题。'), from);
    await h.playback(from);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert(!h.events.some(e => e.type === 'session.error' && e.payload.code === 'PLAYBACK_TIMEOUT'));
  } finally { await h.close(); }
});
