import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(path.join(root, 'apps/web/package.json'));
const puppeteer = require('puppeteer-core');
const chrome = process.env.CUEX_CHROME ?? '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev';
const shotDir = process.env.CUEX_LIVE_SHOTS;
const processes = [];
let browser, origin, fixtureControl;
async function start(command, args, env, ready) {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  processes.push(child);
  let log = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Startup timeout: ${log}`)), 30000);
    const read = data => { log += data; const result = ready(log); if (result) { clearTimeout(timer); resolve(result); } };
    child.stdout.on('data', read); child.stderr.on('data', read);
    child.once('error', reject); child.once('exit', code => { if (code) { clearTimeout(timer); reject(new Error(`${code}: ${log}`)); } });
  });
}
async function button(page, label) {
  await page.waitForFunction(label => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === label && !b.disabled), {}, label);
  const handle = await page.evaluateHandle(label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label && !b.disabled), label);
  await handle.asElement().click(); await handle.dispose();
}
async function shot(page, name) {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(shotDir, `${name}.png`) });
}
async function session(query = '?view=live', targetBrowser = browser) {
  const page = await targetBrowser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1920, height: 1080 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const cdp = await page.createCDPSession(); await cdp.send('Network.enable');
  const received = [], sent = [];
  const capture = (target, frame) => { try { target.push(JSON.parse(frame.response.payloadData)); } catch {} };
  cdp.on('Network.webSocketFrameReceived', frame => capture(received, frame));
  cdp.on('Network.webSocketFrameSent', frame => capture(sent, frame));
  // Track visible user-input cleanup and actual media tracks on natural end.
  await page.evaluateOnNewDocument(() => {
    window.__tracks = [];
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async options => { const stream = await get(options); window.__tracks.push(...stream.getTracks()); return stream; };
  });
  const cssResponses = [];
  page.on('response', response => { if (response.url().includes('/src/index.css')) cssResponses.push(response.status()); });
  await page.goto(origin + query, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  assert(cssResponses.includes(200), 'app stylesheet loaded');
  const layout = await page.evaluate(() => {
    const root = document.querySelector('[data-ui="training"]');
    const grid = root.querySelector('[data-testid="live-grid"]');
    return { display: getComputedStyle(grid).display, columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, font: getComputedStyle(root).fontFamily, overflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  assert.equal(layout.display, 'grid', 'Tailwind grid utilities compiled');
  assert.equal(layout.columns, 12, 'existing desktop Live grid preserved');
  assert(layout.font.includes('Noto Serif SC'));
  assert.equal(layout.overflow, false, 'no horizontal overflow');
  const doctorSize = await page.$eval('[data-capture="doctor"]', el => ({ width: el.clientWidth, height: el.clientHeight }));
  assert(doctorSize.width > 500 && doctorSize.height >= 460, `doctor keeps existing size: ${JSON.stringify(doctorSize)}`);
  return { page, sent, received, errors };
}
async function untilEvent(page, events, predicate) {
  // CDP events stay in Node; this short event-driven gate avoids fixed-success wording.
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const found = events.find(predicate); if (found) return found;
    await page.waitForFunction(() => true);
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`Missing event: ${events.map(e => e.type).join(',')}`);
}
before(async () => {
  const fixture = await start(path.join(root, 'apps/server/node_modules/.bin/tsx'), ['apps/web/test/live-conversation-server.ts'], {}, log => {
    for (const line of log.split('\n')) { try { const value = JSON.parse(line); if (value.ready) return value; } catch {} }
  });
  fixtureControl = `http://127.0.0.1:${fixture.controlPort}`;
  origin = await start(path.join(root, 'apps/web/node_modules/.bin/vite'), ['--config', 'apps/web/vite.config.ts', 'apps/web', '--host', '127.0.0.1', '--port', '0'], { CUEX_SERVER_ORIGIN: `http://127.0.0.1:${fixture.port}` }, log => log.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/)?.[1]);
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
}, { timeout: 60000 });
after(async () => {
  await browser?.close();
  for (const child of processes.reverse()) {
    if (child.exitCode !== null) continue;
    child.kill('SIGTERM');
    await new Promise(resolve => { child.once('exit', resolve); setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000).unref(); });
  }
});

