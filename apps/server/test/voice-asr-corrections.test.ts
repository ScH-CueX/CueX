import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { WebSocket } from 'ws';
import type { ServerMessage } from '@cuex/protocol';
import type { AsrCallbacks, AsrEngine, AsrStream, JevQuestion, SystemOneResult, SystemOneState } from '../src/contracts';
import { FakeSystemOne, FakeSystemTwo, SilentTts } from '../src/fakes/engines';
import { WebSocketGateway } from '../src/gateway/WebSocketGateway';
import { ANSHU_PACK } from '../src/scenario/anshu';
import { correctAsrText } from '../src/voice/corrections';

/** Finals the live zh model returned for the demo lines (scripts/asr-bench.ts and the System 1 traces), with what the table must make of them. The 安淑平 line is from the brief, not from a run. */
const OBSERVED: Array<[string, string]> = [
  ['克瑞三十到六十的亚足有四百一十二人降压幅度和总体一致', 'eGFR 30到60的亚组有四百一十二人降压幅度和总体一致'],
  ['X分三十到六十的亚足有四百一十二人降压幅度和总体一致', 'eGFR 30到60的亚组有四百一十二人降压幅度和总体一致'],
  ['X 二三十到六十的亚足有四百一十二人降压幅度和总体一致', 'eGFR 30到60的亚组有四百一十二人降压幅度和总体一致'],
  ['反正低于三十的患者被排除在研究之外', 'eGFR低于30的患者被排除在研究之外'],
  ['可能低于三十的患者被排除在研究之外', 'eGFR低于30的患者被排除在研究之外'],
  ['盖着小于三十的患者目前没有证据', 'eGFR小于30的患者目前没有证据'],
  ['亚祖分析里降压幅度和总体是一致的', '亚组分析里降压幅度和总体是一致的'],
  ['主要终点是十二周时的诊室收缩呀', '主要终点是十二周时的诊室收缩压'],
  ['班舒平足比对照组多降了六点二毫米拱柱', '安舒平组比对照组多降了六点二毫米汞柱'],
  ['安淑平的不良反应发生率和安慰剂相当', '安舒平的不良反应发生率和安慰剂相当'],
];

/** Lines the model got right, and ordinary speech next to the garbles. None may change. */
const UNTOUCHED = [
  '陈主任我先回答您的人群问题',
  '七十五岁以上的患者约占百分之十一',
  '肾功能正常的患者降压幅度和总体一致',
  '他们反正低于三十的患者我也不推荐',
  '反正我们有数据',
  '这个结果可能低于三十度',
  '亚足联的比赛在晚上',
];

test('the ANSHU table fixes the garbles the live ASR produced and leaves normal speech alone', () => {
  const table = ANSHU_PACK.asrCorrections;
  assert(table?.length, 'ANSHU_PACK carries asrCorrections');
  for (const [heard, expected] of OBSERVED) {
    assert.equal(correctAsrText(heard, table), expected);
  }
  // Partials are corrected the same way, as soon as the anchor words have arrived.
  assert.equal(correctAsrText('克瑞三十到六十', table), 'eGFR 30到60');
  assert.equal(correctAsrText('反正低于三十的患者', table), 'eGFR低于30的患者');
  for (const line of UNTOUCHED) assert.equal(correctAsrText(line, table), line);
});

class ScriptedAsr implements AsrEngine {
  readonly backend = 'scripted';
  constructor(private readonly finals: string[]) {}
  async open(_opts: { sampleRate: number }, callbacks: AsrCallbacks): Promise<AsrStream> {
    let next = 0;
    return {
      // Each audio chunk makes the engine hear one more sentence: a partial, then the final.
      write: () => {
        const line = this.finals[next++];
        if (!line) return;
        callbacks.onPartial(line.slice(0, Math.ceil(line.length * 0.6)));
        callbacks.onPartial(line);
        callbacks.onFinal(line);
      },
      end() {},
    };
  }
}

