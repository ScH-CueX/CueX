import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LibraryStore } from '../../server/src/library/LibraryStore';
import { LibraryApi } from '../../server/src/library/LibraryApi';
import { WebSocketGateway } from '../../server/src/gateway/WebSocketGateway';
import { ANSHU_PACK } from '../../server/src/scenario/anshu';
import { FakeSystemOne, FakeSystemTwo, SilentTts, TextOnlyAsr } from '../../server/src/fakes/engines';

// Exercise the actual persistence, HTTP and socket routes without a model or GPU.
const directory = mkdtempSync(join(tmpdir(), 'cuex-browser-library-'));
const store = new LibraryStore(directory, ANSHU_PACK);
let nextId = 0;
const library = new LibraryApi(store, {
  async generate(base, input, experiences) {
    const pack = structuredClone(base);
    pack.scenario.id = `synth-browser-${++nextId}`;
    pack.scenario.sceneTitle = `Browser generated scenario ${nextId}`;
    pack.scenario.doctor = { ...pack.scenario.doctor, id: `dr-${pack.scenario.id}`, name: 'Browser Doctor', style: input.doctorStyle, timeConstraintSec: input.timeConstraintSec, note: 'Browser doctor preferences' };
    pack.scenario.expertRules = experiences;
    pack.lineExamples.opening = ['请先说高龄患者的证据。'];
    return pack;
  },
});
const gateway = new WebSocketGateway({
  port: 0, host: '127.0.0.1', pack: ANSHU_PACK, library,
  createEngines: () => ({ system1: new FakeSystemOne(), system2: new FakeSystemTwo(50), tts: new SilentTts(), asr: new TextOnlyAsr() }),
});
await gateway.start();
console.log(JSON.stringify({ ready: true, port: gateway.port }));
const stop = async () => { await gateway.stop(); rmSync(directory, { recursive: true, force: true }); };
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
