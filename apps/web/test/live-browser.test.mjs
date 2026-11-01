import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const chrome = process.env.CUEX_CHROME ?? '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev';
const processes = [];
let browser;
let fixture;
let origin;
let wav;
const real = process.env.CUEX_WEB_REAL === '1';
const errors = [];
// Doctor-line jobs (opening, retry, closing) share system2.candidate; follow-up assertions skip them.
const isFollowup = event => event.type === 'system2.candidate' && (event.payload.task ?? 'followup') === 'followup';

async function start(command, args, env, ready) {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  processes.push(child);
  let log = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Process startup timeout: ${log}`)), 30000);
    const onData = data => {
      log += data.toString();
      const result = ready(log);
      if (result) { clearTimeout(timer); resolve(result); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('error', reject);
    child.once('exit', code => { if (code) { clearTimeout(timer); reject(new Error(`Process exited ${code}: ${log}`)); } });
  });
}
async function button(page, label) {
  await page.waitForFunction(label => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === label && !button.disabled), {}, label);
  await page.evaluate(label => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === label).click(), label);
}
async function waitEvent(events, predicate, timeout = real ? 60000 : 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = events.find(predicate);
    if (found) return found;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`No expected event; events=${events.map(event => event.type + (event.payload?.candidate ? ':' + event.payload.candidate.phase : '')).join(',')}`);
}
async function pageSession({ longAudio = false, longAudioSeconds = 3 } = {}) {
  await fetch(`http://127.0.0.1:${fixture.metricsPort}/${longAudio ? 'long' : 'short'}-audio${longAudio ? `?seconds=${longAudioSeconds}` : ''}`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.on('pageerror', error => errors.push(error.message));
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  const received = [];
  const sent = [];
  const capture = (target, frame) => { try { target.push({ ...JSON.parse(frame.response.payloadData), observedAt: Date.now() }); } catch {} };
  cdp.on('Network.webSocketFrameReceived', frame => capture(received, frame));
  cdp.on('Network.webSocketFrameSent', frame => capture(sent, frame));
  await page.evaluateOnNewDocument(() => {
    window.__audioSources = [];
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (...args) {
      const source = create.apply(this, args);
      const entry = { start: 0, stop: 0, end: 0, duration: 0 };
      window.__audioSources.push(entry);
      const start = source.start.bind(source);
      const stop = source.stop.bind(source);
      source.start = (...params) => { entry.start = performance.now(); entry.duration = source.buffer?.duration ?? 0; return start(...params); };
      source.stop = (...params) => { entry.stop = performance.now(); return stop(...params); };
      source.addEventListener('ended', () => { entry.end = performance.now(); });
      return source;
    };
  });
  await page.goto(`${origin}/?view=live&jury=1`, { waitUntil: 'networkidle0' });
  await button(page, '开始拜访');
  await page.waitForFunction(() => document.querySelector('[data-testid="connection-status"]')?.textContent.includes('已连接'));
  await waitEvent(received, event => event.type === 'tts.stream_chunk');
  if (!longAudio) await waitEvent(sent, event => event.type === 'tts.playback' && event.payload.status === 'finished');
  return { page, received, sent, cdp };
}
async function sayText(page, text) {
  await page.focus('#rep-speech');
  await page.type('#rep-speech', text);
  await page.keyboard.press('Enter');
}
const pitch = '主要终点是十二周时的诊室收缩压，多降了6.2毫米汞柱，而且不良反应发生率与安慰剂相当，我们还有华东地区上市后的结果，真实世界研究覆盖两万名患者，主要终点和安全性都有更多结果可以介绍。';

