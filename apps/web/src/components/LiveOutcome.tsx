import type { VisitEndedPayload } from '@cuex/protocol';
import { Button } from './ui/button';

const stanceLabels = { willing_to_continue: '愿意继续了解', needs_evidence: '仍需补充证据', not_convinced: '暂未被说服' };
export function LiveOutcome({ ended, onRetry, onNext }: { ended: VisitEndedPayload; onRetry(concernId: string): void; onNext(): void }) {
  const outcome = ended.outcome;
  const available = outcome?.assessment === 'completed';
  const remaining = ended.concerns.find(concern => concern.points.some(point => !point.resolved));
  const retryId = ended.suggestedRetryConcernId ?? remaining?.concernId ?? (!available ? ended.concerns[0]?.concernId : undefined);
  return <section data-testid="live-outcome" className="max-w-[1440px] w-full mx-auto p-4 sm:p-6 space-y-5 select-text" aria-labelledby="outcome-title">
    <div className="border border-line rounded-[2px] bg-surface p-5 sm:p-7 space-y-4">
      <p className="text-xs text-ink-3">{ended.retry ? '再次拜访 · 本次复盘' : '本次拜访复盘'}</p>
      <h2 id="outcome-title" data-testid="outcome-stance" className="text-2xl font-semibold">{available ? stanceLabels[outcome.stance] : '复盘暂未生成'}</h2>
      {available ? <>
        <blockquote className="font-doctor text-xl leading-relaxed">{outcome.doctorResponse}</blockquote>
        <p data-testid="outcome-rationale" className="text-sm text-ink-2 leading-relaxed">{outcome.rationale}</p>
        <div className="grid md:grid-cols-2 gap-6 border-t border-line pt-4">
          <div className="space-y-3"><h3 className="text-sm font-semibold">有效的表达</h3>{outcome.strengths.length ? outcome.strengths.map((item, i) => <div key={i} className="space-y-1 text-sm"><blockquote className="border-l-2 border-resolved pl-3">“{item.quote}”</blockquote><p className="text-ink-2">{item.explanation}</p></div>) : <p className="text-sm text-ink-3">这次还没有形成明确的说服依据。</p>}</div>
          <div className="space-y-3"><h3 className="text-sm font-semibold">还需回应</h3>{outcome.gaps.length ? outcome.gaps.map((item, i) => <div key={i} className="space-y-1 text-sm">{item.quote && <blockquote className="border-l-2 border-held pl-3">“{item.quote}”</blockquote>}<p className="text-ink-2">{item.explanation}</p></div>) : <p className="text-sm text-ink-3">医生本次没有提出额外的证据缺口。</p>}</div>
        </div>
        <div className="border-t border-line pt-4"><h3 className="text-sm font-semibold mb-1">下一步</h3><p className="text-sm text-ink-2">{outcome.nextStep}</p></div>
      </> : <p className="text-sm text-ink-2">再练一次，听取医生的反馈。</p>}
      <div className="flex flex-wrap gap-3 pt-2">{retryId && <Button onClick={() => onRetry(retryId)}>{available ? '从这里再试一次' : '再练一次'}</Button>}<Button variant="quiet" onClick={onNext}>下一位</Button></div>
    </div>
    {ended.moments.length > 0 && <div className="space-y-3"><h3 className="text-sm font-semibold">关键时刻</h3><div className="grid md:grid-cols-2 gap-4">{ended.moments.map((moment, i) => <article key={i} data-testid="review-moment" className="border border-line bg-surface p-5 rounded-[2px] space-y-2 text-sm">
      <p className="text-xs text-ink-3">{Math.floor(moment.atMs / 60000)}:{String(Math.floor(moment.atMs / 1000) % 60).padStart(2, '0')} · {moment.kind === 'interrupted' ? '医生追问' : '撤销追问'}</p>
      <p className="text-ink-2">你说：“{moment.repSaid}”</p>
      {moment.doctorSaid && <p className="font-doctor font-semibold">{moment.doctorSaid}</p>}
      {moment.withdrawnText && <p className="font-doctor text-ink-3"><del>{moment.withdrawnText}</del></p>}
      <p className="text-ink-2">{moment.basis}</p>{moment.sourceEvidence && <p className="text-xs text-ink-3">{moment.sourceEvidence}</p>}
      <button className="underline underline-offset-4 text-xs" onClick={() => onRetry(moment.concernId)}>从这里再试一次</button>
    </article>)}</div></div>}
  </section>;
}
