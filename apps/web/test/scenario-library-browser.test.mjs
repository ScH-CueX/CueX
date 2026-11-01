import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
const { chromium } = require('playwright');
const chrome = process.env.CUEX_CHROME ?? '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev';
const processes = [];
let browser, origin;
async function start(command, args, env, ready) {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  processes.push(child);
  let log = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Startup timeout: ${log}`)), 30000);
    const read = data => { log += data; const result = ready(log); if (result) { clearTimeout(timer); resolve(result); } };
    child.stdout.on('data', read); child.stderr.on('data', read);
    child.once('error', reject);
    child.once('exit', code => { if (code) { clearTimeout(timer); reject(new Error(`${code}: ${log}`)); } });
  });
}
const button = (page, name) => page.getByRole('button', { name, exact: true });
const openModal = page => button(page, 'AI 自动合成新演练素材').click();
async function fillExperience(page, context) {
  await page.getByRole('textbox', { name: '适用情境', exact: true }).fill(context);
  await page.getByRole('textbox', { name: '应对经验', exact: true }).fill('先回应关切，再引用资料。');
}
async function pageSession() {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'networkidle' });
  return { page, errors };
}
before(async () => {
  const fixture = await start(path.join(root, 'apps/server/node_modules/.bin/tsx'), ['apps/web/test/scenario-library-server.ts'], {}, log => {
    for (const line of log.split('\n')) { try { const value = JSON.parse(line); if (value.ready) return value; } catch {} }
  });
  origin = await start(path.join(root, 'apps/web/node_modules/.bin/vite'), ['--config', 'apps/web/vite.config.ts', 'apps/web', '--host', '127.0.0.1', '--port', '0'], { CUEX_SERVER_ORIGIN: `http://127.0.0.1:${fixture.port}` }, log => log.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/)?.[1]);
  browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
}, { timeout: 60000 });
after(async () => {
  await browser?.close();
  for (const child of processes.reverse()) {
    if (child.exitCode !== null) continue;
    child.kill('SIGTERM');
    await new Promise(resolve => { child.once('exit', resolve); setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000).unref(); });
  }
});

test('experience creation waits for the library snapshot, including a reopened draft', { timeout: 30000 }, async () => {
  const { page, errors } = await pageSession();
  let release;
  let snapshot;
  const loaded = () => new Promise(resolve => { snapshot = resolve; });
  let gotSnapshot = loaded();
  await page.route('**/api/experiences', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const held = new Promise(resolve => { release = resolve; });
    snapshot();
    await held;
    await route.fulfill({ response });
  });
  try {
    await openModal(page);
    await gotSnapshot;
    assert.equal(await button(page, '录入经验').isDisabled(), true, 'a late snapshot cannot overwrite a new save');
    release();
    await button(page, '录入经验').click();
    await fillExperience(page, 'Reopened draft context');
    await button(page, '关闭').click();
    gotSnapshot = loaded();
    await openModal(page);
    await gotSnapshot;
    await page.getByText('正在读取经验库…', { exact: true }).waitFor();
    assert.equal(await button(page, '保存到经验库').isDisabled(), true, 'an existing draft also waits for the snapshot');
    release();
    await button(page, '保存到经验库').click();
    const choice = page.getByRole('checkbox');
    await choice.waitFor({ state: 'visible' });
    await page.getByText('Reopened draft context', { exact: true }).waitFor();
    assert.equal(await choice.count(), 1);
    assert.equal(await choice.isChecked(), true);
    await choice.uncheck();
    assert.equal(await choice.isChecked(), false, 'the saved experience remains visible and can be excluded');
    assert.deepEqual(errors, []);
  } finally { release?.(); await page.close(); }
});

