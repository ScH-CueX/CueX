import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall, type Api, type Model } from '@earendil-works/pi-ai';
import type { DoctorTurnRequest } from '../src/contracts';
import { ANSHU_PACK } from '../src/scenario/anshu';
import type { S2Runtime } from '../src/system2/config';
import { createDoctorStore } from '../src/system2/doctors';
import { PiSystemTwo } from '../src/system2/PiSystemTwo';

function setup(tokensPerSecond?: number, timeoutMs = 1000) {
  const faux = fauxProvider({ tokensPerSecond });
  const models = createModels();
  models.setProvider(faux.provider);
  const model = faux.getModel() as Model<Api>;
  const runtime: S2Runtime = {
    models, model, providerId: model.provider, modelId: model.id, api: model.api,
    baseUrl: 'faux://local', backend: 'faux-turn', redact: (s) => s, listModelIds: () => [model.id],
  };
  const s2 = new PiSystemTwo({ runtime, doctors: createDoctorStore('/tmp/cuex-turn-no-doctors'), timeoutMs });
  return { faux, s2 };
}
function request(repSpeech: string, over: Partial<DoctorTurnRequest> = {}): DoctorTurnRequest {
  return {
    sessionId: 'turn-test', pack: ANSHU_PACK, concernId: 'concern-scope', resolvedPointIds: [],
    history: [{ who: 'doctor', text: 'eGFR 30 到 60 的患者结果怎么样？' }, { who: 'rep', text: repSpeech }],
    repSpeech, trigger: 'turn_end', silenceStage: 0, signal: new AbortController().signal, ...over,
  };
}
const assessment = (a: Record<string, unknown>, relation: string) => {
  const quote = String(a.repQuote ?? '');
  const populationQuote = quote.includes('75') ? '75岁以上' : quote.includes('三十') ? '肾功能三十到六十' : quote.includes('eGFR') ? 'eGFR 30 到 60' : quote.includes('三十二六十') ? '三十二六十' : quote.includes('这个亚组') ? '这个亚组' : quote.slice(0, 2);
  const { relation: _oldRelation, ...fields } = a;
  return { status: relation === 'contradicted' ? 'contradicted' : 'complete', claimContext: [quote], missingAspects: [], withdrawalQuote: '',
    coveredAspects: (ANSHU_PACK.pointRequirements?.[String(a.pointId)] ?? []).map((_requirement, requirementIndex) => ({ requirementIndex, quote })), populationQuote, factPopulationQuote: a.pointId === 'c1' ? '75 岁以上患者' : 'eGFR 30 到 60', ...fields };
};
const answer = (text: string, over: Record<string, unknown> = {}) => fauxAssistantMessage([
  fauxToolCall('submit_turn', {
    text, action: 'reply', basis: '继续核实适用范围', resolvedAnswers: [], contradictedAnswers: [], spokenFactIds: [], ...over,
    assessments: [
      ...((over.resolvedAnswers ?? []) as Record<string, unknown>[]).map((a) => assessment(a, 'supported')),
      ...((over.contradictedAnswers ?? []) as Record<string, unknown>[]).map((a) => assessment(a, 'contradicted')),
      ...((over.assessments ?? []) as Record<string, unknown>[]),
    ],
  }),
], { stopReason: 'toolUse' });
const supported = { pointId: 'c2', repQuote: 'eGFR 30 到 60 的亚组有 412 人，降压幅度与总体一致。', factIds: ['f-egfr-30-60'] };

test('normal doctor reply acknowledges supported evidence without inventing progress', async () => {
  const { faux, s2 } = setup();
  faux.setResponses([answer('这组的结果有依据了。低于 30 的患者有研究数据吗？', {
    resolvedAnswers: [supported], spokenFactIds: ['f-egfr-30-60', 'f-egfr-lt30'],
  })]);
  const draft = await s2.prepareTurn!(request(supported.repQuote));
  assert.deepEqual(draft.resolvedPointIds, ['c2']);
  assert.deepEqual(draft.contradictedPointIds, []);
  assert.equal(draft.action, 'reply');
  assert.match(draft.sourceEvidence!, /第 14 页/);
  assert.equal(faux.state.callCount, 1);
});

test('false poor-result claim gets an evidence-seeking correction, never c2 resolution', async () => {
  const { faux, s2 } = setup();
  const claim = 'eGFR 30 到 60 的患者结果不是特别好，没有准确测量。';
  faux.setResponses([answer('资料里的降压幅度与总体一致，你说结果不好，依据是哪一项？', {
    contradictedAnswers: [{ pointId: 'c2', repQuote: claim, factIds: ['f-egfr-30-60'] }],
    spokenFactIds: ['f-egfr-30-60'],
  })]);
  const draft = await s2.prepareTurn!(request(claim));
  assert.deepEqual(draft.resolvedPointIds, []);
  assert.deepEqual(draft.contradictedPointIds, ['c2']);
  assert.match(draft.text, /依据/);
  // Even a malformed classifier cannot permanently accept a vague or unsupported answer.
  faux.setResponses([answer('好。', { resolvedAnswers: [{ ...supported, repQuote: claim }] })]);
  const safe = await s2.prepareTurn!(request(claim));
  assert.deepEqual(safe.resolvedPointIds, []);
  assert.equal(safe.text, '好。');
});

test('uncertainty, greeting, partial answer and rep question keep a natural conversation open', async () => {
  const cases = [
    ['我不知道，手上没有准确数据。', '可以先看亚组表，你能找到肾功能那一行吗？'],
    ['主任您好。', '你好，我想先了解肾功能不好的患者有哪些数据。'],
    ['这个亚组有 412 人。', '人数有了，这组的降压幅度和总体相比怎么样？'],
    ['主任您为什么关心这个亚组？', '我门诊肾功能不好的患者多，要先确认研究是否覆盖。'],
    ['这个亚组的结果是什么？', '资料里这组降压幅度与总体一致。你能指一下出处吗？'],
  ];
  for (const [rep, text] of cases) {
    const { faux, s2 } = setup();
    faux.setResponses([answer(text, { spokenFactIds: ['f-egfr-30-60'] })]);
    const draft = await s2.prepareTurn!(request(rep));
    assert.ok(draft.text.length > 0);
    assert.deepEqual(draft.resolvedPointIds, []);
    assert.deepEqual(draft.contradictedPointIds, []);
    assert.equal(draft.action, 'reply');
  }
});

test('silence prompts are bounded and distinct, stage three ends with points still open', async () => {
  const { faux, s2 } = setup();
  const lines = ['可以先从亚组表里找肾功能那一行。', '先看这组和总体的降压幅度是否一致。', '今天先到这里，资料回头补给我，谢谢。'];
  for (let stage = 1; stage <= 3; stage++) {
    faux.setResponses([answer(lines[stage - 1], { action: stage === 3 ? 'end_visit' : 'reply' })]);
    const draft = await s2.prepareTurn!(request('', { trigger: 'silence', silenceStage: stage }));
    assert.equal(draft.action, stage === 3 ? 'end_visit' : 'reply');
    assert.deepEqual(draft.resolvedPointIds, []);
  }
});

test('early farewell closes neutrally without resolving unanswered questions', async () => {
  const { faux, s2 } = setup();
  faux.setResponses([answer('好的，今天先到这里，资料之后发我。', { action: 'end_visit' })]);
  const draft = await s2.prepareTurn!(request('那我先走了，主任再见。'));
  assert.equal(draft.action, 'end_visit');
  assert.deepEqual(draft.resolvedPointIds, []);
});