test('Live is real by default, old stage aliases Live, and start waits for a gesture', { timeout: 30000 }, async () => {
  const h = await session('?view=stage');
  try {
    assert.equal(new URL(h.page.url()).searchParams.get('view'), 'live');
    await h.page.waitForSelector('[data-testid="live-briefing"]');
    assert.equal(await h.page.$('[data-testid="stage"]'), null);
    assert.equal(h.sent.filter(e => e.type === 'session.start').length, 0);
    assert.equal(await h.page.$('[aria-label="回放进度"]'), null);
    await h.page.waitForFunction(() => document.querySelector('[data-testid="live-briefing"]').textContent.includes('第 14 页'));
    await shot(h.page, '01-live-briefing');
    await button(h.page, '开始拜访');
    await untilEvent(h.page, h.sent, e => e.type === 'tts.playback' && e.payload.status === 'finished');
    assert.equal(h.sent.filter(e => e.type === 'session.start').length, 1);
    await h.page.waitForSelector('[data-testid="system2-activities"]');
    await shot(h.page, '02-live-doctor');
    assert.deepEqual(h.errors, []);
  } finally { await h.page.close(); }
});

test('wrong answer gets a real response; graceful end keeps closing and renders outcome, retry and next visitor reset', { timeout: 60000 }, async () => {
  const h = await session();
  try {
    await button(h.page, '开始拜访');
    await untilEvent(h.page, h.sent, e => e.type === 'tts.playback' && e.payload.status === 'finished');
    await h.page.type('#rep-speech', '肾功能30到60的结果不太好。'); await h.page.keyboard.press('Enter');
    await untilEvent(h.page, h.received, e => e.type === 'system2.activity' && e.payload.kind === 'reply' && e.payload.phase === 'completed');
    const doctorLines = h.received.filter(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.isFinal);
    assert(doctorLines.length >= 2);
    assert(!h.received.some(e => e.type === 'conversation.progress' && e.payload.resolvedPointIds.includes('c2')));
    await h.page.waitForSelector('[data-testid="system2-activity"][data-kind="reply"]');
    await shot(h.page, '03-live-response');
    await button(h.page, '结束并复盘');
    await h.page.waitForSelector('[data-testid="visit-closing"]');
    assert(await h.page.$('[data-capture="doctor"]'));
    assert.equal(await h.page.$eval('#rep-speech', e => e.disabled), true);
    const endRequest = await untilEvent(h.page, h.sent, e => e.type === 'visit.end');
    assert.equal(endRequest.payload.sessionId, h.received.find(e => e.type === 'session.ready').payload.sessionId);
    assert(!h.sent.some(e => e.type === 'session.stop'));
    const ended = await untilEvent(h.page, h.received, e => e.type === 'visit.ended');
    await h.page.waitForSelector('[data-testid="live-outcome"]');
    assert.equal(await h.page.$eval('[data-testid="outcome-stance"]', e => e.textContent), '仍需补充证据');
    assert(await h.page.$eval('[data-testid="outcome-rationale"]', (e, rationale) => e.textContent === rationale, ended.payload.outcome.rationale));
    assert(!h.sent.some(e => e.type === 'session.stop'));
    await shot(h.page, '04-live-outcome');
    const count = h.received.filter(e => e.type === 'session.ready').length;
    await button(h.page, '从这里再试一次');
    await untilEvent(h.page, h.sent, e => e.type === 'session.start' && e.payload.retry);
    await h.page.waitForSelector('#rep-speech:not([disabled])');
    assert.equal(await h.page.$('[data-testid="live-outcome"]'), null);
    await untilEvent(h.page, h.received, () => h.received.filter(e => e.type === 'session.ready').length > count);
    assert.equal(await h.page.$('[data-testid="candidate"][data-phase="spoken"]'), null);
    await shot(h.page, '05-live-retry');
    await button(h.page, '结束并复盘');
    await h.page.waitForSelector('[data-testid="live-outcome"]');
    await button(h.page, '下一位');
    await h.page.waitForSelector('[data-testid="live-briefing"]');
    assert.equal(await h.page.$('[data-testid="live-outcome"]'), null);
    assert.equal(await h.page.$('#rep-speech'), null);
    assert.deepEqual(h.errors, []);
  } finally { await h.page.close(); }
});

