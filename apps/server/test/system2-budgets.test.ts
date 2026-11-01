import assert from 'node:assert/strict';
import test from 'node:test';
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall, type Api, type Model } from '@earendil-works/pi-ai';
import { ANSHU_PACK } from '../src/scenario/anshu';
import { createDoctorStore } from '../src/system2/doctors';
import { PiSystemTwo } from '../src/system2/PiSystemTwo';
import type { S2Runtime } from '../src/system2/config';

function setup() {
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  const model = faux.getModel() as Model<Api>;
  const original = models.streamSimple.bind(models);
  models.streamSimple = (async (...args: Parameters<typeof models.streamSimple>) => { await new Promise(resolve => setTimeout(resolve, 70)); return original(...args); }) as typeof models.streamSimple;
  const runtime: S2Runtime = { models, model, providerId: model.provider, modelId: model.id, api: model.api, baseUrl: 'faux://local', backend: 'budget-test', redact: text => text, listModelIds: () => [model.id] };
  return { faux, runtime };
}
const turn = () => fauxAssistantMessage([fauxToolCall('submit_turn', { text: '先核对亚组资料。', action: 'reply', basis: '继续核对', spokenFactIds: [] })], { stopReason: 'toolUse' });
const outcome = () => fauxAssistantMessage([fauxToolCall('submit_outcome', { stance: 'needs_evidence', doctorResponse: '资料我再核对。', rationale: '还需资料', strengths: [], gaps: [], nextStep: '核对资料', factIds: [] })], { stopReason: 'toolUse' });
const request = () => ({ sessionId: 'budget-session', pack: ANSHU_PACK, concernId: 'concern-scope', resolvedPointIds: [], history: [{ who: 'rep' as const, text: '我想核对资料。' }], repSpeech: '我想核对资料。', trigger: 'turn_end' as const, silenceStage: 0, signal: new AbortController().signal });

test('public Pi normal reply and outcome budgets are independent of the short followup/line budget', async () => {
  const { faux, runtime } = setup();
  const pi = new PiSystemTwo({ runtime, doctors: createDoctorStore('/tmp/cuex-budget-no-doctors'), timeoutMs: 25, turnTimeoutMs: 250, outcomeTimeoutMs: 250 });
  faux.setResponses([turn()]); assert.equal((await pi.prepareTurn(request())).text, '先核对亚组资料。');
  faux.setResponses([outcome()]); assert.equal((await pi.prepareOutcome({ sessionId: 'budget-session', pack: ANSHU_PACK, history: [], resolvedPointIds: [], endReason: 'user_requested', signal: new AbortController().signal })).assessment, 'completed');
  faux.setResponses([fauxAssistantMessage([fauxToolCall('say', { text: '你先说说高龄亚组。' })], { stopReason: 'toolUse' })]);
  await assert.rejects(pi.prepareDoctorLine({ sessionId: 'budget-session', pack: ANSHU_PACK, kind: 'opening', history: [], signal: new AbortController().signal }), /timed out/);
});

test('an explicit legacy timeout still bounds normal reply fixtures unless operation timeout is set', async () => {
  const { faux, runtime } = setup();
  const pi = new PiSystemTwo({ runtime, doctors: createDoctorStore('/tmp/cuex-budget-no-doctors'), timeoutMs: 25 });
  faux.setResponses([turn()]); await assert.rejects(pi.prepareTurn(request()), /timed out/);
});