test('doctor speech is not discarded by broad persona or tone checks, while optional unknown point marks are dropped', async () => {
  const { faux, s2 } = setup();
  faux.setResponses([answer('我有位患者 eGFR 45，用药时需要核对适用情况。', { resolvedAnswers: [{ ...supported, pointId: 'unknown' }] })]);
  const draft = await s2.prepareTurn!(request('请解释一下。'));
  assert.match(draft.text, /eGFR 45/);
  assert.deepEqual(draft.resolvedPointIds, []);
});

test('empty output is rejected but a clean spoken answer is usable without manufactured point marks', async () => {
  const { faux, s2 } = setup();
  faux.setResponses([answer('')]);
  await assert.rejects(s2.prepareTurn!(request('不知道。')), /empty/);
  faux.setResponses([fauxAssistantMessage([fauxText('好，请先核对亚组表。')])]);
  const draft = await s2.prepareTurn!(request('不知道。'));
  assert.equal(draft.text, '好，请先核对亚组表。');
  assert.deepEqual(draft.resolvedPointIds, []);
});

test('new visitor speech cancels an in-flight turn and pre-cancelled requests never call model', async () => {
  const { faux, s2 } = setup(20, 2000);
  const ctl = new AbortController();
  faux.setResponses([answer('请先看一下研究的亚组分析表。', { basis: '慢'.repeat(400) })]);
  const pending = s2.prepareTurn!(request('不知道。', { signal: ctl.signal }));
  setTimeout(() => ctl.abort(), 20);
  await assert.rejects(pending, { name: 'AbortError' });
  const calls = faux.state.callCount;
  await assert.rejects(s2.prepareTurn!(request('再见。', { signal: ctl.signal })), { name: 'AbortError' });
  assert.equal(faux.state.callCount, calls);
});

test('a stalled model has a hard deadline, not indefinite listening', async () => {
  const { faux, s2 } = setup(10, 30);
  faux.setResponses([answer('请看亚组表。', { basis: '慢'.repeat(400) })]);
  await assert.rejects(s2.prepareTurn!(request('不知道。')), /timed out/);
});

const outcomeAnswer = (over: Record<string, unknown> = {}) => fauxAssistantMessage([
  fauxToolCall('submit_outcome', {
    stance: 'needs_evidence', doctorResponse: '我需要先核对亚组资料，再考虑下一步交流。',
    rationale: '目前缺少肾功能人群的具体结果和适用边界。', strengths: [],
    gaps: [{ pointId: 'c2', explanation: '还没有提供这个亚组的具体研究结果。' }],
    nextStep: '请补充肾功能亚组分析表和说明书相关原文。', factIds: ['f-egfr-30-60', 'f-egfr-lt30'], ...over,
  }),
], { stopReason: 'toolUse' });

test('persuasion outcome distinguishes relevant evidence, vague uncertainty and uncorrected false claims', async () => {
  const cases = [
    { rep: supported.repQuote + 'eGFR 低于 30 的患者被排除，说明书不建议使用。', stance: 'willing_to_continue',
      strength: { quote: supported.repQuote, explanation: '给出与门诊肾功能人群相关的亚组结果，并承认研究边界。' },
      response: '这组证据与我门诊患者相关，研究边界也交代了，我愿意进一步核对资料。',
      rationale: '代表用亚组证据回应了临床关切，并说明研究未覆盖的人群。' },
    { rep: '我不知道，手上没有准确数据。', stance: 'needs_evidence', response: '我还需要亚组资料，才能判断适用范围。',
      rationale: '代表说明当前缺少准确资料，现有信息不足以判断。' },
    { rep: 'eGFR 30 到 60 的结果不好，没有准确测量。', stance: 'not_convinced',
      response: '这个结果判断与资料有冲突，我目前不能接受这段论证。',
      rationale: '关键亚组的结果被说成不好，且没有提供依据或更正。' },
  ];
  for (const item of cases) {
    const { faux, s2 } = setup();
    faux.setResponses([outcomeAnswer({ stance: item.stance, doctorResponse: item.response, rationale: item.rationale,
      strengths: item.strength ? [{ ...item.strength, factIds: ['f-egfr-30-60'], supportedFactQuote: '降压幅度与总体一致' }] : [],
      gaps: item.stance === 'not_convinced' ? [{ pointId: 'c2', quote: item.rep, explanation: '代表的断言与资料里的结果相冲突。' }] : [],
    })]);
    const outcome = await s2.prepareOutcome!({ sessionId: 'outcome', pack: ANSHU_PACK,
      history: [{ who: 'rep', text: item.rep }], resolvedPointIds: [], endReason: 'farewell', signal: new AbortController().signal });
    assert.equal(outcome.assessment, 'completed');
    assert.equal(outcome.stance, item.stance);
    assert.equal(outcome.rationale, item.rationale);
    assert.deepEqual(outcome.strengths, item.strength ? [item.strength] : []);
  }
});

test('bad optional outcome rows are discarded while missing core explanations yield unavailable', async () => {
  const { faux, s2 } = setup();
  const req = { sessionId: 'outcome', pack: ANSHU_PACK, history: [{ who: 'rep' as const, text: '我不知道。' }], resolvedPointIds: [], endReason: 'user_requested' as const, signal: new AbortController().signal };
  for (const over of [{ strengths: [{ quote: supported.repQuote, explanation: '有依据。', factIds: ['f-egfr-30-60'], supportedFactQuote: '降压幅度与总体一致' }] }, { gaps: [{ pointId: 'missing', explanation: '需核对。' }] }]) {
    faux.setResponses([outcomeAnswer(over)]);
    const outcome = await s2.prepareOutcome!(req);
    assert.equal(outcome.assessment, 'completed');
    assert.deepEqual(outcome.strengths, []);
    assert.ok(outcome.gaps.every((gap) => gap.pointId !== 'missing'));
  }
  faux.setResponses([outcomeAnswer({ rationale: '' })]);
  assert.equal((await s2.prepareOutcome!(req)).assessment, 'unavailable');
});

test('grounded paraphrases and spoken Chinese numbers preserve a reply; invalid marks are dropped', async () => {
  const { faux, s2 } = setup();
  for (const quote of ['这个亚组降压效果跟整体差不多。', '肾功能三十到六十的亚组四百一十二人，降压效果跟整体差不多。']) {
    faux.setResponses([answer('这组结果与总体接近，低于 30 的患者呢？', {
      resolvedAnswers: [{ ...supported, repQuote: quote }], spokenFactIds: ['f-egfr-30-60', 'f-egfr-lt30'],
    })]);
    const draft = await s2.prepareTurn!(request(quote));
    assert.deepEqual(draft.resolvedPointIds, ['c2']);
  }
  for (const over of [{ pointId: 'unknown' }, { factIds: ['unknown'] }, { repQuote: '从未听到的回答' }]) {
    faux.setResponses([answer('可以先看亚组表里的结果。', { resolvedAnswers: [{ ...supported, ...over }] })]);
    const draft = await s2.prepareTurn!(request(supported.repQuote));
    assert.deepEqual(draft.resolvedPointIds, []);
    assert.equal(draft.text, '可以先看亚组表里的结果。');
  }
});

