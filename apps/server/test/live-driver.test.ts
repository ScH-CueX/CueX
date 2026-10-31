import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocketGateway } from '../src/gateway/WebSocketGateway';
import { ANSHU_PACK } from '../src/scenario/anshu';
import { FakeSystemOne, FakeSystemTwo, SilentTts, TextOnlyAsr } from '../src/fakes/engines';
import { LiveWSDriver } from '../../web/src/core/driver/LiveWSDriver';

/** Set CUEX_TEST_LIVE_URL=ws://127.0.0.1:5173/ws/session to verify the Vite proxy too. */
test('the real frontend LiveWSDriver receives opening, partials, verdicts and candidate lifecycle', async () => {
  const externalUrl = process.env.CUEX_TEST_LIVE_URL;
  const gateway = externalUrl ? undefined : new WebSocketGateway({
    port: 0, pack: ANSHU_PACK,
    createEngines: () => ({ system1: new FakeSystemOne(), system2: new FakeSystemTwo(20), asr: new TextOnlyAsr(), tts: new SilentTts() }),
    controller: { debounceMs: 5, minDriftMs: 0, minDriftChars: 20, candidateHoldMs: 80 },
  });
  await gateway?.start();
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const browserEvents = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval,
    addEventListener: browserEvents.addEventListener.bind(browserEvents),
    removeEventListener: browserEvents.removeEventListener.bind(browserEvents),
  } });
  const driver = new LiveWSDriver({ serverUrl: externalUrl ?? `ws://127.0.0.1:${gateway!.port}/ws/session` });
  const statuses: string[] = [];
  const phases: string[] = [];
  const transcripts: string[] = [];
  const actions: string[] = [];
  let verdicts = 0;
  let resolveEvent: (() => void) | undefined;
  let rejectEvent: ((error: Error) => void) | undefined;
  const until = (predicate: () => boolean) => {
    if (predicate()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Live driver timeout; phases=${phases}, actions=${actions}, statuses=${statuses}`)), 5000);
      resolveEvent = () => { if (predicate()) { clearTimeout(timer); resolveEvent = undefined; rejectEvent = undefined; resolve(); } };
      rejectEvent = error => { clearTimeout(timer); reject(error); };
    });
  };
  const notify = () => resolveEvent?.();
  try {
    await driver.init({
      onStatusChange: status => { statuses.push(status); notify(); },
      onDoctorDispatch: event => { actions.push(event.action.type); notify(); },
      onTranscript: event => { transcripts.push(event.text); notify(); },
      onSystem1Verdict: () => { verdicts++; notify(); },
      onServerEvent: event => {
        if (event.type === 'system2.candidate' && (!event.payload.task || event.payload.task === 'followup')) { phases.push(event.payload.candidate.phase); notify(); }
      },
      // Node verifies the actual text/event driver; real browser audio is covered by the web feature test.
      onError: (error, code) => { if (code !== 'AUDIO_PLAYBACK') rejectEvent?.(error); },
    });
    await driver.start();
    await until(() => transcripts.some(text => ANSHU_PACK.lineExamples.opening.some(example => text.startsWith(example))));
    driver.sendSpeechDelta('主要终点是十二周时的诊室收缩压，多降6.2毫米汞柱，', false);
    await until(() => verdicts >= 1);
    // The external server may use production sustained-drift timing.
    if (externalUrl) await new Promise<void>(resolve => setTimeout(resolve, 1100));
    driver.sendSpeechDelta('而且不良反应发生率与安慰剂相当，我们还有华东地区的上市后结果和真实世界研究，', false);
    await until(() => phases.includes('ready'));
    driver.sendSpeechDelta('我先回答您的人群问题，', false);
    await until(() => phases.includes('withdrawn') && actions.includes('withdraw_question'));
    assert(statuses.includes('connecting') && statuses.includes('running'));
    assert.deepEqual(phases, ['retrieving', 'drafting', 'ready', 'withdrawn']);
    assert(verdicts >= 3);
    assert(transcripts.some(text => text.includes('我先回答您的人群问题')));
    console.log(JSON.stringify({ driver: driver.id, via: externalUrl ? 'vite-proxy' : 'direct', verdicts, phases, transcriptUpdates: transcripts.length }));
  } finally {
    await driver.stop();
    await gateway?.stop();
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window');
  }
});