test('natural silence ends capture and shows actual outcome without a user end request', { timeout: 45000 }, async () => {
  const h = await session();
  try {
    await button(h.page, '开始拜访');
    await h.page.waitForSelector('#rep-speech:not([disabled])');
    await h.page.evaluate(() => { const get = navigator.mediaDevices.getUserMedia; navigator.mediaDevices.getUserMedia = async () => { const ctx = new AudioContext(); const destination = ctx.createMediaStreamDestination(); window.__tracks.push(...destination.stream.getTracks()); return destination.stream; }; });
    await button(h.page, '开启麦克风');
    await h.page.waitForFunction(() => window.__tracks.some(t => t.readyState === 'live'));
    // Deterministic silence fixtures leave the representative quiet through the bounded prompts.
    // End naturally by selecting a final idle closing through the test fixture's third silence stage.
    await h.page.waitForSelector('[data-testid="live-outcome"]', { timeout: 35000 });
    assert.equal(await h.page.evaluate(() => window.__tracks.every(t => t.readyState === 'ended')), true);
    assert(!h.sent.some(e => e.type === 'visit.end'));
    assert(h.received.some(e => e.type === 'system2.activity' && e.payload.kind === 'silence_prompt'));
  } finally { await h.page.close(); }
});

test('grounded progress replaces old claims and cancelled response activity stays cancelled', { timeout: 30000 }, async () => {
  const h = await session('?view=live&mode=replay&paused=1');
  try {
    const result = await h.page.evaluate(async () => {
      const { emptySession, liveSessionReducer: reduce } = await import('/src/core/session/liveSession.ts');
      const apply = (state, type, payload) => reduce(state, { type: 'event', event: { type, payload } });
      let state = apply(emptySession, 'conversation.progress', { sessionId: 'fixture', resolvedPointIds: ['c2'] });
      state = apply(state, 'conversation.progress', { sessionId: 'fixture', resolvedPointIds: [] });
      state = apply(state, 'system1.verdict', { requestId: 's1', resolvedPointIds: ['c2'] });
      state = apply(state, 'system2.activity', { sessionId: 'fixture', taskId: 'reply-1', kind: 'reply', phase: 'preparing' });
      state = apply(state, 'system2.activity', { sessionId: 'fixture', taskId: 'reply-1', kind: 'reply', phase: 'cancelled', reason: '代表补充了新的表达' });
      return { resolved: state.resolved, phases: state.activities.map(a => a.phase), fresh: reduce(state, { type: 'visit' }).activities };
    });
    assert.deepEqual(result, { resolved: {}, phases: ['cancelled'], fresh: [] });
  } finally { await h.page.close(); }
});