test('a heard false statement cannot become an outcome strength and silence cannot persuade', async () => {
  const { faux, s2 } = setup();
  const falseQuote = 'eGFR 30 到 60 的结果不是特别好，没有准确测量。';
  faux.setResponses([outcomeAnswer({ stance: 'willing_to_continue', strengths: [{ quote: falseQuote,
    explanation: '提供了可靠的亚组结果。', factIds: ['f-egfr-30-60'], supportedFactQuote: '降压幅度与总体一致' }] })]);
  const falseOutcome = await s2.prepareOutcome!({ sessionId: 'false-strength', pack: ANSHU_PACK,
    history: [{ who: 'rep', text: falseQuote }], resolvedPointIds: [], endReason: 'farewell', signal: new AbortController().signal });
  assert.equal(falseOutcome.assessment, 'unavailable');
  assert.deepEqual(falseOutcome.strengths, []);
  faux.setResponses([outcomeAnswer({ stance: 'willing_to_continue' })]);
  assert.equal((await s2.prepareOutcome!({ sessionId: 'silent', pack: ANSHU_PACK, history: [],
    resolvedPointIds: ['c1', 'c2', 'c3', 'd1'], endReason: 'silence', signal: new AbortController().signal })).assessment, 'unavailable');
});

test('a rep question cannot end the visit just because the model picks end_visit', async () => {
  const { faux, s2 } = setup();
  faux.setResponses([answer('今天先到这里，资料留下。', { action: 'end_visit' })]);
  const draft = await s2.prepareTurn!(request('主任为什么关心这个亚组？'));
  assert.equal(draft.action, 'reply');
  assert.deepEqual(draft.resolvedPointIds, []);
});

test('unknown normal action defaults to reply without another model call', async () => {
  const { faux, s2 } = setup();
  faux.setResponses([answer('可以先看亚组表。', { action: 'continue' })]);
  assert.equal((await s2.prepareTurn!(request('不知道。'))).action, 'reply');
  assert.equal(faux.state.callCount, 1);
});

test('raw screenshot ASR false-result wording remains contradicted and receives clinical correction', async () => {
  const { faux, s2 } = setup();
  const rep = '三十二六十的患者的结果也不是特别的好';
  faux.setResponses([answer('你说的是肾功能 30 到 60 这组吗？资料中降压幅度与总体一致。', {
    contradictedAnswers: [{ pointId: 'c2', repQuote: rep, factIds: ['f-egfr-30-60'], populationQuote: '患者' }], spokenFactIds: ['f-egfr-30-60'],
  })]);
  const draft = await s2.prepareTurn!(request(rep, { history: [
    { who: 'doctor', text: '研究里 eGFR 30 到 60 的患者结果怎么样？' },
    { who: 'rep', text: '研究你的这个患者的结果其实没有准确的测量' },
    { who: 'rep', text: rep },
  ] }));
  assert.deepEqual(draft.contradictedPointIds, ['c2']);
  assert.deepEqual(draft.resolvedPointIds, []);
});

test('outcome keeps the model judgement in one call rather than a regex-driven repair', async () => {
  const { faux, s2 } = setup();
  faux.setResponses([outcomeAnswer({ stance: 'not_convinced', doctorResponse: '这次还没有足够依据让我接受。' })]);
  const outcome = await s2.prepareOutcome!({ sessionId: 'one-call', pack: ANSHU_PACK, history: [{ who: 'rep', text: '我记不清，回头核实。' }], resolvedPointIds: [], endReason: 'farewell', signal: new AbortController().signal });
  assert.equal(outcome.stance, 'not_convinced');
  assert.equal(faux.state.callCount, 1);
});

test('false-result suffix from exact ASR cannot receive resolved credit or become a strength', async () => {
  const { faux, s2 } = setup();
  const quote = '结果也不是特别的好';
  faux.setResponses([answer('资料里的结果与总体一致，请核对一下依据。', {
    resolvedAnswers: [{ ...supported, repQuote: quote }], spokenFactIds: ['f-egfr-30-60'],
  })]);
  const draft = await s2.prepareTurn!(request('三十二六十的患者的' + quote));
  assert.deepEqual(draft.resolvedPointIds, []);
  faux.setResponses([outcomeAnswer({ strengths: [{ quote, explanation: '提供了亚组结果。', factIds: ['f-egfr-30-60'], supportedFactQuote: '降压幅度与总体一致' }] })]);
  const outcome = await s2.prepareOutcome!({ sessionId: 'suffix', pack: ANSHU_PACK, history: [{ who: 'rep', text: quote }],
    resolvedPointIds: [], endReason: 'farewell', signal: new AbortController().signal });
  assert.deepEqual(outcome.strengths, []);
});

test('correct facts do not override the actual heard doctor request for further evidence', async () => {
  const { faux, s2 } = setup();
  faux.setResponses([outcomeAnswer({ stance: 'needs_evidence',
    doctorResponse: '亚组结果可以核对，但我还需要更多相关资料再判断。',
    rationale: '代表提供了正确亚组数据，但医生实际表示仍需其他资料，没有表达接受论证。',
    strengths: [{ quote: supported.repQuote, explanation: '亚组结果有资料支持。', factIds: ['f-egfr-30-60'], supportedFactQuote: '降压幅度与总体一致' }],
  })]);
  const outcome = await s2.prepareOutcome!({ sessionId: 'not-count', pack: ANSHU_PACK,
    history: [{ who: 'rep', text: supported.repQuote }, { who: 'doctor', text: '这些数字我知道，但我还需要更多相关资料，目前不足以改变我的判断。' }],
    resolvedPointIds: ['c1', 'c2', 'c3', 'd1'], endReason: 'user_requested', signal: new AbortController().signal });
  assert.equal(outcome.stance, 'needs_evidence');
  assert.match(outcome.rationale, /仍需其他资料/);
});

test('an unsolicited supported elderly answer earns c1 within the concern even after a renal question', async () => {
  const { faux, s2 } = setup();
  const quote = '75岁以上约占11%，这一组降压幅度和总体一致。';
  let assessmentRuleSeen = false;
  faux.setResponses([(context) => {
    assessmentRuleSeen = JSON.stringify(context).includes('判定范围是整个当前关切，不限于医生最后问的那个要点');
    return answer('高龄这组的数据有了，肾功能这组的结果呢？', {
      resolvedAnswers: [{ pointId: 'c1', repQuote: quote, factIds: ['f-elderly'] }],
    });
  }]);
  const draft = await s2.prepareTurn!(request(quote));
  assert.equal(assessmentRuleSeen, true);
  assert.deepEqual(draft.resolvedPointIds, ['c1']);
  assert.deepEqual(draft.contradictedPointIds, []);
  assert.equal(draft.action, 'reply');
  assert.equal(faux.state.callCount, 1);
});

test('correct elderly evidence cannot be recorded as a renal contradiction', async () => {
  const { faux, s2 } = setup();
  const quote = '75岁以上约占11%，这一组降压幅度和总体一致。';
  faux.setResponses([answer('高龄这组有依据，肾功能这组的结果呢？', {
    resolvedAnswers: [{ pointId: 'c1', repQuote: quote, factIds: ['f-elderly'] }],
    contradictedAnswers: [{ pointId: 'c2', repQuote: quote, factIds: ['f-egfr-30-60'],
      relation: 'contradicted', populationQuote: '75岁以上', factPopulationQuote: 'eGFR 30 到 60' }],
  })]);
  const draft = await s2.prepareTurn!(request(quote));
  assert.deepEqual(draft.resolvedPointIds, ['c1']);
  assert.deepEqual(draft.contradictedPointIds, []);
});

