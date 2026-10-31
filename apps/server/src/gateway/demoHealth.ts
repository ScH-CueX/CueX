import { createEngines, readConfig } from '../config';
import { ANSHU_PACK } from '../scenario/anshu';
import type { FollowupDraft } from '../contracts';
import { warmupVoice } from '../voice/index';

let failures = 0;
function report(engine: string, backend: string, ok: boolean, detail = ''): void {
  console.log(`[demo] ${engine}: ${backend} — ${ok ? 'healthy' : 'unavailable'}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
}
try {
  // This preflight runs before the server, in a separate process with a cold local ASR model.
  // Load it before starting HTTP deadlines; ASR.open() would otherwise block those probes.
  await warmupVoice();
  const engines = await createEngines(readConfig(), ANSHU_PACK);
  // Real cloud content and real audio are checked once before opening the demo.
  await Promise.all([
    (async () => {
      const health = await engines.system1.health();
      report('System 1', engines.system1.backend, health.ok && !health.detail?.includes('unavailable'), health.detail);
    })(),
    (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const draft: FollowupDraft = await engines.system2.prepareFollowup({
            sessionId: 'demo-health', pack: ANSHU_PACK, concernId: 'concern-scope', unresolvedPointIds: ['c1', 'c2', 'c3'],
            history: [{ who: 'doctor', text: ANSHU_PACK.lineExamples.opening[0] }, { who: 'rep', text: '主要终点是十二周收缩压，不良反应与安慰剂相当。' }],
            repSpeechSinceConcern: '主要终点是十二周收缩压，不良反应与安慰剂相当。', reason: '代表继续介绍总体结果，尚未回答人群问题', signal: controller.signal,
          });
          report('System 2', engines.system2.backend, !!draft.text.trim());
        } finally { clearTimeout(timeout); }
      } catch { report('System 2', engines.system2.backend, false); }
    })(),
    (async () => {
      const asr = engines.asr as typeof engines.asr & { probe?: () => Promise<void> };
      try {
        if (asr.backend === 'text-only') { report('ASR', asr.backend, false, 'configure a local model or CUEX_ASR_URL'); return; }
        if (asr.probe) await asr.probe();
        else { const stream = await asr.open({ sampleRate: 16000 }, { onPartial() {}, onFinal() {}, onError() {} }); stream.end(); }
        report('ASR', asr.backend, true);
      } catch { report('ASR', asr.backend, false); }
    })(),
    (async () => {
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 12000);
      try {
        let bytes = 0;
        for await (const chunk of engines.tts.synthesize('陈主任，您好。', abort.signal)) bytes += chunk.audio.length;
        report('TTS', engines.tts.backend, bytes > 0);
      } catch { report('TTS', engines.tts.backend, false); }
      finally { clearTimeout(timeout); (engines.tts as typeof engines.tts & { close?: () => void }).close?.(); }
    })(),
  ]);
} catch { console.error('[demo] Engine configuration failed. Check local provider settings and engine environment variables.'); failures++; }
process.exitCode = failures ? 1 : 0;
