import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

// One audience member, one rehearsal, typed speech, fake engines:
// start -> briefing -> keep pitching -> a ready follow-up is withdrawn on self-correction -> keep pitching -> the doctor interrupts
// -> answer -> closing -> review card (with the unsaid follow-up) -> retry -> rephrased opening -> 下一位.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const chrome = process.env.CUEX_CHROME ?? '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev';
const shotDir = process.env.CUEX_STAGE_SHOTS;
const processes = [];
let browser;
let fixture;
let origin;

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
async function button(page, label, timeout = 30000) {
  await page.waitForFunction(label => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === label && !button.disabled), { timeout }, label);
  await page.evaluate(label => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === label).click(), label);
}
async function waitEvent(events, predicate, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = events.find(predicate);
    if (found) return found;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`No expected event; events=${events.map(event => event.type + (event.payload?.candidate ? ':' + event.payload.candidate.phase : '')).join(',')}`);
}
async function shot(page, name, settle = 700) {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  if (settle) await new Promise(resolve => setTimeout(resolve, settle));
  await page.screenshot({ path: path.join(shotDir, `${name}.png`) });
}
async function say(page, text) {
  await page.waitForFunction(() => { const box = document.querySelector('#rep-speech'); return box && !box.disabled; }, { timeout: 30000 });
  await page.focus('#rep-speech');
  await page.type('#rep-speech', text);
  await page.keyboard.press('Enter');
}
const squash = text => text.replace(/\s+/g, '');
const isFollowup = event => event.type === 'system2.candidate' && (event.payload.task ?? 'followup') === 'followup';
const doctorLines = events => events.filter(event => event.type === 'asr.transcript' && event.payload.speaker === 'doctor');

const pitch = '主要终点是十二周时的诊室收缩压，多降了6.2毫米汞柱，而且不良反应发生率与安慰剂相当，我们还有华东地区上市后的结果，真实世界研究覆盖两万名患者，主要终点和安全性都有更多结果可以介绍。';
const selfCorrection = '我先回答您的人群问题，75 岁以上患者约占 11%，降压幅度与总体一致。eGFR 30 到 60 的亚组有 412 人，降压幅度与总体一致。';
const scopeAnswer = '好的陈主任。75 岁以上患者约占 11%，降压幅度与总体一致。eGFR 30 到 60 的亚组有 412 人，降压幅度与总体一致。eGFR 低于 30 的患者被排除在研究之外，没有证据，说明书不建议使用。';
const doseAnswer = '高龄患者的起始剂量要减半，说明书里写的是每日 2.5 mg 起始。';

before(async () => {
  fixture = await start(path.join(root, 'apps/server/node_modules/.bin/tsx'), ['apps/web/test/live-server.ts'], {}, log => {
    for (const line of log.split('\n')) { try { const value = JSON.parse(line); if (value.ready) return value; } catch {} }
  });
  origin = await start(path.join(root, 'apps/web/node_modules/.bin/vite'), ['--config', 'apps/web/vite.config.ts', 'apps/web', '--host', '127.0.0.1', '--port', '0'], { CUEX_SERVER_ORIGIN: `http://127.0.0.1:${fixture.port}` }, log => log.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/)?.[1]);
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
}, { timeout: 60000 });

after(async () => {
  await browser?.close();
  for (const child of processes.reverse()) {
    if (child.exitCode !== null) continue;
    child.kill('SIGTERM');
    await new Promise(resolve => { child.once('exit', resolve); setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000).unref(); });
  }
});