test('functional UI: repeated end clicks send once and keep retry locked during assessment', { timeout: 30000 }, async () => {
  const h = await session();
  try {
    await button(h.page, '开始拜访');
    await untilEvent(h.page, h.sent, e => e.type === 'tts.playback' && e.payload.status === 'finished');
    const sessionId = h.received.find(e => e.type === 'session.ready').payload.sessionId;
    const control = (action) => fetch(`${fixtureControl}/assessment/${action}?sessionId=${encodeURIComponent(sessionId)}`, { method: 'POST' });
    assert((await control('hold')).ok);
    // Two user-facing end controls exist. Click both in the same task to exercise the driver guard before React renders.
    await h.page.evaluate(() => {
      const ends = [...document.querySelectorAll('button')].filter(button => button.textContent.trim() === '结束并复盘');
      ends[0].click(); ends[1].click(); ends[0].click();
    });
    await h.page.waitForSelector('[data-testid="system2-activity"][data-kind="assessment"][data-phase="preparing"]');
    assert.equal(await h.page.$eval('#rep-speech', element => element.disabled), true);
    assert.equal(await h.page.$('[data-testid="live-outcome"]'), null);
    assert.equal(await h.page.evaluate(() => [...document.querySelectorAll('button')].filter(button => /从这里再试一次|再练一次|下一位/.test(button.textContent)).length), 0, 'retry is offered only after an actual result');
    assert.equal(await h.page.evaluate(() => [...document.querySelectorAll('button')].filter(button => /结束并复盘|医生正在收尾/.test(button.textContent)).every(button => button.disabled)), true);
    assert((await control('release')).ok);
    await h.page.waitForSelector('[data-testid="live-outcome"]');
    assert.equal(h.sent.filter(e => e.type === 'visit.end').length, 1, 'one close request for repeated clicks');
    assert.equal(h.received.filter(e => e.type === 'visit.ended').length, 1, 'one actual result');
    assert.equal(h.sent.filter(e => e.type === 'session.start').length, 1, 'no premature retry session');
    assert(!h.sent.some(e => e.type === 'session.stop'));
    await button(h.page, '从这里再试一次');
    const retried = await untilEvent(h.page, h.sent, e => e.type === 'session.start' && e.payload.retry);
    assert(retried.payload.retry.concernId);
    await h.page.waitForSelector('#rep-speech:not([disabled])');
    assert.deepEqual(h.errors, []);
    console.log(JSON.stringify({ flow: 'functional-ui-repeat-end-assessment-lock', endRequests: 1, results: 1, retryAfterResult: true }));
  } finally { await h.page.close(); }
});

test('functional UI: denied microphone permission keeps text input usable and receives a doctor response', { timeout: 30000 }, async () => {
  // Auto-grant media flags override CDP denial. Use a browser without the auto-grant flag for this user path.
  const deniedBrowser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream'] });
  const h = await session('?view=live', deniedBrowser);
  try {
    const cdp = await h.page.createCDPSession();
    await cdp.send('Browser.setPermission', { permission: { name: 'microphone' }, setting: 'denied', origin });
    console.log(JSON.stringify({ edge: 'permission-set', state: await h.page.evaluate(async () => (await navigator.permissions.query({ name: 'microphone' })).state) }));
    await button(h.page, '开始拜访');
    await untilEvent(h.page, h.sent, e => e.type === 'tts.playback' && e.payload.status === 'finished');
    console.log(JSON.stringify({ edge: 'permission-opening-finished' }));
    await button(h.page, '开启麦克风');
    console.log(JSON.stringify({ edge: 'permission-mic-clicked' }));
    await h.page.waitForFunction(() => document.querySelector('[data-testid="live-error"]')?.textContent.includes('麦克风权限已关闭'), { timeout: 7000 }).catch(async error => { console.log(JSON.stringify({ edge: 'permission-failure-diagnostic', ui: await h.page.evaluate(() => ({ error: document.querySelector('[data-testid="live-error"]')?.textContent, controls: document.querySelector('[aria-label="实时回应"]')?.textContent, tracks: window.__tracks.length, permission: navigator.permissions.query({ name: 'microphone' }).then(p => p.state) })), sent: h.sent.map(e => e.type) })); throw error; });
    console.log(JSON.stringify({ edge: 'permission-error-visible' }));
    assert.equal(await h.page.$eval('#rep-speech', element => element.disabled), false);
    assert(!h.sent.some(e => e.type === 'audio.chunk'));
    await h.page.type('#rep-speech', '您好，您最关心哪些患者？'); await h.page.keyboard.press('Enter');
    await untilEvent(h.page, h.received, e => e.type === 'system2.activity' && e.payload.kind === 'reply' && e.payload.phase === 'completed');
    assert(h.sent.some(e => e.type === 'speech.delta' && e.payload.isFinal));
    assert(h.received.filter(e => e.type === 'asr.transcript' && e.payload.speaker === 'doctor' && e.payload.isFinal).length >= 2);
    assert.equal(await h.page.$('[data-testid="live-error"]'), null, 'text response clears the permission error');
    assert.equal(await h.page.evaluate(() => window.__tracks.length), 0);
    assert.deepEqual(h.errors, []);
    console.log(JSON.stringify({ flow: 'functional-ui-denied-mic-text-recovery', audioChunks: 0, typedReply: true }));
  } finally { await h.page.close(); await deniedBrowser.close(); }
});
