/** Dev only: renders the two panels with mock data built from the anshu pack. Open /preview.html?screen=<name>. */
import { createRoot } from 'react-dom/client';
import type { BriefingResponse, VisitEndedPayload } from '@cuex/protocol';
import { BriefingPanel } from './BriefingPanel';
import { ReviewPanel } from './ReviewPanel';

const briefing: BriefingResponse = {
  productName: '安舒平',
  packTitle: '安舒平降压适应证资料包',
  studyName: 'ANSHU-3 研究（虚构）',
  doctor: { name: '陈主任', department: '心内科', title: '主任医师' },
  facts: [
    { id: 'f-population', text: 'ANSHU-3 入组 18 到 80 岁的原发性高血压患者。', source: 'ANSHU-3 方案摘要' },
    { id: 'f-endpoint', text: '主要终点是 12 周时的诊室收缩压，安舒平组比对照组多降 6.2 mmHg。', source: 'ANSHU-3 主要结果' },
    { id: 'f-safety', text: '不良反应发生率与安慰剂相当。', source: 'ANSHU-3 安全性分析' },
    { id: 'f-elderly', text: '75 岁以上患者约占 11%，降压幅度与总体一致。', source: 'ANSHU-3 亚组分析表，第 14 页' },
    { id: 'f-egfr-30-60', text: 'eGFR 30 到 60 的亚组有 412 人，降压幅度与总体一致。', source: 'ANSHU-3 亚组分析表，第 14 页' },
    { id: 'f-egfr-lt30', text: 'eGFR 低于 30 的患者被排除在研究之外，没有证据，说明书不建议使用。', source: '安舒平说明书，禁忌与慎用' },
    { id: 'f-dose-elderly', text: '常规起始剂量每日 5 mg；75 岁以上患者从每日 2.5 mg 起始，两周后按血压调整。', source: '安舒平说明书，用法用量' },
    { id: 'f-rwe', text: '另有一项覆盖两万多名患者的真实世界研究。', source: '安舒平上市后研究摘要' },
  ],
};

const scope = (c1: boolean, c2: boolean, c3: boolean) => ({
  concernId: 'concern-scope', title: '适用范围',
  points: [{ id: 'c1', label: '75 岁以上患者', resolved: c1 }, { id: 'c2', label: 'eGFR 30–60', resolved: c2 }, { id: 'c3', label: 'eGFR 低于 30', resolved: c3 }],
});
const dose = (d1: boolean) => ({ concernId: 'concern-dose', title: '高龄起始剂量', points: [{ id: 'd1', label: '高龄起始剂量', resolved: d1 }] });

const interrupted = {
  kind: 'interrupted' as const, concernId: 'concern-scope', atMs: 134_000,
  repSaid: '这项研究入组 18 到 80 岁的原发性高血压患者，12 周时安舒平组比对照组多降 6.2 mmHg，不良反应和安慰剂相当。',
  doctorSaid: '先停一下。75 岁以上的占多少？eGFR 低于 30 的能用吗？',
  basis: '你还没讲到高龄和肾功能不好的患者，这正是他门诊里最多的一类。',
  sourceEvidence: '安舒平说明书，禁忌与慎用',
  openPointIds: ['c1', 'c2', 'c3'],
};
const withdrawn = {
  kind: 'withdrawn' as const, withdrawalReason: 'target_answered' as const, concernId: 'concern-dose', atMs: 201_000,
  repSaid: '高龄患者从每日 2.5 mg 起始，两周后按血压调整。',
  withdrawnText: '75 岁以上的起始剂量要不要调整？',
  basis: '你还没讲高龄患者的起始剂量。', sourceEvidence: '安舒平说明书，用法用量', openPointIds: ['d1'],
};

