import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
import { WebSocketGateway } from '../../server/src/gateway/WebSocketGateway';
import { FakeSystemOne, FakeSystemTwo, SilentTts, TextOnlyAsr } from '../../server/src/fakes/engines';
import { ANSHU_PACK } from '../../server/src/scenario/anshu';
import type { DoctorTurnRequest, DoctorOutcomeRequest } from '../../server/src/contracts';

let heldSession: string | undefined;
let releaseAssessment: (() => void) | undefined;
class ConversationFixture extends FakeSystemTwo {
  async prepareTurn(req: DoctorTurnRequest) {
    await delay(100, undefined, { signal: req.signal });
    const wrong = /不太好|不好/.test(req.repSpeech);
    return { text: req.trigger === 'silence' ? '可以先看资料，高龄患者占多少？' : wrong ? '肾功能亚组的降压幅度与总体一致。你能说说研究里的人数吗？' : '我们先看高龄患者，研究中七十五岁以上占多少？', action: req.silenceStage >= 3 ? 'end_visit' as const : 'reply' as const,
      resolvedPointIds: [], contradictedPointIds: wrong ? ['c2'] : [], basis: wrong ? '代表的结论与资料中的亚组结果不符，需补充人数与适用范围。' : '先明确医生关心的人群证据。', sourceEvidence: req.pack.facts[0].source };
  }
  async prepareOutcome(req: DoctorOutcomeRequest) {
    if (heldSession === req.sessionId) {
      await new Promise<void>((resolve, reject) => {
        const abort = () => { releaseAssessment = undefined; reject(req.signal.reason); };
        releaseAssessment = () => { req.signal.removeEventListener('abort', abort); releaseAssessment = undefined; resolve(); };
        req.signal.addEventListener('abort', abort, { once: true });
        if (req.signal.aborted) abort();
      });
    }
    await delay(Number(process.env.CUEX_WEB_OUTCOME_DELAY_MS ?? 350), undefined, { signal: req.signal });
    return { assessment: 'completed' as const, stance: 'needs_evidence' as const,
      doctorResponse: '我还需要高龄和肾功能亚组的具体证据，再考虑继续讨论。', rationale: '这次交流还没有说明亚组人数和使用边界。',
      strengths: [], gaps: [{ pointId: 'c2', quote: req.history.find(turn => turn.who === 'rep')?.text, explanation: '需要核对肾功能亚组的结果。' }], nextStep: '补充亚组人数、疗效结果和说明书适用范围。' };
  }
}
const gateway = new WebSocketGateway({ port: 0, host: '127.0.0.1', pack: ANSHU_PACK,
  createEngines: () => ({ system1: new FakeSystemOne(), system2: new ConversationFixture(50), asr: new TextOnlyAsr(), tts: new SilentTts() }),
  controller: { debounceMs: 25, minDriftMs: 500, candidateHoldMs: 600, minInterruptGapMs: 200, finalQuietMs: 120, partialQuietMs: 650, idleFirstMs: 2500, idleSecondMs: 4000, idleCloseMs: 6000, turnTimeoutMs: 1500 },
});
await gateway.start();
const control = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://fixture');
  const sessionId = url.searchParams.get('sessionId');
  if (req.method === 'POST' && url.pathname === '/assessment/hold' && sessionId) { heldSession = sessionId; res.end('held'); }
  else if (req.method === 'POST' && url.pathname === '/assessment/release' && sessionId === heldSession) { heldSession = undefined; releaseAssessment?.(); res.end('released'); }
  else { res.statusCode = 400; res.end('invalid fixture control'); }
});
await new Promise<void>(resolve => control.listen(0, '127.0.0.1', resolve));
console.log(JSON.stringify({ ready: true, port: gateway.port, controlPort: (control.address() as import('node:net').AddressInfo).port }));
const stop = async () => { releaseAssessment?.(); await gateway.stop(); control.close(); };
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
