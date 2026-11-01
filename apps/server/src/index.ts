import { fileURLToPath } from 'node:url';
import { LibraryStore } from './library/LibraryStore';
import { LibraryApi } from './library/LibraryApi';
import { readConfig, createEngines } from './config';
import { WebSocketGateway } from './gateway/WebSocketGateway';
import { ANSHU_PACK } from './scenario/anshu';

const config = readConfig();
const library = new LibraryApi(new LibraryStore(process.env.CUEX_LIBRARY_DIR || fileURLToPath(new URL('../../../.cuex-runtime/library/', import.meta.url)), ANSHU_PACK));
if (config.asr === 'real' || config.tts === 'real') {
  const { warmupVoice } = await import('./voice/index');
  await warmupVoice();
}
// Each connection owns its engine instances and its cancellation lifecycle.
const gateway = new WebSocketGateway({
  port: config.port, host: config.host, pack: ANSHU_PACK, controller: config.controller,
  library,
  createEngines: pack => createEngines(config, pack),
  onSessionEnd: (snapshot, pack) => {
    void import('./system2/doctors').then(({ recordSessionMemory }) => recordSessionMemory(pack, snapshot)).catch(() => {});
  },
});
await gateway.start();
console.log(`[CueX] ws://${config.host}:${gateway.port}/ws/session; health http://${config.host}:${gateway.port}/health`);
console.log(`[CueX] engines system1=${config.system1} system2=${config.system2} asr=${config.asr} tts=${config.tts}`);
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await gateway.stop();
};
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
