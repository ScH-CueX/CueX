import { useCallback, useEffect, useState } from 'react';
import type { BriefingResponse } from '@cuex/protocol';
import { Button } from './ui/button';

export function LiveBriefing({ onStart, starting }: { onStart(): void; starting: boolean }) {
  const [briefing, setBriefing] = useState<BriefingResponse>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    let active = true;
    setError(false);
    fetch('/briefing', { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('briefing');
      return response.json() as Promise<BriefingResponse>;
    }).then(data => { if (active) setBriefing(data); }).catch(() => { if (active) setError(true); })
      .finally(() => window.clearTimeout(timer));
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [attempt]);
  const reload = useCallback(() => setAttempt(value => value + 1), []);
  return <section data-testid="live-briefing" className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 pt-5">
    <div className="border border-line bg-surface rounded-[2px] p-5 space-y-3">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div><p className="text-xs text-ink-3 mb-1">拜访前准备</p>
          <h1 className="text-xl font-semibold">{briefing ? `${briefing.productName} · ${briefing.studyName}` : '准备开始拜访'}</h1>
          {briefing && <p className="text-sm text-ink-2 mt-1">{briefing.doctor.name} · {briefing.doctor.department} · {briefing.doctor.title}</p>}
        </div>
        <Button onClick={onStart} disabled={starting}>{starting ? '正在连接' : '开始拜访'}</Button>
      </div>
      <p className="text-sm text-ink-2">回应医生的关切，用研究证据说明你的建议。结束后，看看医生是否愿意继续了解，以及原因。</p>
      <details open className="border-t border-line pt-3"><summary className="cursor-pointer text-sm font-medium">查看拜访资料</summary>
        {briefing ? <ul className="grid md:grid-cols-2 gap-x-8 gap-y-3 mt-4 select-text">{briefing.facts.map(fact => <li key={fact.id} className="text-sm leading-relaxed"><p>{fact.text}</p><p className="text-xs text-ink-3 mt-1">{fact.source}</p></li>)}</ul>
          : error ? <div className="mt-3 text-sm" role="alert">资料加载失败。<button onClick={reload} className="underline ml-2">重新加载</button></div>
          : <p role="status" className="mt-3 text-sm text-ink-3">正在读取资料……</p>}
      </details>
    </div>
  </section>;
}
