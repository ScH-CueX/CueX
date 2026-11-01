import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { ViewKey } from '@/components/layout/Navbar';
import { DoctorCanvas } from '@/components/r3f/DoctorCanvas';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  META,
  UTTERANCES,
  CONCERN,
  JUDGMENTS,
  CANDIDATES,
  MOMENTS,
  NODS,
  STATE_WORDS,
  stateAt,
  fmt,
  fmtD,
} from '@/lib/scenario';
import type { Moment, Utterance, Judgment, Candidate } from '@/lib/types';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

const DUR = META.duration;
const WHO = { doctor: META.doctor.name, rep: '你' };
const VERDICT = { on: '回应关切', drift: '偏离关切' };
const ACTION = { listen: '继续听', ask: '追问', withdraw: '撤销追问', 'move-on': '进入下一问' };

// Drift spans from scenario
const DRIFT: [number, number][] = [
  [16.0, 29.6],
  [46.8, 52.6],
];

interface ReviewViewProps {
  onNavigate: (view: ViewKey, params?: { t?: number }) => void;
}

export const ReviewView: React.FC<ReviewViewProps> = ({ onNavigate }) => {
  const [t, setT] = useState<number>(() => {
    const value = Number(new URLSearchParams(window.location.search).get('t') ?? 29.4);
    return Number.isFinite(value) ? Math.max(0, Math.min(DUR, value)) : 29.4;
  });
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedMomentId, setSelectedMomentId] = useState<string>(() => MOMENTS.find(moment => t >= moment.at && t < moment.to)?.id ?? 'm2');
  const [practiceMode, setPracticeMode] = useState<'learning' | 'performance'>('learning');

  const currentDoctorState = useMemo(() => stateAt(t), [t]);
  const currentCandidate = useMemo(
    () => (currentDoctorState.candidate ? CANDIDATES.find((c) => c.id === currentDoctorState.candidate) : null),
    [currentDoctorState]
  );

  let readiness = 0;
  if (currentDoctorState.state === 'holding' && currentCandidate) {
    readiness = Math.min(1, Math.max(0, (t - currentCandidate.readyAt) / (currentCandidate.decidedAt - currentCandidate.readyAt)));
  }

  // Playback loop for review tracking
  useEffect(() => {
    let timer: number;
    if (isPlaying) {
      timer = window.setInterval(() => {
        setT((prev) => {
          if (prev >= DUR) {
            setIsPlaying(false);
            return DUR;
          }
          return prev + 0.1;
        });
      }, 100);
    }
    return () => clearInterval(timer);
  }, [isPlaying]);

  const selectedMoment = useMemo(
    () => MOMENTS.find((m) => m.id === selectedMomentId) || MOMENTS[0],
    [selectedMomentId]
  );

  const seek = (targetTime: number, autoPlay: boolean = false) => {
    setT(Math.min(DUR, Math.max(0, targetTime)));
    if (autoPlay) setIsPlaying(true);
  };

  // Facts
  const facts = [
    ['医生', `${META.doctor.name} · ${META.doctor.role}`],
    ['资料', `${META.pack} · ${META.study}`],
    ['时长', `${fmt(META.duration)}（68 秒）`],
    ['关键时刻', '1 次追问，1 次主动补正撤销'],
  ];

  return (
    <div className="min-h-screen bg-ground text-ink pb-20">
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 space-y-10">
        {/* Masthead */}
        <header className="border-b border-line pb-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
            <span className="font-medium text-ink">演示案例 · 复盘与决策对谈稿</span>
            <Button
              variant="quiet"
              size="sm"
              onClick={() => onNavigate('live')}
              className="h-7 text-xs"
            >
              回到实时演练
            </Button>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-ink">
              门诊拜访 · 适用范围 · 复盘
            </h1>
            <p className="text-base text-ink-2 max-w-3xl leading-relaxed">
              一段 68 秒的门诊交流。医生在 <span className="font-mono text-ink font-bold">0:29</span> 追问过一次；第二次追问已经想好，你在 <span className="font-mono text-ink font-bold">0:54</span> 自己主动补上了答案，那句话就没有说出口。
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              {facts.map(([k, v]) => (
                <div key={k} className="border border-line bg-surface/60 p-2.5 rounded-[2px]">
                  <dt className="text-[11px] text-ink-3">{k}</dt>
                  <dd className="text-xs font-medium text-ink mt-0.5">{v}</dd>
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* Decision Track & Interactive Bust */}
        <section className="border border-line bg-surface rounded-[2px] p-5 space-y-4 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-4">
            <div className="flex items-center gap-4">
              {/* Mini 3D Doctor Preview */}
              <div className="w-16 h-16 bg-ground-2/50 rounded-[2px] border border-line overflow-hidden shrink-0">
                <DoctorCanvas
                  state={currentDoctorState.state}
                  readiness={readiness}
                  framing="thumb"
                  bust={false}
                  className="w-full h-full"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-ink">{STATE_WORDS[currentDoctorState.state].word}</span>
                  <span className="font-mono text-xs text-ink-3">{fmtD(t)} / 1:08</span>
                </div>
                <p className="text-xs text-ink-2 mt-0.5">{STATE_WORDS[currentDoctorState.state].plain}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="quiet"
                size="sm"
                onClick={() => setIsPlaying(!isPlaying)}
                className="h-8 text-xs gap-1.5"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? '暂停' : '回放这一刻'}</span>
              </Button>
            </div>
          </div>

          {/* Interactive SVG Decision Track */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-ink-3">
              <span>决策时序轨道（可拖动滑块查看任意时刻的判断）</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-held" /> 搁置追问
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-resolved" /> 已回应关切
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2 bg-ink" /> 正常发言
                </span>
              </div>
            </div>

            {/* Custom SVG Track Rendering */}
            <div
              className="relative w-full h-24 bg-ground-2/50 rounded-[2px] border border-line cursor-pointer overflow-hidden p-2"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                seek(pos * DUR);
              }}
            >
              <svg data-capture="timeline" className="w-full h-full" viewBox="0 0 800 80" preserveAspectRatio="none">
                {/* Moment highlight spans */}
                {MOMENTS.map((m) => {
                  const x1 = (m.at / DUR) * 800;
                  const x2 = (m.to / DUR) * 800;
                  return (
                    <rect
                      key={m.id}
                      x={x1}
                      y={0}
                      width={x2 - x1}
                      height={80}
                      fill={m.id === selectedMomentId ? 'rgba(210, 70, 30, 0.08)' : 'transparent'}
                    />
                  );
                })}

                {/* Candidate Track (Top) */}
                <text x="8" y="16" fill="#585e5b" fontSize="10">追问</text>
                {CANDIDATES.map((k) => {
                  const x1 = (k.preparedFrom / DUR) * 800;
                  const xReady = (k.readyAt / DUR) * 800;
                  const xDecided = (k.decidedAt / DUR) * 800;
                  return (
                    <g key={k.id}>
                      <line x1={x1} y1="13" x2={xReady} y2="13" stroke="#a9ada6" strokeDasharray="2,2" />
                      <rect x={xReady} y="10" width={xDecided - xReady} height="6" rx="1" fill="#d2461e" />
                      {k.fate === 'asked' ? (
                        <circle cx={xDecided} cy="13" r="3" fill="#a8340f" />
                      ) : (
                        <line x1={xDecided - 3} y1="10" x2={xDecided + 3} y2="16" stroke="#28604f" strokeWidth="2" />
                      )}
                    </g>
                  );
                })}

                {/* Doctor Utterances Track */}
                <text x="8" y="34" fill="#585e5b" fontSize="10">医生</text>
                {UTTERANCES.filter((u) => u.who === 'doctor').map((u) => (
                  <rect
                    key={u.id}
                    x={(u.start / DUR) * 800}
                    y="28"
                    width={((u.end - u.start) / DUR) * 800}
                    height="6"
                    rx="1"
                    fill="#141716"
                  />
                ))}

                {/* Rep Utterances Track */}
                <text x="8" y="52" fill="#585e5b" fontSize="10">你</text>
                {UTTERANCES.filter((u) => u.who === 'rep').map((u) => {
                  const isDrift = DRIFT.some(([s, e]) => u.start >= s - 0.1 && u.end <= e + 0.1);
                  return (
                    <rect
                      key={u.id}
                      x={(u.start / DUR) * 800}
                      y="46"
                      width={((u.end - u.start) / DUR) * 800}
                      height="6"
                      rx="1"
                      fill={isDrift ? '#d2461e' : '#4a504d'}
                    />
                  );
                })}

                {/* Concern Points (Bottom) */}
                <text x="8" y="70" fill="#585e5b" fontSize="10">关切</text>
                {CONCERN.points.map((p, idx) => (
                  <circle
                    key={p.id}
                    cx={(p.answeredAt / DUR) * 800}
                    cy={64 + idx * 4}
                    r="3.5"
                    fill="#28604f"
                  />
                ))}

                {/* Playhead Indicator */}
                <line
                  x1={(t / DUR) * 800}
                  y1={0}
                  x2={(t / DUR) * 800}
                  y2={80}
                  stroke="#d2461e"
                  strokeWidth="2"
                />
              </svg>
            </div>
          </div>
        </section>

        {/* Two-Column Grid: Score (Left) & Moments / Practice (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: The Score (对谈稿) */}
          <section className="lg:col-span-8 border border-line bg-surface rounded-[2px] p-6 space-y-6">
            <div className="border-b border-line pb-3">
              <h2 className="text-xl font-bold text-ink">对谈稿（Score）</h2>
              <p className="text-xs text-ink-2 mt-1">
                <span className="text-held-ink font-semibold">朱砂色</span>表示医生想好、尚未说出口的追问。页边为当时的判断。
              </p>
            </div>

            <ol className="divide-y divide-line/60 space-y-4">
              {UTTERANCES.map((u) => {
                const isDoctor = u.who === 'doctor';
                const relatedJudgments = JUDGMENTS.filter((j) => j.on === u.id);
                const isCandidateOriginated = !!u.fromCandidate;
                const candidate = isCandidateOriginated ? CANDIDATES.find((k) => k.id === u.fromCandidate) : null;

                return (
                  <li key={u.id} className="pt-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                    {/* Timestamp & Speaker Tag */}
                    <div className="md:col-span-3 flex md:flex-col items-baseline justify-between md:justify-start gap-1">
                      <button
                        type="button"
                        onClick={() => seek(u.start, true)}
                        className="text-xs font-mono font-medium text-ink hover:underline flex items-center gap-1"
                      >
                        <span>{fmtD(u.start)}</span>
                        <span className="text-ink-3">· {WHO[u.who]}</span>
                      </button>
                    </div>

                    {/* Speech Content */}
                    <div className="md:col-span-6 space-y-1">
                      {isCandidateOriginated && candidate && (
                        <p className="text-[11px] text-held-ink bg-held-tint/60 px-2 py-0.5 rounded-[2px] inline-block mb-1">
                          此句追问在 {fmtD(candidate.readyAt)} 已准备就绪，{fmtD(candidate.decidedAt)} 决定发起
                        </p>
                      )}

                      <p
                        className={cn(
                          'leading-relaxed',
                          isDoctor ? 'font-doctor text-base text-ink font-semibold' : 'font-ui text-sm text-ink-2'
                        )}
                      >
                        {u.text}
                        {u.cutAt && (
                          <span className="inline-block ml-1 text-xs text-held-ink font-sans font-bold">
                            （{fmtD(u.cutAt)} 被打断）
                          </span>
                        )}
                      </p>

                      {u.selfCorrection && (
                        <p className="text-[11px] text-resolved bg-resolved-tint/50 px-2 py-0.5 rounded-[2px] inline-block mt-1 font-medium">
                          54.9 秒 你主动补正了肾功能禁忌说明
                        </p>
                      )}
                    </div>

                    {/* Side Annotation (System One Judgment) */}
                    <div className="md:col-span-3 space-y-1 border-l md:border-l border-line pl-3 text-xs text-ink-2">
                      {relatedJudgments.map((j) => (
                        <div key={j.id} className="space-y-0.5">
                          <div className="flex items-center gap-1">
                            <span
                              className={cn(
                                'font-bold',
                                j.action === 'ask' ? 'text-held-ink' : j.action === 'withdraw' ? 'text-resolved' : 'text-ink'
                              )}
                            >
                              {ACTION[j.action]}
                            </span>
                            <span className="text-[11px] text-ink-3 font-mono">({fmt(j.t)})</span>
                          </div>
                          <p className="text-[11px] text-ink-3 leading-snug">{j.read}</p>
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Right Column: Intelligent Feedback, Moments & Practice */}
          <aside className="lg:col-span-4 space-y-6">
            
            {/* AI 智能反馈与销冠经验对照面板 */}
            <div className="border border-line bg-surface rounded-[2px] p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-held" />
                  <h2 className="text-sm font-bold text-ink">AI 智能教练复盘反馈</h2>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono">
                  实战能力诊断
                </Badge>
              </div>

              {/* 关键指标量化诊断 */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-ground-2/50 border border-line rounded-[2px] space-y-0.5">
                  <span className="text-[10px] text-ink-3 block">关切偏离时滞</span>
                  <span className="font-mono text-sm font-bold text-held-ink block">21.0 秒</span>
                  <span className="text-[10px] text-ink-3 block">第 29.8 秒遭遇打断</span>
                </div>
                <div className="p-2.5 bg-ground-2/50 border border-line rounded-[2px] space-y-0.5">
                  <span className="text-[10px] text-ink-3 block">自主补正成效</span>
                  <span className="font-mono text-sm font-bold text-resolved block">成功撤销</span>
                  <span className="text-[10px] text-ink-3 block">54.9 秒化解追问</span>
                </div>
              </div>

              {/* 销冠经验对照（个体经验沉淀为团队竞争力） */}
              <div className="p-3 bg-ground-2/40 border-l-2 border-held rounded-[2px] space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <strong className="text-ink text-[11px] font-semibold">资深销冠实战打法对照</strong>
                  <span className="text-[10px] text-ink-3 font-mono">李主管经验库</span>
                </div>
                <p className="text-ink-2 leading-relaxed text-[11px]">
                  “面对陈主任此类学者型医生，新人容易习惯性背诵主要终点。销冠打法：在开场 10 秒内直给亚组客观数字（11% 高龄、412例中度肾衰），耗时仅 12 秒，既不被动，又把沟通主控权拿回自己手里。”
                </p>
              </div>
            </div>

            {/* Three Moments Deep Dive */}
            <div className="border border-line bg-surface rounded-[2px] p-5 space-y-4 shadow-sm">
              <h2 className="text-base font-bold text-ink">三个关键时刻</h2>

              <div className="flex rounded-[2px] bg-ground-2 p-1 text-xs">
                {MOMENTS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedMomentId(m.id);
                      seek(m.at, true);
                    }}
                    className={cn(
                      'flex-1 py-1 text-center rounded-[2px] font-medium transition-colors',
                      selectedMomentId === m.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                    )}
                  >
                    {m.title}
                  </button>
                ))}
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-ink font-medium leading-relaxed">{selectedMoment.lead}</p>
                <div className="bg-ground-2/40 p-3 rounded-[2px] space-y-2 border border-line/60">
                  {selectedMoment.id === 'm1' && (
                    <p className="text-ink-2">
                      医生在 12.2s 和 16.1s 微微点头，System One 判定当前处于关切范围内，没有指示 System Two 准备追问。
                    </p>
                  )}
                  {selectedMoment.id === 'm2' && (
                    <p className="text-ink-2">
                      医生先前倾、抬眉，等了约 2.5 秒，然后在代表说到一半时插话打断，将沟通拉回到高龄与肾功能亚组。
                    </p>
                  )}
                  {selectedMoment.id === 'm3' && (
                    <p className="text-ink-2">
                      医生再次前倾想插话；但代表在 54.9s 主动补全了禁忌数据，医生呼气后靠、点头，将已准备的追问放回，进入下一问题。
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Practice Again (重练这一段) */}
            <div className="border border-line bg-surface rounded-[2px] p-5 space-y-4 shadow-sm">
              <div>
                <h2 className="text-base font-bold text-ink">重练这一段</h2>
                <p className="text-xs text-ink-2 mt-1 leading-relaxed">
                  在相同情境下把这次的调整再做一遍，或让医生调整提问方式，检验你的临场应对。
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="seg text-xs" role="group">
                  <button
                    type="button"
                    aria-pressed={practiceMode === 'learning'}
                    onClick={() => setPracticeMode('learning')}
                  >
                    学习模式
                  </button>
                  <button
                    type="button"
                    aria-pressed={practiceMode === 'performance'}
                    onClick={() => setPracticeMode('performance')}
                  >
                    表现模式
                  </button>
                </div>
              </div>

              <ul className="space-y-2.5 text-xs">
                <li
                  onClick={() => onNavigate('live')}
                  className="p-3 bg-ground-2/50 border border-line rounded-[2px] hover:bg-ground-2 cursor-pointer transition-colors space-y-1"
                >
                  <strong className="block text-ink font-medium">1. 原样重练（推荐）</strong>
                  <p className="text-ink-3">在同样的 68 秒情境中，尝试在第 18 秒就直接切入肾功能亚组，避免被打断。</p>
                </li>
                <li
                  onClick={() => onNavigate('live', { t: 16 })}
                  className="p-3 bg-ground-2/50 border border-line rounded-[2px] hover:bg-ground-2 cursor-pointer transition-colors space-y-1"
                >
                  <strong className="block text-ink font-medium">2. 提前追问应对</strong>
                  <p className="text-ink-3">若医生在第 20 秒提前提出澄清，检验你是否能立刻停止原计划并切换信息。</p>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};