test('authorized natural farewells accept varied closing phrases but never a new question', async () => {
  const { faux, s2 } = setup();
  for (const text of ['好的，您忙。', '回头联系。', '好，那你先去核对吧，再见。', '好，那你先去核对吧。']) {
    faux.setResponses([answer(text, { action: 'end_visit' })]);
    const draft = await s2.prepareTurn!(request('今天先不打扰您了，资料核对好再来，再见。'));
    assert.equal(draft.action, 'end_visit');
    assert.deepEqual(draft.resolvedPointIds, []);
  }
  faux.setResponses([answer('那低于 30 的患者呢？', { action: 'end_visit' })]);
  assert.equal((await s2.prepareTurn!(request('我先走了，再见。'))).action, 'reply');
  faux.setResponses([answer('再见。', { action: 'end_visit' })]);
  assert.equal((await s2.prepareTurn!(request('现在就要结束了吗？'))).action, 'reply');
});

test('contextual population pronouns and full answers retain supported progress without confusing counts or dose', async () => {
  const { faux, s2 } = setup();
  const cases = [
    { quote: '这一组结果与总体一致。', pointId: 'c2', factIds: ['f-egfr-30-60'], populationQuote: '', factPopulationQuote: '' },
    { quote: '75岁以上约占11%，这一组降压幅度和总体一致。', pointId: 'c1', factIds: ['f-elderly'], populationQuote: '75岁以上', factPopulationQuote: '75 岁以上患者' },
    { quote: 'eGFR 30 到 60 的亚组有 412 人，降压幅度与总体一致。', pointId: 'c2', factIds: ['f-egfr-30-60'], populationQuote: 'eGFR 30 到 60', factPopulationQuote: 'eGFR 30 到 60' },
    { quote: '75 岁以上患者从每日 2.5 mg 起始，两周后按血压调整。', pointId: 'd1', factIds: ['f-dose-elderly'], populationQuote: '75 岁以上患者', factPopulationQuote: '75 岁以上患者' },
  ];
  for (const item of cases) {
    faux.setResponses([answer('这部分有资料支持。', { resolvedAnswers: [{ ...item, repQuote: item.quote }] })]);
    const draft = await s2.prepareTurn!(request(item.quote, { concernId: item.pointId === 'd1' ? 'concern-dose' : 'concern-scope' }));
    assert.deepEqual(draft.resolvedPointIds, [item.pointId]);
    assert.deepEqual(draft.contradictedPointIds, []);
  }
});

test('recorded partial and clipped uncertainty cannot create complete point credit', async () => {
  const cases = [
    { rep: '这组降压幅度与总体一致，人数我现在没记住。', quote: '这组降压幅度与总体一致', pointId: 'c2', factIds: ['f-egfr-30-60'], status: 'partial', missingAspects: [ANSHU_PACK.pointRequirements!.c2[0]], coveredAspects: [{ requirementIndex: 1, quote: '这组降压幅度与总体一致' }] },
    { rep: '研究里有75岁以上的患者。', quote: '研究里有75岁以上的患者。', pointId: 'c1', factIds: ['f-elderly'], status: 'partial', missingAspects: ANSHU_PACK.pointRequirements!.c1, coveredAspects: [] },
    { rep: '好像是eGFR30到60有412人，可能与总体一致，但我不确定。', quote: 'eGFR30到60有412人', pointId: 'c2', factIds: ['f-egfr-30-60'], status: 'complete', missingAspects: [], coveredAspects: [] },
  ];
  const { faux, s2 } = setup();
  for (const item of cases) {
    faux.setResponses([answer('这部分还需要核对具体资料。', { assessments: [{ ...item, repQuote: item.quote,
      claimContext: [item.rep], populationQuote: '', factPopulationQuote: '', withdrawalQuote: '',
    }] })]);
    const draft = await s2.prepareTurn!(request(item.rep));
    assert.deepEqual(draft.resolvedPointIds, []);
    assert.deepEqual(draft.contradictedPointIds, []);
  }
  // Recorded old badargs lack explicit required-aspect evidence: fail closed while keeping safe speech.
  faux.setResponses([answer('人数还需要核对。', { assessments: [{ pointId: 'c2', repQuote: '这组降压幅度与总体一致',
    claimContext: ['这组降压幅度与总体一致，人数我现在没记住。'], factIds: ['f-egfr-30-60'], status: 'complete', missingAspects: [],
    coveredAspects: [{ requirementIndex: 1, quote: '这组降压幅度与总体一致' }], populationQuote: '这组', factPopulationQuote: 'eGFR 30 到 60', withdrawalQuote: '',
  }] })]);
  assert.deepEqual((await s2.prepareTurn!(request(cases[0].rep))).resolvedPointIds, []);
});

test('optional nonliteral population spans preserve boundary correction and raw combined ASR contradiction', async () => {
  const { faux, s2 } = setup();
  for (const [rep, pointId, factId, populationQuote] of [
    ['eGFR低于30也有研究支持，可以正常用。', 'c3', 'f-egfr-lt30', 'eGFR低于30的患者'],
    ['研究你的这个患者的结果其实没有准确的测量三十二六十的患者的结果也不是特别的好', 'c2', 'f-egfr-30-60', '三十二六十的患者'],
  ]) {
    faux.setResponses([answer('这与资料里的研究边界和结果不符，请核对原文。', { contradictedAnswers: [{
      pointId, repQuote: rep, factIds: [factId], populationQuote, factPopulationQuote: pointId === 'c3' ? 'eGFR 低于 30 的患者' : 'eGFR 30 到 60 的亚组',
    }] })]);
    const draft = await s2.prepareTurn!(request(rep, { resolvedPointIds: pointId === 'c3' ? ['c1', 'c3'] : [] }));
    assert.deepEqual(draft.contradictedPointIds, [pointId]);
    assert.deepEqual(draft.resolvedPointIds, []);
  }
});

test('partial claims combine across heard turns and uncertainty remains scoped to its own point', async () => {
  const { faux, s2 } = setup();
  const count = 'eGFR 30 到 60 的亚组有 412 人。';
  const effect = '这一组降压幅度与总体一致。';
  faux.setResponses([answer('这组的人数和结果都说明了。低于 30 的患者呢？', { resolvedAnswers: [{
    ...supported, repQuote: effect, populationQuote: '', claimContext: [count, effect],
    coveredAspects: [{ requirementIndex: 0, quote: count }, { requirementIndex: 1, quote: effect }],
  }] })]);
  const combined = await s2.prepareTurn!(request(effect, { history: [{ who: 'rep', text: count }, { who: 'doctor', text: '这组结果呢？' }, { who: 'rep', text: effect }] }));
  assert.deepEqual(combined.resolvedPointIds, ['c2']);
  const elderly = '75岁以上约占11%，降压幅度与总体一致。';
  const uncertain = 'eGFR30到60有412人，好像结果一致，但我不确定。';
  faux.setResponses([answer('高龄这组有依据，肾功能亚组请再核对。', {
    resolvedAnswers: [{ pointId: 'c1', repQuote: elderly, factIds: ['f-elderly'] }],
    assessments: [{ ...assessment({ ...supported, repQuote: uncertain }, 'supported'), status: 'uncertain', claimContext: [uncertain] }],
  })]);
  const mixed = await s2.prepareTurn!(request(elderly + uncertain));
  assert.deepEqual(mixed.resolvedPointIds, ['c1']);
  assert.deepEqual(mixed.contradictedPointIds, []);
  assert.deepEqual(mixed.reopenedPointIds, []);
});