class SpySystemOne extends FakeSystemOne {
  readonly states: SystemOneState[] = [];
  override async decide(encoded: string, questions: Record<string, JevQuestion>, signal?: AbortSignal): Promise<SystemOneResult> {
    this.states.push(JSON.parse(encoded) as SystemOneState);
    return super.decide(encoded, questions, signal);
  }
}

test('garbled eGFR speech reaches the projector and System 1 corrected, and the concern points resolve', async () => {
  const system1 = new SpySystemOne();
  const gateway = new WebSocketGateway({
    port: 0, host: '127.0.0.1', pack: ANSHU_PACK,
    createEngines: () => ({
      system1, system2: new FakeSystemTwo(35), tts: new SilentTts(),
      asr: new ScriptedAsr([OBSERVED[0][0], OBSERVED[3][0]]),
    }),
    controller: { debounceMs: 5, minDriftMs: 0, minDriftChars: 30, candidateHoldMs: 120, minInterruptGapMs: 0 },
  });
  await gateway.start();
  const ws = new WebSocket(`ws://127.0.0.1:${gateway.port}/ws/session`);
  const events: ServerMessage[] = [];
  ws.on('message', raw => events.push(JSON.parse(raw.toString()) as ServerMessage));
  const until = async (ok: () => boolean, label: string) => {
    for (let waited = 0; !ok(); waited += 20) {
      if (waited > 4000) throw new Error(`Timed out waiting for ${label}. Events: ${events.map(e => e.type).join(', ')}`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  const chunk = () => ws.send(JSON.stringify({ type: 'audio.chunk', payload: { format: 'pcm16', sampleRate: 16000, channels: 1, data: Buffer.alloc(3200).toString('base64'), timestamp: Date.now() } }));
  const verdicts = () => events.filter(e => e.type === 'system1.verdict').length;
  try {
    await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'session.start', payload: { scenarioId: ANSHU_PACK.scenario.id, mode: 'performance' } }));
    await until(() => events.some(e => e.type === 'session.ready'), 'session.ready');

    chunk();
    await until(() => verdicts() >= 1, 'a verdict for the eGFR 30 to 60 sentence');
    const afterFirst = verdicts();
    chunk();
    await until(() => verdicts() > afterFirst, 'a verdict for the eGFR below 30 sentence');

    const shown = events.flatMap(e => (e.type === 'asr.transcript' && e.payload.speaker === 'rep' ? [e.payload] : []));
    assert(shown.some(t => !t.isFinal && t.text.startsWith('eGFR 30到60')), 'a corrected partial reaches the client');
    assert(shown.some(t => t.isFinal && t.text === 'eGFR 30到60的亚组有四百一十二人降压幅度和总体一致'), 'the corrected final reaches the client');
    assert(shown.some(t => t.isFinal && t.text === 'eGFR低于30的患者被排除在研究之外'));
    assert(!shown.some(t => /克瑞|反正|亚足/.test(t.text)), 'no raw garble reaches the client');

    const seen = system1.states.map(s => s.repSpeechSinceConcern);
    assert(seen.some(text => text.includes('eGFR 30到60的亚组')), 'System 1 reads the corrected eGFR 30 to 60 line');
    assert(seen.some(text => text.includes('eGFR低于30的患者')), 'System 1 reads the corrected eGFR below 30 line');
    assert(!seen.some(text => /克瑞|反正|亚足/.test(text)), 'System 1 never sees the raw garble');

    const resolved = new Set(events.flatMap(e => (e.type === 'system1.verdict' ? e.payload.resolvedPointIds ?? [] : [])));
    assert(resolved.has('c2') && resolved.has('c3'), `c2 and c3 resolve on corrected text, got ${[...resolved].join(',') || 'nothing'}`);
  } finally {
    ws.terminate();
    await gateway.stop();
  }
});
