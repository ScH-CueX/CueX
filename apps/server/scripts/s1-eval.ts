import { readFile, writeFile } from 'node:fs/promises';
import { HeuristicSystemOne, LlamaSystemOne } from '../src/system1/index';
import { ANSHU_PACK } from '../src/scenario/anshu';
import { encodeSystemOneState, S1_QUESTION_IDS, type JevQuestion, type SystemOneState } from '../src/contracts';

const args = process.argv.slice(2);
const arg = (name: string, fallback = '') => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const rounds = Math.max(1, Number(arg('--rounds', '1')));
const data = JSON.parse(await readFile(new URL('../test/system1-cases.json', import.meta.url), 'utf8')) as {cases: Array<{ id: string; state: SystemOneState; expected: Record<string, boolean> }>};
const client = args.includes('--heuristic') ? new HeuristicSystemOne(ANSHU_PACK) : new LlamaSystemOne({ baseUrl: arg('--url', process.env.CUEX_S1_URL), backend: arg('--backend', 'llama.cpp'), timeoutMs: Number(arg('--timeout', '30000')), promptFormat: arg('--format', 'jev-v1') as 'chat' | 'jev-v1' | 'jevstyle-v1', loraScale: Number(arg('--lora-scale', arg('--format', 'jev-v1') === 'jev-v1' ? '1' : '0')) });
const qs: Record<string, JevQuestion> = {
  [S1_QUESTION_IDS.responding]: { kind: 'noul', question: '代表最近这段话是否在回应医生的关切？' },
  [S1_QUESTION_IDS.drift]: { kind: 'noul', question: '代表最近这段话是否在持续展开与关切无关的内容？' },
  ...Object.fromEntries(ANSHU_PACK.scenario.concerns[0].points.map(point => [S1_QUESTION_IDS.resolved(point.id), { kind: 'noul', question: `关切点 ${point.id}（${point.label}，${point.anchorQuestion}）是否已被代表实质回答？承诺要回答、复述问题或仅提到人群都算未回答；有该人群具体数据或使用结论才算已回答。` }])),
  [S1_QUESTION_IDS.candidateValid]: { kind: 'noul', question: '准备中的追问前提是否仍成立？检查candidate.targetPointIds，目标要点只要还有一项未被实质回答，前提就仍成立；全部回答则不成立。' },
};
if (args.includes('--english')) {
  qs.responding.question = 'Is the latest rep speech responding to the doctor concern, including explicitly starting to answer? An intention to answer is responding but does not resolve a point. Judge recentSpeech only.';
  qs.drift.question = 'Is the latest rep speech continuing unrelated benefits, endpoints, safety or marketing instead of the unresolved doctor concern? Judge recentSpeech only.';
  qs.resolved_c1.question = 'Has the rep substantively answered the concern about patients over 75? A concrete subgroup proportion (11%) or result consistent with the overall population counts. Merely mentioning age, asking a question, promising later data, or claiming all elderly can use it does not count. Judge all repSpeechSinceConcern.';
  qs.resolved_c2.question = 'Has the rep substantively answered the eGFR 30-60 subgroup concern? A concrete subgroup count (412) or result consistent with overall population counts. Merely mentioning the group or promising an answer does not count. Judge all repSpeechSinceConcern.';
  qs.resolved_c3.question = 'Has the rep substantively answered the eGFR below 30 concern by stating study exclusion, no evidence, or use not recommended? Merely mentioning the group or falsely claiming safe use does not count. Judge all repSpeechSinceConcern.';
  qs.candidateValid.question = 'Does the prepared follow-up premise still hold? Check candidate.targetPointIds. It remains valid if any target point has not been substantively answered; it is false once all target points have been answered. Use all repSpeechSinceConcern.';
}
const rtt: number[] = [];
if (!args.includes('--heuristic')) {
  const base = arg('--url', process.env.CUEX_S1_URL ?? 'http://127.0.0.1:18080').replace(/\/(?:v1\/?)?$/, '');
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(10000) });
    await response.arrayBuffer();
    if (!response.ok) throw new Error(`health HTTP ${response.status}`);
    if (i > 0) rtt.push(performance.now() - start);
  }
}
if (!(await client.health()).ok) throw new Error('System 1 is not healthy');
const limit = Number(arg('--limit', String(data.cases.length)));
// One complete warm-up decide is excluded. Each measured decide runs all six questions in parallel.
await client.decide(encodeSystemOneState(data.cases[0].state), qs);
const results: any[] = [];
for (let round = 0; round < rounds; round++) for (const c of data.cases.slice(0, limit)) {
  const start = performance.now();
  try {
    const result = await client.decide(encodeSystemOneState(c.state), qs);
    const predicted = Object.fromEntries(Object.entries(result.answers).map(([id, answer]) => [id, answer.value >= .5]));
    const correct = Object.entries(c.expected).filter(([id, answer]) => predicted[id] === answer).length;
    results.push({ id: c.id, round, latencyMs: result.latencyMs, correct, total: Object.keys(c.expected).length, expected: c.expected, predicted, answers: result.answers });
    console.log(`${c.id}: ${correct}/${Object.keys(c.expected).length}, ${result.latencyMs.toFixed(1)} ms`);
  } catch (error) {
    results.push({ id: c.id, round, latencyMs: performance.now() - start, correct: 0, total: Object.keys(c.expected).length, error: error instanceof Error ? error.message : String(error) });
    console.log(`${c.id}: ERROR ${results.at(-1).error}`);
  }
}
const times = results.map(r => r.latencyMs).sort((a, b) => a - b);
const percentile = (p: number) => times[Math.max(0, Math.ceil(times.length * p) - 1)];
rtt.sort((a,b)=>a-b);
const summary = { backend: client.backend, rounds, format: arg('--format', 'jev-v1'), questionLanguage: args.includes('--english') ? 'en' : 'zh', networkHttpRttP50Ms: rtt.length ? rtt[Math.ceil(rtt.length*.5)-1] : null, networkHttpRttP95Ms: rtt.length ? rtt[Math.ceil(rtt.length*.95)-1] : null, cases: results.length, questions: results.reduce((s, r) => s + r.total, 0), accuracy: results.reduce((s, r) => s + r.correct, 0) / results.reduce((s, r) => s + r.total, 0), exactStateAccuracy: results.filter(r => r.correct === r.total).length / results.length, errors: results.filter(r => r.error).length, latencyP50Ms: percentile(.5), latencyP95Ms: percentile(.95), perQuestion: Object.fromEntries(Object.keys(qs).map(id => {
  const valid=results.filter(r=>r.predicted);
  const tp=valid.filter(r=>r.predicted[id]&&r.expected[id]).length;
  const fp=valid.filter(r=>r.predicted[id]&&!r.expected[id]).length;
  const fn=valid.filter(r=>!r.predicted[id]&&r.expected[id]).length;
  return [id,{accuracy:valid.filter(r=>r.predicted[id]===r.expected[id]).length/results.length,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,falsePositive:fp,falseNegative:fn}];
})) };
console.log(JSON.stringify(summary, null, 2));
if (arg('--out')) await writeFile(arg('--out'), JSON.stringify({ measuredAt: new Date().toISOString(), command: process.argv.slice(2), runtime: process.version, summary, results }, null, 2) + '\n');