const base = { sessionId: 'preview', durationMs: 232_000 };
const first: VisitEndedPayload = {
  ...base, retry: false, doctorOpening: '我门诊高龄、肾功能不好的患者多，这个研究把他们纳进去了吗？',
  concerns: [scope(true, true, true), dose(true)], moments: [interrupted, withdrawn], suggestedRetryConcernId: 'concern-scope',
};
const firstOnlyWithdrawn: VisitEndedPayload = { ...first, moments: [withdrawn], suggestedRetryConcernId: 'concern-dose', concerns: [scope(true, true, true), dose(true)] };
const firstClean: VisitEndedPayload = { ...first, moments: [], suggestedRetryConcernId: undefined, concerns: [scope(true, true, true), dose(true)] };
const retry: VisitEndedPayload = {
  ...base, retry: true, doctorOpening: '高龄的、肾功能差的病人，你们的数据里有没有他们？先说有多少人。',
  concerns: [scope(true, true, true), dose(true)], moments: [], suggestedRetryConcernId: 'concern-scope',
};
// The doctor interrupts again on the retry: the review must say so.
const retryAgain: VisitEndedPayload = {
  ...retry,
  moments: [{
    kind: 'interrupted', concernId: 'concern-scope', atMs: 96_000,
    repSaid: '这个药整体安全性很好，说明书里对肾功能有说明，很多医院都在用。',
    doctorSaid: '先停一下。eGFR 低于 30 的患者，说明书怎么写的？',
    basis: '你还没讲到肾功能最差的那一类患者。', sourceEvidence: '安舒平说明书，禁忌与慎用', openPointIds: ['c3'],
  }],
};
// The first visit had only a withdrawn moment, and the retry has no interruption.
const retryAfterWithdrawn: VisitEndedPayload = { ...retry, doctorOpening: '高龄患者的起始剂量，你们的说明书是怎么建议的？' };

// Handlers record their calls on window.__calls, so a browser run can check the buttons and the Enter key.
const calls: string[] = [];
(window as unknown as { __calls: string[] }).__calls = calls;
const rec = (name: string) => (...args: unknown[]) => { calls.push(args.length ? `${name}:${args.join(',')}` : name); };
const noop = rec('call');
const screens: Record<string, () => JSX.Element> = {
  briefing: () => <BriefingPanel briefing={briefing} loading={false} onReload={rec('reload')} onStart={rec('start')} />,
  'briefing-loading': () => <BriefingPanel loading onReload={rec('reload')} onStart={rec('start')} />,
  'briefing-error': () => <BriefingPanel loading={false} error="资料没有加载成功" onReload={rec('reload')} onStart={rec('start')} />,
  review: () => <ReviewPanel ended={first} onRetry={rec('retry')} onNext={rec('next')} />,
  'review-withdrawn-only': () => <ReviewPanel ended={firstOnlyWithdrawn} onRetry={rec('retry')} onNext={rec('next')} />,
  'review-clean': () => <ReviewPanel ended={firstClean} onRetry={rec('retry')} onNext={rec('next')} />,
  retry: () => <ReviewPanel ended={retry} previous={first} onRetry={rec('retry')} onNext={rec('next')} />,
  'retry-again': () => <ReviewPanel ended={retryAgain} previous={first} onRetry={rec('retry')} onNext={rec('next')} />,
  'retry-after-withdrawn': () => <ReviewPanel ended={retryAfterWithdrawn} previous={firstOnlyWithdrawn} onRetry={rec('retry')} onNext={rec('next')} />,
};

const name = new URLSearchParams(location.search).get('screen') ?? '';
const Screen = screens[name];
createRoot(document.getElementById('root')!).render(
  Screen ? (
    // The shell gives each panel a fixed 1920x1080 canvas with its own background; this stands in for it.
    <div id="canvas" style={{ position: 'relative', width: 1920, height: 1080, overflow: 'hidden', background: '#07080B' }}>
      <Screen />
    </div>
  ) : (
    <ul style={{ color: '#ECE8DF', font: '24px system-ui', padding: 48 }}>
      {Object.keys(screens).map((k) => <li key={k}><a style={{ color: '#7FE3C3' }} href={`?screen=${k}`}>{k}</a></li>)}
    </ul>
  ),
);