test('one rehearsal closes the loop: pitch, interruption, answer, closing, review, retry', { timeout: 240000 }, async () => {
  const errors = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  page.on('pageerror', error => errors.push(error.message));
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  const received = [];
  const sent = [];
  const capture = (target, frame) => { try { target.push({ ...JSON.parse(frame.response.payloadData), observedAt: Date.now() }); } catch {} };
  cdp.on('Network.webSocketFrameReceived', frame => capture(received, frame));
  cdp.on('Network.webSocketFrameSent', frame => capture(sent, frame));
  try {
    // The stage page is the default view and has no navbar.
    await page.goto(`${origin}/?view=stage`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-testid="stage"][data-phase="start"]');
    assert.equal(await page.$('header'), null, 'no navbar on the stage page');
    assert(await page.$('[data-testid="fullscreen"]'), 'fullscreen button');
    await shot(page, '01-start');
    await button(page, '不用麦克风，改用文字');

    await page.waitForSelector('[data-phase="briefing"]');
    await page.waitForFunction(() => document.body.innerText.includes('安舒平') && document.body.innerText.includes('第 14 页'));
    await shot(page, '02-briefing');
    await button(page, '开始拜访');

    // The doctor opens; the opening is spoken, not canned in the page.
    await page.waitForSelector('[data-phase="visit"]');
    const opening = await waitEvent(received, event => event.type === 'asr.transcript' && event.payload.speaker === 'doctor' && event.payload.isFinal);
    await page.waitForFunction(text => document.body.innerText.includes(text.slice(0, 8)), {}, opening.payload.text);
    await shot(page, '03-visit-opening');

    // The stage text without struck-through spans: a withdrawn follow-up may only ever appear struck through.
    const unstruck = () => page.evaluate(() => {
      const root = document.querySelector('[data-testid="stage"]').cloneNode(true);
      root.querySelectorAll('del').forEach(node => node.remove());
      return root.textContent.replace(/\s+/g, '');
    });

    // Underlying on, then keep pitching results until a follow-up is ready.
    await page.keyboard.press('u');
    await page.waitForSelector('.visit-under, [data-underlying="true"]');
    await say(page, pitch);
    await waitEvent(received, event => isFollowup(event) && event.payload.candidate.phase === 'ready');

    // The rep corrects course within the doctor's 1.6 s hold, so nothing slow may sit between ready and the first typed word.
    // The prepared follow-up then dissolves as 已撤销 and is never said.
    await button(page, '停止说话');
    await say(page, selfCorrection);
    const dropped = await waitEvent(received, event => isFollowup(event) && event.payload.candidate.phase === 'withdrawn');
    const droppedText = dropped.payload.candidate.draftText;
    assert(droppedText.length > 5, 'the withdrawn follow-up had a text');
    await page.waitForSelector('[data-phase="withdrawn"] del');
    assert(await page.$eval('[data-phase="withdrawn"]', element => element.textContent.includes('已撤销')), 'the visit labels it 已撤销');
    assert.equal(await page.$eval('[data-phase="withdrawn"] del', element => element.textContent.replace(/\s+/g, '')), squash(droppedText), 'the visit shows it struck through');
    assert(!(await unstruck()).includes(squash(droppedText)), 'the withdrawn follow-up is not shown as a doctor line');
    assert(!received.some(event => isFollowup(event) && event.payload.candidate.phase === 'spoken'), 'nothing was said yet');
    await shot(page, '04b-withdrawn');

    // Keep pitching. The next follow-up interrupts before the rep finishes.
    await page.waitForFunction(() => { const box = document.querySelector('#rep-speech'); return box && !box.disabled; }, { timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 300));
    const finals = () => sent.filter(event => event.type === 'speech.delta' && event.payload.isFinal).length;
    const finalsBefore = finals();
    await say(page, pitch);
    const spoken = await waitEvent(received, event => isFollowup(event) && event.payload.candidate.phase === 'spoken');
    assert.notEqual(spoken.payload.candidate.id, dropped.payload.candidate.id);
    assert.notEqual(squash(spoken.payload.candidate.draftText), squash(droppedText), 'the follow-up that was said is a different one');
    assert.equal(finals(), finalsBefore, 'the doctor interrupts before the rep finishes');
    await page.waitForSelector('[data-phase="spoken"]');
    await shot(page, '05-interruption');

    // Answer both concerns. The server then closes the visit.
    await say(page, scopeAnswer);
    const dose = await waitEvent(received, event => event.type === 'controller.dispatch' && event.payload.concernProgress.concernId === 'concern-dose', 60000);
    await waitEvent(sent, event => event.type === 'tts.playback' && event.payload.status === 'finished' && event.observedAt >= dose.observedAt);
    await shot(page, '06-next-concern');
    await say(page, doseAnswer);
    await waitEvent(received, event => event.type === 'visit.ended', 60000);

    // The review shows what happened in this run: the doctor's question, what the rep said, the doctor's reaction.
    await page.waitForSelector('[data-phase="review"]', { timeout: 15000 });
    const review = await page.evaluate(() => document.querySelector('[data-testid="stage"]').innerText);
    assert(/收缩压|不良反应|安慰剂|真实世界|华东|两万/.test(review), `review shows what the rep said: ${review}`);
    assert(squash(review).includes(squash(spoken.payload.candidate.draftText).slice(0, 6)), `review shows the doctor's follow-up: ${review}`);
    // The signature moment: the follow-up that was ready and never said, struck through.
    assert(review.includes('一句没说出口的追问'), `review shows the unsaid follow-up card: ${review}`);
    assert(review.includes('已撤销'), 'review labels it 已撤销');
    const struck = await page.$$eval('[data-testid="stage"] del', nodes => nodes.map(node => node.textContent.replace(/\s+/g, '')));
    assert(struck.some(text => text.includes(squash(droppedText))), `the withdrawn follow-up is struck through in the review: ${struck}`);
    assert(!(await unstruck()).includes(squash(droppedText)), 'the withdrawn follow-up appears in the review only struck through');
    assert(!doctorLines(received).some(event => squash(event.payload.text).includes(squash(droppedText).slice(0, 8))), 'the withdrawn follow-up was never said by the doctor');
    await shot(page, '07-review');
    const firstOpening = doctorLines(received)[0].payload.text;
    const readyCount = received.filter(event => event.type === 'session.ready').length;

    // Retry the concern: the doctor rephrases it.
    await button(page, '从这里再试一次');
    const restart = await waitEvent(sent, event => event.type === 'session.start' && event.payload.retry);
    assert.equal(restart.payload.retry.concernId, 'concern-scope');
    await waitEvent(received, event => event.type === 'session.ready' && received.filter(item => item.type === 'session.ready').length > readyCount);
    const retryReady = received.filter(event => event.type === 'session.ready').at(-1);
    const rephrased = await waitEvent(received, event => event.type === 'asr.transcript' && event.payload.speaker === 'doctor' && event.observedAt >= retryReady.observedAt);
    await page.waitForSelector('[data-phase="visit"]');
    await page.waitForFunction(text => document.body.innerText.includes(text.slice(0, 6)), {}, rephrased.payload.text);
    assert.notEqual(rephrased.payload.text.slice(0, 20), firstOpening.slice(0, 20), 'the doctor rephrases instead of repeating the opening');
    await shot(page, '08-retry-opening');

    // Answer the rephrased question. The visit closes again and the review compares with the first visit.
    await say(page, scopeAnswer);
    await waitEvent(received, event => event.type === 'controller.dispatch' && event.payload.concernProgress.concernId === 'concern-dose' && event.observedAt >= retryReady.observedAt, 60000);
    await page.waitForFunction(() => { const box = document.querySelector('#rep-speech'); return box && !box.disabled; });
    await say(page, doseAnswer);
    await waitEvent(received, event => event.type === 'visit.ended' && event.observedAt >= retryReady.observedAt, 60000);
    await page.waitForSelector('[data-phase="review"]', { timeout: 15000 });
    await shot(page, '09-retry-review');

    // 下一位 clears everything for the next audience member.
    await button(page, '下一位');
    await page.waitForSelector('[data-phase="start"]');
    assert(!(await page.evaluate(() => document.querySelector('[data-testid="stage"]').innerText)).includes('降压幅度与总体一致'), 'nothing of the last visit stays on screen');
    await button(page, '不用麦克风，改用文字');
    await page.waitForSelector('[data-phase="briefing"]');
    await button(page, '开始拜访');
    await page.waitForSelector('[data-phase="visit"]');
    assert.equal(await page.$('[data-phase="spoken"]'), null, 'no candidate carries over');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