test('only explicit withdrawal reopens prior evidence; ordinary forgetting preserves it', async () => {
  const { faux, s2 } = setup();
  for (const [rep, withdrawalQuote, expected] of [
    ['具体人数我现在记不清了。', '', []],
    ['我撤回刚才412人的说法，那个数据不能确认。', '我撤回刚才412人的说法，那个数据不能确认。', ['c2']],
  ] as const) {
    faux.setResponses([answer('那我们先核对亚组表的原始数据。', { assessments: [{
      ...assessment({ ...supported, repQuote: rep }, 'supported'), status: 'uncertain', claimContext: [rep], withdrawalQuote,
    }] })]);
    const draft = await s2.prepareTurn!(request(rep, { resolvedPointIds: ['c1', 'c2'] }));
    assert.deepEqual(draft.reopenedPointIds, expected);
    assert.deepEqual(draft.contradictedPointIds, []);
  }
});

test('knowledgeable doctor directly explains missing evidence for unsupported populations and evidence questions', async () => {
  const cases = [
    ['孕妇也能用吗？', '资料没有孕妇人群的数据，需要先核对这类人群的研究和说明书。'],
    ['透析患者可以按常规量吗？', '这份资料没有透析患者的用药证据，不能按这里的常规剂量外推。'],
    ['这类病人还需要看什么证据？', '我需要亚组的人数和降压结果，还要核对说明书对肾功能差患者的使用边界。'],
  ];
  const { faux, s2 } = setup();
  for (const [rep, text] of cases) {
    faux.setResponses([answer(text)]);
    const draft = await s2.prepareTurn!(request(rep));
    assert.equal(draft.text, text);
    assert.deepEqual(draft.resolvedPointIds, []);
    assert.deepEqual(draft.contradictedPointIds, []);
  }
});

test('uncorrected false claims and explicit factual correction produce different outcome reasons', async () => {
  const { faux, s2 } = setup();
  const wrong = 'eGFR 30 到 60 的结果不好，没有准确测量。';
  for (const [latest, stance] of [['具体我不知道，我回去核对。', 'not_convinced'], [supported.repQuote, 'needs_evidence']]) {
    faux.setResponses([outcomeAnswer({ stance, doctorResponse: stance === 'not_convinced' ? '前面的结果判断与资料矛盾，还没有得到更正。' : '这组结果已更正，我还需要核对其他人群的边界。',
      rationale: stance === 'not_convinced' ? '明确错误尚未纠正，后来表示不知道仍未提供更正依据。' : '代表已给出正确亚组结果，其他适用边界仍待核对。' })]);
    const outcome = await s2.prepareOutcome!({ sessionId: 'correction', pack: ANSHU_PACK,
      history: [{ who: 'rep', text: wrong }, { who: 'rep', text: latest }], resolvedPointIds: [], endReason: 'farewell', signal: new AbortController().signal });
    assert.equal(outcome.stance, stance);
    assert.doesNotMatch(outcome.rationale, /needs_evidence|not_convinced|willing_to_continue/);
  }
});


test('recorded partial assessment schema mistakes do not discard safe doctor speech', async () => {
  const { faux, s2 } = setup();
  for (const status of ['partials', 'partial', 'complete']) {
    // These are recorded provider arguments: coveredAspects is absent, and first attempt misspelled status.
    faux.setResponses([fauxAssistantMessage([fauxToolCall('submit_turn', {
      action: 'reply', text: '看研究原表吧，亚组具体有多少人、降压结果怎么样？', basis: '代表询问资料来源，先说明需要核对原表。',
      spokenFactIds: ['f-egfr-30-60'], assessments: [{ status, pointId: 'c2', repQuote: '', factIds: [],
        claimContext: ['研究里 eGFR 30 到 60 的患者结果怎么样？'], populationQuote: '', factPopulationQuote: '',
        missingAspects: ANSHU_PACK.pointRequirements!.c2, withdrawalQuote: '',
      }],
    })], { stopReason: 'toolUse' })]);
    const draft = await s2.prepareTurn!(request('您希望我给您看研究原表，还是说明书？'));
    assert.equal(draft.text, '看研究原表吧，亚组具体有多少人、降压结果怎么样？');
    assert.deepEqual(draft.resolvedPointIds, []);
    assert.deepEqual(draft.contradictedPointIds, []);
  }
  faux.setResponses([fauxAssistantMessage([fauxToolCall('submit_turn', {
    action: 'reply', text: '先看亚组研究原表，核对人数和结果。', basis: '直接回答资料问题。', spokenFactIds: ['f-egfr-30-60'],
  })], { stopReason: 'toolUse' })]);
  const noAssessment = await s2.prepareTurn!(request('您想看哪份资料？'));
  assert.deepEqual(noAssessment.resolvedPointIds, []);
});


test('stable criterion indexes preserve correct paraphrased renal evidence and missing-status extras cannot block speech', async () => {
  const { faux, s2 } = setup();
  const quote = '肾功能三十到六十的亚组四百一十二人，降压效果跟整体差不多。';
  faux.setResponses([answer('这组人数和结果有了，低于 30 的证据边界还要核对。', {
    resolvedAnswers: [{ ...supported, repQuote: quote, populationQuote: '', factPopulationQuote: '',
      coveredAspects: [{ requirementIndex: 0, quote }, { requirementIndex: 1, quote }],
    }],
    assessments: [{ pointId: 'c3', missingAspects: ['还未讨论说明书'], repQuote: '' }],
  })]);
  const draft = await s2.prepareTurn!(request(quote));
  assert.deepEqual(draft.resolvedPointIds, ['c2']);
  assert.deepEqual(draft.contradictedPointIds, []);
  assert.match(draft.text, /人数和结果/);
});


test('a prompted full dose answer remains heard rep evidence while other grounds may still need evidence', async () => {
  const { faux, s2 } = setup();
  const dose = '七十五岁以上先从每天二点五毫克开始两周以后再根据血压调整';
  let ruleSeen = false;
  faux.setResponses([(context) => {
    ruleSeen = JSON.stringify(context).includes('代表随后实际说出的正确完整回答仍然是代表的已听发言');
    return outcomeAnswer({ stance: 'needs_evidence',
      doctorResponse: '起始剂量经提示后已经补充，其他资料我还需要核对。',
      rationale: '代表在提示后说出了起始剂量及调整时间；其他资料仍需核对，继续持保留判断。',
      strengths: [{ quote: dose, explanation: '提示后明确说出了高龄起始剂量和调整时间依据。', factIds: ['f-dose-elderly'], supportedFactQuote: '75 岁以上患者从每日 2.5 mg 起始，两周后按血压调整' }],
      gaps: [{ pointId: 'c3', explanation: '其他适用边界尚需原文核对。' }], factIds: ['f-dose-elderly', 'f-egfr-lt30'],
    });
  }]);
  const outcome = await s2.prepareOutcome!({ sessionId: 'prompted', pack: ANSHU_PACK,
    history: [{ who: 'doctor', text: '说明书里写着75岁以上患者从每日2.5mg起始，两周后按血压调整。' }, { who: 'rep', text: dose }],
    resolvedPointIds: ['d1'], endReason: 'completed', signal: new AbortController().signal });
  assert.equal(ruleSeen, true);
  assert.equal(outcome.stance, 'needs_evidence');
  assert.equal(outcome.strengths[0].quote, dose);
  assert.doesNotMatch(outcome.rationale, /从未|没有说|未能说/);
});


