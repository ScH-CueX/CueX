import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Sparkles, ArrowRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExperienceInput, ScenarioSummary, SynthesisInput, TeamExperience } from '@cuex/protocol';
import { listExperiences, saveExperience, synthesizeScenario } from '@/lib/library';

interface Props { isOpen: boolean; onClose: () => void; onSynthesizeAndStart: (scenario: ScenarioSummary) => void }
const emptyExperience: ExperienceInput = { sourceSeniorRep: '', scenarioContext: '', goldenTactic: '', antiPatternWarning: '' };
export function ScenarioSynthesizerModal({ isOpen, onClose, onSynthesizeAndStart }: Props) {
  const [style, setStyle] = useState<SynthesisInput['doctorStyle']>('rigorous');
  const [seconds, setSeconds] = useState(60);
  const [experiences, setExperiences] = useState<TeamExperience[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<ExperienceInput>(emptyExperience);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ScenarioSummary>();
  const abort = useRef<AbortController>();
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setResult(undefined); setError(''); setLoading(true); setSelected([]);
    listExperiences().then(rows => { if (active) setExperiences(rows); }).catch(() => { if (active) setError('经验库读取失败，请关闭后重试。'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; abort.current?.abort(); };
  }, [isOpen]);
  const add = async () => {
    setSaving(true); setError('');
    try { const entry = await saveExperience(draft); setExperiences(rows => [...rows, entry]); setSelected(ids => [...ids, entry.id].slice(-10)); setDraft(emptyExperience); setAdding(false); }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试。'); }
    finally { setSaving(false); }
  };
  const generate = async () => {
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError('');
    try { setResult(await synthesizeScenario({ doctorStyle: style, timeConstraintSec: seconds, experienceIds: selected }, controller.signal)); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '生成失败，请重试。'); }
    finally { setBusy(false); }
  };
  const inputClass = 'w-full bg-surface border border-line px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-held';
  return <Dialog.Root open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl max-h-[90dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto bg-ground border border-line p-6 sm:p-8 text-ink font-ui">
        <Dialog.Close aria-label="关闭" className="absolute right-4 top-4 p-2 hover:bg-ground-2"><X size={18} /></Dialog.Close>
        <Dialog.Title className="text-2xl pr-8">把经验变成下一场演练</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm text-ink-2 leading-relaxed">基于安舒平资料包，调整医生风格、关切顺序和提问方式。保存后可反复演练。</Dialog.Description>
        {error && <p role="alert" className="mt-4 text-sm text-held">{error}</p>}
        {result ? <div className="mt-8 space-y-5">
          <p className="text-sm text-resolved" role="status">场景已生成并保存</p>
          <h3 className="text-xl">{result.sceneTitle}</h3>
          <p className="text-sm text-ink-2">{result.doctor.name} · {result.doctor.timeConstraintSec} 秒 · 融合 {result.experienceCount} 条团队经验</p>
          <p className="text-sm text-ink-2">{result.doctor.note}</p>
          <Button onClick={() => onSynthesizeAndStart(result)} className="gap-2">进入这场演练 <ArrowRight size={16} /></Button>
        </div> : <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-2 text-sm"><span>医生风格</span><select aria-label="医生风格" value={style} disabled={busy} onChange={e => setStyle(e.target.value as SynthesisInput['doctorStyle'])} className={inputClass}><option value="rigorous">严谨学术型</option><option value="impatient">急躁紧迫型</option><option value="exploratory">探索质疑型</option></select></label>
            <label className="space-y-2 text-sm"><span>门诊时间</span><select aria-label="门诊时间" value={seconds} disabled={busy} onChange={e => setSeconds(Number(e.target.value))} className={inputClass}>{[45, 60, 90].map(n => <option key={n} value={n}>{n} 秒</option>)}</select></label>
          </div>
          <section className="border-t border-line pt-5">
            <div className="flex justify-between items-center gap-3"><h3 className="text-lg">团队经验</h3><Button variant="quiet" size="sm" disabled={busy || saving} onClick={() => setAdding(!adding)} className="gap-1"><Plus size={15} />录入经验</Button></div>
            <p className="text-sm text-ink-2 mt-2">选入这次练习，或直接根据资料生成。最多选择 10 条。</p>
            {loading ? <p className="text-sm mt-4" role="status">正在读取经验库…</p> : experiences.length === 0 ? <p className="text-sm mt-4 text-ink-2">还没有经验，录入第一条实际心得。</p> : <div className="max-h-48 overflow-y-auto mt-3 divide-y divide-line">{experiences.map(e => <label key={e.id} className="flex items-start gap-3 py-3 text-sm cursor-pointer"><input type="checkbox" className="mt-1 accent-ink" disabled={busy || (!selected.includes(e.id) && selected.length >= 10)} checked={selected.includes(e.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, e.id] : ids.filter(id => id !== e.id))} /><span><strong className="font-medium block">{e.scenarioContext}</strong><span className="block text-ink-2 mt-1">{e.goldenTactic}</span></span></label>)}</div>}
            {adding && <div className="mt-4 space-y-3">
              {([['scenarioContext', '适用情境', 500], ['goldenTactic', '应对经验', 1500], ['antiPatternWarning', '避免的做法（选填）', 500], ['sourceSeniorRep', '经验来源（选填）', 100]] as const).map(([key, label, max]) => <label key={key} className="block space-y-1 text-sm"><span>{label}</span><textarea className={inputClass} rows={key === 'goldenTactic' ? 3 : 1} maxLength={max} value={draft[key]} disabled={saving} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} /></label>)}
              <Button size="sm" disabled={saving || !draft.scenarioContext.trim() || !draft.goldenTactic.trim()} onClick={() => void add()}>{saving ? '正在保存…' : '保存到经验库'}</Button>
            </div>}
          </section>
          <Button className="w-full gap-2" disabled={busy || loading || saving} onClick={() => void generate()}><Sparkles size={16} />{busy ? 'AI 正在生成场景…' : '生成演练场景'}</Button>
          {busy && <p role="status" className="text-sm text-ink-2">正在结合资料与所选经验编排，请稍候。</p>}
        </div>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