test('saved generated scene launches matching Live briefing and socket and remains on the homepage', { timeout: 45000 }, async () => {
  const { page, errors } = await pageSession();
  const sent = [];
  let socketUrl;
  const ready = new Promise(resolve => page.on('websocket', socket => {
    socketUrl = socket.url();
    socket.on('framesent', frame => { try { sent.push(JSON.parse(frame.payload)); } catch {} });
    socket.on('framereceived', frame => { try { const event = JSON.parse(frame.payload); if (event.type === 'session.ready') resolve(event.payload.scenario); } catch {} });
  }));
  try {
    await openModal(page);
    await button(page, '录入经验').click();
    await fillExperience(page, 'Launch scenario context');
    await button(page, '保存到经验库').click();
    await page.getByText('Launch scenario context', { exact: true }).waitFor();
    await page.getByLabel('医生风格', { exact: true }).selectOption('impatient');
    await page.getByLabel('门诊时间', { exact: true }).selectOption('45');
    const generated = page.waitForResponse(response => response.url().endsWith('/api/scenarios') && response.request().method() === 'POST');
    await button(page, '生成演练场景').click();
    const response = await generated;
    assert.equal(response.status(), 201);
    const scene = await response.json();
    await page.getByRole('heading', { name: scene.sceneTitle, exact: true }).waitFor();
    assert.equal(scene.experienceCount, 1);
    const briefingResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/briefing');
    await button(page, '进入这场演练').click();
    await page.waitForURL(url => url.searchParams.get('view') === 'live' && url.searchParams.get('scenarioId') === scene.id);
    const briefing = await briefingResponse;
    assert.equal(new URL(briefing.url()).searchParams.get('scenarioId'), scene.id);
    assert.equal((await briefing.json()).doctor.name, scene.doctor.name);
    await page.getByTestId('live-briefing').getByText('Browser Doctor', { exact: false }).waitFor();
    assert.equal(await page.getByLabel('回放进度').count(), 0);
    await button(page, '开始拜访').click();
    await page.getByTestId('connection-status').getByText('已连接', { exact: true }).waitFor();
    const scenario = await ready;
    assert.equal(new URL(socketUrl).searchParams.get('scenarioId'), scene.id);
    assert.equal(sent.find(event => event.type === 'session.start').payload.scenarioId, scene.id);
    assert.equal(scenario.id, scene.id);
    assert.equal(scenario.doctor.style, 'impatient');
    assert.equal(scenario.doctor.timeConstraintSec, 45);
    assert.equal(scenario.expertRules[0].scenarioContext, 'Launch scenario context');
    // Returning home must clear the selection, but retain the saved scene after reload.
    await button(page, 'CueX 首页').click();
    assert.equal(new URL(page.url()).searchParams.has('scenarioId'), false);
    await page.getByRole('heading', { name: scene.sceneTitle, exact: true }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: scene.sceneTitle, exact: true }).waitFor();
    // Old Stage links keep the chosen scene while rendering the single Live UI.
    await page.goto(`${origin}/?view=stage&scenarioId=${encodeURIComponent(scene.id)}`);
    await page.waitForURL(url => url.searchParams.get('view') === 'live');
    assert.equal(new URL(page.url()).searchParams.get('scenarioId'), scene.id);
    await page.getByTestId('live-briefing').getByText('Browser Doctor', { exact: false }).waitFor();
    assert.equal(await page.getByTestId('stage').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('an HTML proxy response reports failure and reopening recovers the experience library', { timeout: 30000 }, async () => {
  const { page, errors } = await pageSession();
  let fail = true;
  await page.route('**/api/experiences', route => fail && route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>SPA fallback</title>' })
    : route.continue());
  try {
    await openModal(page);
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('alert').innerText(), '经验库读取失败，请关闭后重试。');
    assert.equal(await page.getByRole('dialog').count(), 1);
    await button(page, '关闭').click();
    fail = false;
    await openModal(page);
    await page.getByText('Launch scenario context', { exact: true }).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0);
    assert.equal(await button(page, '生成演练场景').isEnabled(), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