test('the native request pins the tool; a single typed speech payload can be read without executing its unknown function', async () => {
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  const model = faux.getModel() as Model<Api>;
  const runtime: S2Runtime = { models, model, providerId: model.provider, modelId: model.id, api: 'openai-completions',
    baseUrl: 'faux://local', backend: 'faux-forced', redact: (s) => s, listModelIds: () => [model.id] };
  const original = models.streamSimple.bind(models); const selections: unknown[] = [];
  models.streamSimple = (selected, context, options) => { selections.push(options?.samplingParams?.tool_choice); return original(selected, context, options); };
  const s2 = new PiSystemTwo({ runtime, doctors: createDoctorStore('/tmp/cuex-turn-no-doctors') });
  faux.setResponses([answer('先看研究原表里的亚组结果。')]);
  await s2.prepareTurn!(request('您想看哪份资料？'));
  assert.deepEqual(selections[0], { type: 'function', function: { name: 'submit_turn' } });
  faux.setResponses([outcomeAnswer()]);
  await s2.prepareOutcome!({ sessionId: 'force-outcome', pack: ANSHU_PACK, history: [], resolvedPointIds: [], endReason: 'user_requested', signal: new AbortController().signal });
  assert.deepEqual(selections[1], { type: 'function', function: { name: 'submit_outcome' } });
  const calls = faux.state.callCount;
  faux.setResponses([fauxAssistantMessage([fauxToolCall('submit_text_and_assessments', { text: '好。', action: 'reply', basis: '不能信任未知工具名。', spokenFactIds: [], assessments: [] })], { stopReason: 'toolUse' })]);
  const recovered = await s2.prepareTurn!(request('您好。'));
  assert.equal(recovered.text, '好。');
  assert.equal(recovered.action, 'reply');
  assert.deepEqual(recovered.resolvedPointIds, []);
  assert.equal(faux.state.callCount - calls, 1);
});


test('general medical knowledge and numeric examples can be spoken without pack citations', async () => {
  const { faux, s2 } = setup();
  let attributionRuleSeen = false;
  const explanation = '一般来说，eGFR 45 提示肾功能下降，用药时会关注清除和蓄积风险；这个药的具体数据还要单独看。';
  faux.setResponses([(context) => {
    attributionRuleSeen = JSON.stringify(context).includes('可以运用医学常识解释临床顾虑')
      && JSON.stringify(context).includes('不能把一般医学知识写成这款药或这项研究已经证明的事实');
    return answer(explanation, { spokenFactIds: [] });
  }]);
  const draft = await s2.prepareTurn!(request('您为什么关注肾功能？'));
  assert.equal(attributionRuleSeen, true);
  assert.equal(draft.text, explanation);
  assert.equal(draft.sourceEvidence, undefined);
  assert.deepEqual(draft.resolvedPointIds, []);
});

test('general knowledge does not grant fictional-trial point credit or fabricate heard outcome quotes', async () => {
  const { faux, s2 } = setup();
  const claim = 'ANSHU-3 的这个亚组有 999 人，降压效果很好。';
  faux.setResponses([answer('一般肾功能下降需要关注药物清除；这项研究的人数还要核对。', {
    resolvedAnswers: [{ ...supported, repQuote: claim, status: 'contradicted' }], spokenFactIds: [],
  })]);
  const turn = await s2.prepareTurn!(request(claim));
  assert.deepEqual(turn.resolvedPointIds, []);
  faux.setResponses([outcomeAnswer({ rationale: '一般 eGFR 45 的患者值得关注，但本次缺少药物的具体证据。' })]);
  const req = { sessionId: 'knowledge-outcome', pack: ANSHU_PACK, history: [{ who: 'rep' as const, text: '我需要回去核实。' }],
    resolvedPointIds: [], endReason: 'farewell' as const, signal: new AbortController().signal };
  const outcome = await s2.prepareOutcome!(req);
  assert.match(outcome.rationale, /eGFR 45/);
  faux.setResponses([outcomeAnswer({ strengths: [{ quote: supported.repQuote, explanation: '亚组数据有依据。', factIds: ['f-egfr-30-60'], supportedFactQuote: '降压幅度与总体一致' }] })]);
  assert.deepEqual((await s2.prepareOutcome!(req)).strengths, []);
});

test('ordered rep evidence across separate turns is accepted without doctor words or reordering', async () => {
  const { faux, s2 } = setup();
  const count = 'eGFR30到60有412人。'; const effect = '这组降压幅度与总体一致。';
  const history = [{ who: 'rep' as const, text: count }, { who: 'doctor' as const, text: '我补一句不在代表原话里的话。' }, { who: 'rep' as const, text: effect }];
  for (const [quote, expected] of [[count + effect, ['c2']], [effect + count, []], [count + '我补一句不在代表原话里的话。' + effect, []]] as const) {
    faux.setResponses([answer('人数和结果已经补充。', { resolvedAnswers: [{ ...supported, repQuote: quote, populationQuote: '',
      claimContext: [count, effect], coveredAspects: [{ requirementIndex: 0, quote: count }, { requirementIndex: 1, quote: effect }],
    }] })]);
    const draft = await s2.prepareTurn!(request(effect, { history }));
    assert.deepEqual(draft.resolvedPointIds, expected);
  }
});

test('a source-page citation in a valid heard elderly answer does not erase point credit', async () => {
  const { faux, s2 } = setup();
  const quote = '高岭亚组的数据在第十四页七十五岁以上大约占百分之十一降压幅度和总体一致';
  faux.setResponses([answer('高龄这组结果有了，接下来核对肾功能亚组。', { resolvedAnswers: [{ pointId: 'c1', repQuote: quote,
    factIds: ['f-elderly'], populationQuote: '', factPopulationQuote: '',
  }] })]);
  const draft = await s2.prepareTurn!(request(quote));
  assert.deepEqual(draft.resolvedPointIds, ['c1']);
});

test('wrong array-type assessment quote is dropped without discarding the clinical reply', async () => {
  const { faux, s2 } = setup();
  faux.setResponses([fauxAssistantMessage([fauxToolCall('submit_turn', {
    text: '资料里的结果与总体一致，请核对原表。', action: 'reply', basis: '纠正资料冲突。', spokenFactIds: ['f-egfr-30-60'],
    assessments: [{ status: 'complete', pointId: 'c2', repQuote: [supported.repQuote], factIds: ['f-egfr-30-60'],
      claimContext: [supported.repQuote], coveredAspects: [{ requirementIndex: 0, quote: supported.repQuote }, { requirementIndex: 1, quote: supported.repQuote }],
    }],
  })], { stopReason: 'toolUse' })]);
  const draft = await s2.prepareTurn!(request(supported.repQuote));
  assert.equal(draft.text, '资料里的结果与总体一致，请核对原表。');
  assert.deepEqual(draft.resolvedPointIds, []);
});

test('successful provider speech survives unknown tool names, optional bad citations, and premature end actions without progress', async () => {
  const { faux, s2 } = setup();
  faux.setResponses([fauxAssistantMessage([fauxToolCall('submit_trigger_eval', {
    text: '这组人数和结果有依据，接下来核对使用边界。', action: 'end_visit', basis: '提供自然回复。',
    spokenFactIds: ['unknown', 'f-egfr-30-60'], assessments: [{ ...assessment(supported, 'supported') }],
  })], { stopReason: 'toolUse' })]);
  const draft = await s2.prepareTurn!(request(supported.repQuote));
  assert.equal(draft.action, 'reply');
  assert.deepEqual(draft.resolvedPointIds, []);
  assert.deepEqual(draft.contradictedPointIds, []);
  assert.equal(draft.sourceEvidence, 'ANSHU-3 亚组分析表，第 14 页');
});

