import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node22 = '/opt/homebrew/opt/node@22/bin/node';
const executable = existsSync(node22) ? node22 : process.execPath;
const env = { ...process.env, PATH: `${path.dirname(executable)}:${process.env.PATH ?? ''}`,
  CUEX_SYSTEM1: 'real', CUEX_SYSTEM2: 'real', CUEX_ASR: 'real', CUEX_TTS: 'real',
  CUEX_S1_URL: process.env.CUEX_S1_URL ?? 'http://127.0.0.1:18080',
  // ASR defaults to the Mac model; an explicit CUEX_ASR_URL still selects a remote engine.
};
const port = Number(env.PORT ?? 8765);
const webPort = Number(env.CUEX_WEB_PORT ?? 5173);
env.CUEX_SERVER_ORIGIN = `http://127.0.0.1:${port}`;
const children = new Map();
let stopping = false;

function start(name, command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, env, detached: true, stdio: 'inherit', ...options });
  children.set(name, child);
  child.once('error', error => { console.error(`[demo] ${name}: ${error.message}`); void stop(1); });
  child.once('exit', code => {
    children.delete(name);
    if (!stopping && !options.expectedExit) {
      console.error(`[demo] ${name} stopped (${code ?? 'signal'}).`);
      void stop(code || 1);
    }
  });
  return child;
}

function stopGroup(child, signal) {
  try { process.kill(-child.pid, signal); } catch { /* Already stopped. */ }
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  const owned = [...children.values()];
  const force = setTimeout(() => { owned.forEach(child => stopGroup(child, 'SIGKILL')); process.exit(code); }, 2500);
  force.unref();
  owned.forEach(child => stopGroup(child, 'SIGTERM'));
  await Promise.all(owned.map(child => child.exitCode !== null || child.signalCode ? undefined : new Promise(resolve => child.once('exit', resolve))));
  clearTimeout(force);
  process.exit(code);
}
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });

function tcp(url) {
  const target = new URL(url);
  return new Promise(resolve => {
    const socket = createConnection({ host: target.hostname, port: Number(target.port || (target.protocol === 'wss:' ? 443 : 80)) });
    const finish = ok => { socket.destroy(); resolve(ok); };
    socket.setTimeout(1200, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}
async function http(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}
async function waitFor(label, probe, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (!stopping && Date.now() < deadline) {
    if (await probe()) return;
    // Readiness loop runs in the launcher process, not in the agent kernel.
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`${label} did not become ready within ${timeoutMs / 1000}s`);
}
async function runProbe() {
  const child = start('engine-check', executable, [path.join(root, 'apps/server/node_modules/tsx/dist/cli.mjs'), 'apps/server/src/gateway/demoHealth.ts'], { expectedExit: true });
  const code = await new Promise(resolve => child.once('exit', resolve));
  if (code !== 0) throw new Error('Engine check failed. Fix the unavailable engine and run pnpm demo again.');
}

try {
  if (await tcp(`http://127.0.0.1:${port}`) || await tcp(`http://127.0.0.1:${webPort}`)) {
    throw new Error(`Demo ports ${port}/${webPort} are already in use. Stop the old demo, or set PORT and CUEX_WEB_PORT.`);
  }
  if (!await http(`${env.CUEX_S1_URL.replace(/\/$/, '')}/health`)) {
    console.log('[demo] Starting the JEV model tunnel.');
    start('tunnel', '/bin/bash', ['apps/server/scripts/s1-tunnel.sh']);
    await waitFor('JEV forward', () => http(`${env.CUEX_S1_URL.replace(/\/$/, '')}/health`));
  } else console.log('[demo] Reusing the existing JEV forward.');
  await runProbe();
  if (stopping) process.exit(0);
  start('server', executable, [path.join(root, 'apps/server/node_modules/tsx/dist/cli.mjs'), 'apps/server/src/index.ts']);
  await waitFor('CueX server', () => http(`${env.CUEX_SERVER_ORIGIN}/health`), 30000);
  start('web', executable, [path.join(root, 'apps/web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], { cwd: path.join(root, 'apps/web') });
  await waitFor('CueX web', () => http(`http://127.0.0.1:${webPort}`), 20000);
  console.log(`[demo] Ready: http://127.0.0.1:${webPort}/?view=live — Ctrl-C stops this launcher’s processes.`);
} catch (error) {
  if (!stopping) console.error(`[demo] ${error instanceof Error ? error.message : 'Startup failed'}`);
  await stop(1);
}