before(async () => {
  wav = await mkdtemp(path.join(tmpdir(), 'cuex-web-audio-'));
  await new Promise((resolve, reject) => {
    const say = spawn('/usr/bin/say', ['-v', 'Tingting', '--data-format=LEI16@16000', '-o', path.join(wav, 'rep.wav'), '好的陈主任，七十五岁以上患者约占百分之十一，降压幅度与总体一致。']);
    say.once('error', reject); say.once('exit', code => code === 0 ? resolve() : reject(new Error(`say failed ${code}`)));
  });
  fixture = await start(path.join(root, 'apps/server/node_modules/.bin/tsx'), ['apps/web/test/live-server.ts'], {}, log => {
    for (const line of log.split('\n')) { try { const value = JSON.parse(line); if (value.ready) return value; } catch {} }
  });
  origin = await start(path.join(root, 'apps/web/node_modules/.bin/vite'), ['--config', 'apps/web/vite.config.ts', 'apps/web', '--host', '127.0.0.1', '--port', '0'], { CUEX_SERVER_ORIGIN: `http://127.0.0.1:${fixture.port}` }, log => log.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/)?.[1]);
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.join(wav, 'rep.wav')}`] });
}, { timeout: 60000 });

after(async () => {
  await browser?.close();
  for (const child of processes.reverse()) {
    if (child.exitCode !== null) continue;
    child.kill('SIGTERM');
    await new Promise(resolve => { child.once('exit', resolve); setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000).unref(); });
  }
  if (wav) await rm(wav, { recursive: true, force: true });
});

test('typed live speech receives a doctor interruption before the rep finishes', { timeout: 90000 }, async () => {
  const { page, received, sent } = await pageSession();
  try {
    await sayText(page, pitch);
    const spoken = await waitEvent(received, event => isFollowup(event) && event.payload.candidate.phase === 'spoken');
    await page.waitForSelector('[data-testid="candidate"][data-phase="spoken"]');
    await waitEvent(received, event => event.type === 'asr.transcript' && event.payload.speaker === 'doctor' && event.observedAt >= spoken.observedAt);
    await page.waitForFunction(() => !document.querySelector('#rep-speech').disabled);
    assert(sent.filter(event => event.type === 'speech.delta').length > 5);
    assert(!sent.some(event => event.type === 'speech.delta' && event.payload.isFinal), 'doctor interrupts before final input');
    assert.deepEqual([...new Set(received.filter(isFollowup).map(event => event.payload.candidate.phase))], ['retrieving', 'drafting', 'ready', 'spoken']);
    assert(await page.$eval('[data-testid="transcript"]', element => element.textContent.includes('先停一下') || element.textContent.includes('患者')));
    const ready = received.find(event => isFollowup(event) && event.payload.candidate.phase === 'ready');
    console.log(JSON.stringify({ flow: real ? 'real-engines-typed-interrupt' : 'typed-interrupt', readyToSpokenMs: spoken.observedAt - ready.observedAt, progressiveDeltas: sent.filter(event => event.type === 'speech.delta').length }));
  } finally { await page.close(); }
});

test('a ready follow-up is withdrawn after self-correction and point labels resolve', { timeout: 90000 }, async () => {
  const { page, received } = await pageSession();
  try {
    await sayText(page, pitch);
    await waitEvent(received, event => isFollowup(event) && event.payload.candidate.phase === 'ready');
    await button(page, '停止说话');
    await sayText(page, '我先回答您的人群问题，75 岁以上患者约占 11%，降压幅度与总体一致。');
    await page.waitForSelector('[data-testid="candidate"][data-phase="withdrawn"]', { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="point-c1"]')?.getAttribute('data-resolved') === 'true', { timeout: 30000 });
    assert.equal(await page.$eval('[data-phase="withdrawn"] del', element => !!element.textContent.trim()), true);
    assert(!received.some(event => isFollowup(event) && event.payload.candidate.phase === 'spoken'));
    const metrics = await (await fetch(`http://127.0.0.1:${fixture.metricsPort}/metrics`)).json();
    assert.equal(metrics.sessions[0].candidates[0].fate, 'withdrawn');
    assert(!metrics.sessions[0].history.some(turn => turn.who === 'doctor' && turn.text.includes(metrics.sessions[0].candidates[0].draftText)));
    console.log(JSON.stringify({ flow: 'withdrawal', candidates: metrics.sessions[0].candidates.length, resolvedPoints: metrics.sessions[0].resolvedPointIds }));
  } finally { await page.close(); }
});

test('microphone sends PCM and displays the ASR response, then closes tracks', { timeout: 30000 }, async () => {
  const { page, sent } = await pageSession();
  try {
    await button(page, '开启麦克风');
    const audio = await waitEvent(sent, event => event.type === 'audio.chunk');
    assert.equal(audio.payload.format, 'pcm16'); assert.equal(audio.payload.sampleRate, 16000); assert.equal(audio.payload.channels, 1);
    assert.equal(Buffer.from(audio.payload.data, 'base64').length, 6400);
    await page.waitForFunction(() => document.querySelector('[data-testid="transcript"]')?.textContent.includes('75 岁以上患者约占 11%'));
    await button(page, '关闭麦克风');
    const count = sent.filter(event => event.type === 'audio.chunk').length;
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(sent.filter(event => event.type === 'audio.chunk').length, count);
    const metrics = await (await fetch(`http://127.0.0.1:${fixture.metricsPort}/metrics`)).json();
    assert.equal(metrics.audioFormat, 16000);
    console.log(JSON.stringify({ flow: 'microphone', chunks: count, bytesPerChunk: Buffer.from(audio.payload.data, 'base64').length, receivedBytes: metrics.bytes }));
  } finally { await page.close(); }
});