test('recovery rejects ambiguous speech and invalid top-level types; incomplete outcome cores remain unavailable', async () => {
  const { faux, s2 } = setup();
  const payload = { text: '请核对资料。', action: 'reply', basis: '核对资料。', spokenFactIds: [] };
  for (const calls of [[fauxToolCall('unknown_a', payload), fauxToolCall('unknown_b', payload)],
    [fauxToolCall('unknown', { ...payload, text: ['不接受数组'] })]]) {
    faux.setResponses([fauxAssistantMessage(calls, { stopReason: 'toolUse' })]);
    await assert.rejects(s2.prepareTurn!(request('不知道。')), /structured/);
  }
  faux.setResponses([fauxAssistantMessage([fauxToolCall('unknown_outcome', { ...payload, stance: 'willing_to_continue' })], { stopReason: 'toolUse' })]);
  assert.equal((await s2.prepareOutcome!({ sessionId: 'no-outcome-recovery', pack: ANSHU_PACK, history: [], resolvedPointIds: [], endReason: 'silence', signal: new AbortController().signal })).assessment, 'unavailable');
});

test('complete reply text is preserved up to the bounded limit, never cut mid-sentence', async () => {
  const { faux, s2 } = setup();
  const long = '我关心的是患者的具体情况，先核对研究证据和用药边界。'.repeat(5);
  assert.ok(long.length > 93 && long.length <= 240);
  faux.setResponses([answer(long)]);
  assert.equal((await s2.prepareTurn!(request('需要看哪些证据？'))).text, long);
  faux.setResponses([answer('需要核对资料。'.repeat(200))]);
  await assert.rejects(s2.prepareTurn!(request('继续。')), /too long/);
});

test('minimal text-only, fenced JSON and missing optional reply fields all remain usable', async () => {
  const { faux, s2 } = setup();
  const cases = [
    fauxAssistantMessage([fauxToolCall('submit_turn', { text: '先看一下亚组表。' })], { stopReason: 'toolUse' }),
    fauxAssistantMessage([fauxText('```json\n{"text":"先核对具体数据。"}\n```')]),
    fauxAssistantMessage([fauxText('我更关心这组患者的具体结果。')]),
    fauxAssistantMessage([fauxToolCall('unexpected', { text: '可以先讲这组的数据。' })], { stopReason: 'toolUse' }),
  ];
  for (const response of cases) {
    faux.setResponses([response]);
    const draft = await s2.prepareTurn!(request('您想听什么？'));
    assert.ok(draft.text.length > 0);
    assert.equal(draft.action, 'reply');
    assert.deepEqual(draft.resolvedPointIds, []);
  }
  for (const text of ['{"text":broken', '```json\n{"text":"不完整"}', '调用工具 submit_turn 失败，准备重试。']) {
    faux.setResponses([fauxAssistantMessage([fauxText(text)])]);
    await assert.rejects(s2.prepareTurn!(request('继续。')), /structured/);
  }
});

test('mixed bad outcome evidence preserves the valid core and valid rows without fake positive assessment', async () => {
  const { faux, s2 } = setup();
  faux.setResponses([outcomeAnswer({
    strengths: [{ quote: supported.repQuote, explanation: '这一组的数据有依据。', factIds: ['f-egfr-30-60'], supportedFactQuote: '降压幅度与总体一致' },
      { quote: '从未说过的原话', explanation: '不应保留。', factIds: ['missing'] }],
    gaps: [{ pointId: 'c3', explanation: '使用边界还需要核对。' }, { pointId: 'missing', explanation: '无效。' }],
  })]);
  const req = { sessionId: 'mixed', pack: ANSHU_PACK, history: [{ who: 'rep' as const, text: supported.repQuote }], resolvedPointIds: [], endReason: 'completed' as const, signal: new AbortController().signal };
  const outcome = await s2.prepareOutcome!(req);
  assert.equal(outcome.assessment, 'completed');
  assert.equal(outcome.strengths.length, 1);
  assert.equal(outcome.gaps.length, 1);
  faux.setResponses([outcomeAnswer({ stance: 'mystery' })]);
  assert.equal((await s2.prepareOutcome!(req)).assessment, 'unavailable');
});

test('cancelled or errored provider messages cannot be recovered as speech or outcomes', async () => {
  const { faux, s2 } = setup();
  faux.setResponses([fauxAssistantMessage([fauxText('这句话不能从错误响应中恢复。')], { stopReason: 'error' })]);
  await assert.rejects(s2.prepareTurn!(request('请继续。')), (error: Error & { code?: string }) => error.code === 'S2_PROVIDER_ERROR' && !error.message.includes('credentials'));
  const ctl = new AbortController(); ctl.abort();
  const calls = faux.state.callCount;
  await assert.rejects(s2.prepareOutcome!({ sessionId: 'cancel-outcome', pack: ANSHU_PACK, history: [], resolvedPointIds: [], endReason: 'silence', signal: ctl.signal }), { name: 'AbortError' });
  assert.equal(faux.state.callCount, calls);
});

test('silence keeps usable speech while discarding model point progress and normalizes a plain idle closing', async () => {
  const { faux, s2 } = setup();
  faux.setResponses([answer('可以先核对一下这组的数据。', { resolvedAnswers: [supported] })]);
  const silent = await s2.prepareTurn!(request('', { trigger: 'silence', silenceStage: 1,
    history: [{ who: 'rep', text: supported.repQuote }] }));
  assert.ok(silent.text);
  assert.deepEqual(silent.resolvedPointIds, []);
  assert.deepEqual(silent.contradictedPointIds, []);
  faux.setResponses([fauxAssistantMessage([fauxText('今天先到这里，资料核对后再联系。')])]);
  const close = await s2.prepareTurn!(request('', { trigger: 'silence', silenceStage: 3 }));
  assert.equal(close.action, 'end_visit');
  faux.setResponses([fauxAssistantMessage([fauxText('这组患者的结果怎么样？')])]);
  assert.equal((await s2.prepareTurn!(request('', { trigger: 'silence', silenceStage: 3 }))).action, 'reply');
});

test('one public PiSystemTwo accepts consecutive accumulated-history replies despite later metadata variation', async () => {
  const { faux, s2 } = setup();
  const history: DoctorTurnRequest['history'] = [{ who: 'doctor', text: '研究的人群和适用边界是什么？' }];
  const sequence = [
    ['您最关心哪部分？', fauxAssistantMessage([fauxToolCall('submit_turn', { text: '我关心高龄和肾功能不好的患者。' })], { stopReason: 'toolUse' })],
    ['您希望看原表还是说明书？', fauxAssistantMessage([fauxText('先看亚组表，再核对说明书边界。')])],
    ['我只记得这组有412人。', fauxAssistantMessage([fauxToolCall('unexpected', { text: '人数有了，降压结果还要核对。' })], { stopReason: 'toolUse' })],
    [supported.repQuote, answer('这组结果已经补充。', { assessments: [{ pointId: 'c2', repQuote: ['类型错误，不影响说话'] }] })],
    ['那我们核对下一项。', fauxAssistantMessage([fauxText('```json\n{"text":"接着看低于30的证据和使用建议。","action":"continue"}\n```')])],
    ['我回去核对资料。', answer('好，核对原文后再交流。', { action: 'continue' })],
  ] as const;
  for (const [rep, response] of sequence) {
    history.push({ who: 'rep', text: rep });
    faux.setResponses([response]);
    const draft = await s2.prepareTurn!(request(rep, { history: [...history] }));
    assert.ok(draft.text.length > 0);
    assert.equal(draft.action, 'reply');
    history.push({ who: 'doctor', text: draft.text });
  }
  assert.equal(faux.state.callCount, sequence.length);
  assert.equal(history.length, 13);
});

test('provider failure is propagated as a safe typed category rather than a payload format error', async () => {
  const { faux, s2 } = setup();
  faux.setResponses([fauxAssistantMessage([], { stopReason: 'error', errorMessage: 'private credentials and upstream body must not escape' })]);
  await assert.rejects(s2.prepareTurn!(request('请说一下。')), (error: Error & { code?: string }) => {
    assert.equal(error.code, 'S2_PROVIDER_ERROR');
    assert.equal(error.message, 'System 2 provider response failed');
    return true;
  });
});

const proxyEightTurnOutcomeFixture = {
  "history": [
    {
      "who": "doctor",
      "text": "我门诊里高龄和肾功能不好的患者不少。研究覆盖了哪些人？"
    },
    {
      "who": "rep",
      "text": "陈主任，您好。您为什么特别关心高龄和肾功能不好的患者？"
    },
    {
      "who": "doctor",
      "text": "高龄和肾功能不全的患者在门诊非常普遍，他们的药物代谢和耐受性跟普通成人不一样，用药风险高。研究里 75 岁以上的患者有多少？降压效果跟总体比怎么样？"
    },
    {
      "who": "rep",
      "text": "这个具体数字我记不清了。"
    },
    {
      "who": "doctor",
      "text": "查一下第 14 页的亚组分析表吧，研究里 75 岁以上的患者有多少？"
    },
    {
      "who": "rep",
      "text": "这个具体数字我记不清了。"
    },
    {
      "who": "doctor",
      "text": "第14页的亚组分析表上写得很清楚，你再翻翻看，75 岁以上患者在研究里有多少，降压幅度跟总体比怎么样？"
    },
    {
      "who": "rep",
      "text": "我核对清楚了，eGFR30到60亚组有412人，降压幅度与总体一致，不是效果不好。"
    },
    {
      "who": "doctor",
      "text": "eGFR 30 到 60 的数据清楚了。那 75 岁以上的患者在研究里有多少，结果怎么样？"
    },
    {
      "who": "rep",
      "text": "75岁以上约占11%，降压幅度也与总体一致。"
    },
    {
      "who": "doctor",
      "text": "75 岁以上的数据清楚了。那 eGFR 低于 30 的患者能不能用？"
    },
    {
      "who": "rep",
      "text": "eGFR低于30被排除，没有证据，说明书不建议使用。"
    },
    {
      "who": "doctor",
      "text": "那高龄患者的起始剂量要调整吗？"
    },
    {
      "who": "rep",
      "text": "高龄起始剂量要调整，75岁以上从每日2.5mg开始，两周后按血压调整。我把对应的说明书和亚组表留给您。"
    },
    {
      "who": "doctor",
      "text": "行，资料和说明书我收下了。辛苦你跑这一趟。"
    },
    {
      "who": "rep",
      "text": "好的，资料和页码我会发给您，今天先不打扰了，再见。"
    }
  ],
  "resolvedPointIds": [],
  "endReason": "farewell",
  "payload": {
    "nextStep": "核对说明书和亚组分析表中的具体数据。",
    "rationale": "代表在提示下完整回答了 75 岁以上患者比例及降压效果、eGFR 30-60 人数及效果、eGFR 低于 30 的说明书建议以及高龄起始剂量调整方案。证据完整，我愿意收下资料并进一步核对。",
    "strengths": [
      {
        "supportedFactQuote": "75 岁以上患者约占 11%，降压幅度与总体一致。",
        "quote": "75岁以上约占11%，降压幅度也与总体一致。",
        "factId": "f-elderly"
      },
      {
        "factId": "f-egfr-30-60",
        "supportedFactQuote": "eGFR 30 到 60 的亚组有 412 人，降压幅度与总体一致。",
        "quote": "eGFR30到60亚组有412人，降压幅度与总体一致，不是效果不好。"
      },
      {
        "supportedFactQuote": "eGFR 低于 30 的患者被排除在研究之外，没有证据，说明书不建议使用。",
        "factId": "f-egfr-lt30",
        "quote": "eGFR低于30被排除，没有证据，说明书不建议使用。"
      },
      {
        "supportedFactQuote": "常规起始剂量每日 5 mg；75 岁以上患者从每日 2.5 mg 起始，两周后按血压调整。",
        "factId": "f-dose-elderly",
        "quote": "高龄起始剂量要调整，75岁以上从每日2.5mg开始，两周后按血压调整。"
      }
    ],
    "doctorResponse": "资料和说明书我收下了。后续我先仔细核对一下这些数据，再看怎么结合门诊患者的情况来考虑。",
    "stance": "willing_to_continue",
    "gaps": [],
    "factIds": [
      "f-elderly",
      "f-egfr-30-60",
      "f-egfr-lt30",
      "f-dose-elderly"
    ]
  }
};

test('the actual eight-turn outcome keeps grounded singular factId evidence and its valid positive core', async () => {
  const { faux, s2 } = setup();
  const fixture = proxyEightTurnOutcomeFixture;
  faux.setResponses([fauxAssistantMessage([fauxToolCall('submit_outcome', fixture.payload)], { stopReason: 'toolUse' })]);
  const outcome = await s2.prepareOutcome!({ sessionId: 'actual-eight-turn-outcome', pack: ANSHU_PACK,
    history: fixture.history as DoctorTurnRequest['history'], resolvedPointIds: fixture.resolvedPointIds,
    endReason: 'farewell', signal: new AbortController().signal });
  assert.equal(outcome.assessment, 'completed');
  assert.equal(outcome.stance, 'willing_to_continue');
  assert.equal(outcome.doctorResponse, fixture.payload.doctorResponse);
  assert.equal(outcome.strengths.length, 4);
  assert.deepEqual(outcome.strengths.map((row) => row.explanation), fixture.payload.strengths.map((row) => row.supportedFactQuote));
});

test('singular factId normalization never admits an unknown fact or an unheard positive quote', async () => {
  const { faux, s2 } = setup();
  const fixture = proxyEightTurnOutcomeFixture;
  for (const change of [{ factId: 'unknown' }, { quote: '从未说过的正确结果。' }]) {
    faux.setResponses([fauxAssistantMessage([fauxToolCall('submit_outcome', { ...fixture.payload,
      strengths: [{ ...fixture.payload.strengths[0], ...change }],
    })], { stopReason: 'toolUse' })]);
    const outcome = await s2.prepareOutcome!({ sessionId: 'invalid-singular-evidence', pack: ANSHU_PACK,
      history: fixture.history as DoctorTurnRequest['history'], resolvedPointIds: [], endReason: 'farewell', signal: new AbortController().signal });
    assert.equal(outcome.assessment, 'unavailable');
    assert.deepEqual(outcome.strengths, []);
  }
});