test('server tts.abort immediately stops doctor audio and reports exactly once', { timeout: 30000, skip: real }, async () => {
  const { page, received, sent } = await pageSession({ longAudio: true });
  try {
    await page.waitForFunction(() => window.__audioSources.some(source => source.duration === 3 && source.start && !source.end));
    // Abort after the first PCM frame, before three voiced frames arm local VAD.
    await button(page, '开启麦克风');
    await waitEvent(sent, event => event.type === 'audio.chunk');
    const before = Date.now();
    await fetch(`http://127.0.0.1:${fixture.metricsPort}/abort`);
    const aborted = await waitEvent(received, event => event.type === 'tts.abort');
    const report = await waitEvent(sent, event => event.type === 'tts.playback' && event.payload.utteranceId === aborted.payload.utteranceId);
    assert.equal(report.payload.status, 'stopped');
    assert(report.payload.playedMs < 3000);
    assert.equal(report.payload.completedChunks, 0);
    await page.waitForFunction(() => window.__audioSources.some(source => source.duration === 3 && source.stop));
    assert.equal(sent.filter(event => event.type === 'tts.playback' && event.payload.utteranceId === aborted.payload.utteranceId).length, 1);
    assert(!sent.some(event => event.type === 'user.interrupted_doctor'), 'only incoming tts.abort should stop this flow');
    await button(page, '关闭麦克风');
    console.log(JSON.stringify({ flow: 'server-audio-abort', abortRoundTripMs: report.observedAt - before, playedMs: report.payload.playedMs }));
  } finally { await page.close(); }
});

test('disconnect exposes an error and reconnect starts a fresh usable visit', { timeout: 30000 }, async () => {
  const { page, received } = await pageSession();
  try {
    await page.setOfflineMode(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    // Close the transport through CDP offline emulation; next WS write surfaces it.
    await sayText(page, '我先回答您的人群问题。');
    await page.waitForSelector('[data-testid="live-error"]');
    assert(await page.$eval('[data-testid="connection-status"]', element => element.textContent.includes('连接失败')));
    await page.setOfflineMode(false);
    await button(page, '重新连接');
    await page.waitForFunction(() => document.querySelector('[data-testid="connection-status"]')?.textContent.includes('已连接'));
    await waitEvent(received, event => event.type === 'session.ready' && event.payload.sessionId !== received.find(first => first.type === 'session.ready').payload.sessionId);
    assert.equal(await page.$eval('#rep-speech', element => element.disabled), false);
  } finally { await page.close(); }
});

test('replay keeps its scripted transcript, withdrawal and keyboard timeline', { timeout: 30000 }, async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/?view=live&mode=replay&t=55.5&jury=1`, { waitUntil: 'networkidle0' });
    await button(page, '暂停');
    await page.waitForSelector('[data-testid="candidate"][data-phase="withdrawn"]');
    assert.equal(await page.$('[data-testid="connection-status"]'), null);
    assert(await page.$eval('[data-testid="transcript"]', element => element.textContent.includes('eGFR')));
    await page.focus('[aria-label="回放进度"]');
    await page.keyboard.press('Home');
    assert.equal(await page.$eval('[aria-label="回放进度"]', element => element.getAttribute('aria-valuenow')), '0');
  } finally { await page.close(); }
  assert.deepEqual(errors, []);
});


test('functional UI: disconnect during doctor playback stops audio, then reconnect starts a fresh visit', { timeout: 60000, skip: real }, async () => {
  const { page, received, sent } = await pageSession({ longAudio: true, longAudioSeconds: 20 });
  try {
    await page.waitForFunction(() => window.__audioSources.some(source => source.duration === 20 && source.start && !source.end));
    console.log(JSON.stringify({ edge: 'playback-active' }));
    const oldId = received.find(event => event.type === 'session.ready').payload.sessionId;
    const opening = received.find(event => event.type === 'tts.stream_chunk').payload.utteranceId;
    await page.setOfflineMode(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.waitForSelector('[data-testid="live-error"]');
    await page.waitForFunction(() => window.__audioSources.some(source => source.duration === 20 && source.stop));
    console.log(JSON.stringify({ edge: 'offline-audio-stopped' }));
    assert.equal(await page.$eval('#rep-speech', element => element.disabled), true);
    assert.equal(await page.$('[data-testid="live-outcome"]'), null, 'disconnect does not invent a visit result');
    assert(!sent.some(event => event.type === 'visit.end'), 'disconnect is not graceful completion');
    const report = await waitEvent(sent, event => event.type === 'tts.playback' && event.payload.utteranceId === opening);
    assert.equal(report.payload.status, 'stopped');
    assert(report.payload.playedMs < 20000);
    assert.equal(sent.filter(event => event.type === 'tts.playback' && event.payload.utteranceId === opening).length, 1);
    console.log(JSON.stringify({ edge: 'stopped-report', report: report.payload }));
    await fetch(`http://127.0.0.1:${fixture.metricsPort}/short-audio`);
    await page.setOfflineMode(false);
    await button(page, '重新连接');
    const fresh = await waitEvent(received, event => event.type === 'session.ready' && event.payload.sessionId !== oldId);
    await page.waitForFunction(() => !document.querySelector('#rep-speech').disabled);
    console.log(JSON.stringify({ edge: 'fresh-session', fresh: fresh.payload.sessionId }));
    await waitEvent(sent, event => event.type === 'tts.playback' && event.payload.sessionId === fresh.payload.sessionId && event.payload.status === 'finished');
    assert.equal(await page.$('[data-testid="candidate"]'), null, 'no follow-up leaks into the fresh visit');
    console.log(JSON.stringify({ flow: 'functional-ui-disconnect-during-playback', oldSessionId: oldId, newSessionId: fresh.payload.sessionId, stoppedOnce: true }));
  } finally { await page.close(); }
});
