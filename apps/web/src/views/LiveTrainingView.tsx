import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { ViewKey } from '@/components/layout/Navbar';
import { DoctorCanvas } from '@/components/r3f/DoctorCanvas';
import { ClinicalScaffoldingHUD, type ScaffoldingLevel } from '@/components/ClinicalScaffoldingHUD';
import { CueEdgeLight, type EdgeCuePhase } from '@/components/CueEdgeLight';
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
  stateAt,
  fmt,
  fmtD,
} from '@/lib/scenario';
import type { DoctorStateName } from '@/lib/types';
import { Play, Pause, Eye, EyeOff, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReplayDriver } from '@/core/driver/ReplayDriver';
import { LiveWSDriver } from '@/core/driver/LiveWSDriver';
import type { IConversationDriver } from '@/core/driver/IConversationDriver';

const D = META.duration;
const JUMP: Record<string, number> = { listen: 9.0, ask: 26.2, withdraw: 51.4 };

interface LiveTrainingViewProps {
  initialTime?: number;
  initialJury?: boolean;
  onNavigate: (view: ViewKey) => void;
}

export const LiveTrainingView: React.FC<LiveTrainingViewProps> = ({
  initialTime = 0,
  initialJury = false,
  onNavigate,
}) => {
  const [t, setT] = useState<number>(initialTime);
  const [playing, setPlaying] = useState<boolean>(() => new URLSearchParams(window.location.search).get('paused') !== '1');
  const [scaffoldingLevel, setScaffoldingLevel] = useState<ScaffoldingLevel>(() => {
    const value=new URLSearchParams(window.location.search).get('assist');
    return value === 'minimal' || value === 'faded' ? value : 'full';
  });
  const [jury, setJury] = useState<boolean>(initialJury);
  const [nodTrigger, setNodTrigger] = useState<number>(0);
  const [driverType, setDriverType] = useState<'replay' | 'live'>('replay');

  const driverRef = useRef<IConversationDriver | null>(null);
  const lastTimeRef = useRef<number>(Date.now());
  const nodCheckedRef = useRef<Set<number>>(new Set());

  // 1. 初始化会话驱动器 (Driver Layer)
  useEffect(() => {
    if (driverType === 'replay') {
      const replay = new ReplayDriver();
      replay.init({
        onDoctorDispatch: () => {},
      });
      driverRef.current = replay;
    } else {
      const live = new LiveWSDriver();
      live.init({
        onDoctorDispatch: () => {},
      });
      live.start();
      driverRef.current = live;
    }

    return () => {
      driverRef.current?.destroy();
    };
  }, [driverType]);

  // 2. 点头检测
  useEffect(() => {
    for (const nodT of NODS) {
      if (Math.abs(t - nodT) < 0.25 && !nodCheckedRef.current.has(nodT)) {
        nodCheckedRef.current.add(nodT);
        setNodTrigger((v) => v + 1);
      } else if (Math.abs(t - nodT) > 1.0 && nodCheckedRef.current.has(nodT)) {
        nodCheckedRef.current.delete(nodT);
      }
    }
  }, [t]);

  // 3. 时间轴主循环
  useEffect(() => {
    let rafId: number;
    lastTimeRef.current = Date.now();

    const loop = () => {
      const now = Date.now();
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      if (playing && driverType === 'replay') {
        setT((prev) => {
          const next = prev + dt;
          if (next >= D) {
            setPlaying(false);
            return D;
          }
          return next;
        });
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [playing, driverType]);

  // 状态计算
  const currentStatePeriod = useMemo(() => stateAt(t), [t]);
  const currentStateName = currentStatePeriod.state;
  const currentCandidate = useMemo(
    () => (currentStatePeriod.candidate ? CANDIDATES.find((c) => c.id === currentStatePeriod.candidate) : null),
    [currentStatePeriod]
  );

  let readiness = 0;
  if (currentStateName === 'holding' && currentCandidate) {
    readiness = Math.min(
      1,
      Math.max(0, (t - currentCandidate.readyAt) / (currentCandidate.decidedAt - currentCandidate.readyAt))
    );
  }

  // 对话列表
  const startedUtterances = useMemo(() => UTTERANCES.filter((u) => u.start <= t), [t]);
  const activeUtterance = startedUtterances[startedUtterances.length - 1] || null;
  const pastUtterances = useMemo(() => startedUtterances.slice(0, -1).slice(-3), [startedUtterances]);

  // 发言流式进度
  const activeUtteranceProgress = useMemo(() => {
    if (!activeUtterance) return 0;
    const stop = activeUtterance.cutAt ?? activeUtterance.end;
    if (activeUtterance.cutAt && t >= activeUtterance.cutAt) return 1;
    return Math.min(1, Math.max(0, (t - activeUtterance.start) / (stop - activeUtterance.start - 0.2)));
  }, [activeUtterance, t]);

  // Jev 与 PiAgent 状态
  const latestJudgment = useMemo(() => {
    return [...JUDGMENTS].reverse().find((j) => j.t <= t) || null;
  }, [t]);

  const candidateInFocus = useMemo(() => {
    return [...CANDIDATES].reverse().find((c) => t >= c.preparedFrom) || null;
  }, [t]);

  const candidatePhase = useMemo(() => {
    if (!candidateInFocus) return 'none';
    if (t < candidateInFocus.readyAt) return 'prep';
    if (t < candidateInFocus.decidedAt) return 'ready';
    return candidateInFocus.fate;
  }, [candidateInFocus, t]);

  const seek = useCallback((targetTime: number) => {
    setT(Math.min(D, Math.max(0, targetTime)));
  }, []);

  const edgePhase: EdgeCuePhase = scaffoldingLevel !== 'minimal' || driverType !== 'replay'
    ? 'quiet'
    : currentStateName === 'withdrawing' ? 'resolved'
    : currentStateName === 'asking' || currentStateName === 'holding' ? 'focus'
    : latestJudgment?.verdict === 'drift' && activeUtterance?.who === 'rep' ? 'drift'
    : 'quiet';

  return (
    <div data-ui="training" className="flex flex-col min-h-[calc(100vh-3.5rem)] bg-ground text-ink select-none">
      <CueEdgeLight phase={edgePhase} paused={!playing} />
      {/* 极简顶栏 */}
      <div className="w-full border-b border-line bg-surface/80 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-ink-2">
          <span className="font-semibold text-ink">心内科门诊</span>
          <span className="text-line">/</span>
          <span>{META.study}</span>
          {driverType === 'live' && (
            <Badge variant="held" className="gap-1 animate-pulse">
              <Radio className="w-3 h-3" />
              <span>实时后端连接</span>
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 max-w-full">
          {/* Driver 模式快速切换 */}
          <div className="seg" role="group" aria-label="驱动模式">
            <button
              type="button"
              aria-pressed={driverType === 'replay'}
              onClick={() => setDriverType('replay')}
              title="68 秒高保真确定性预录演示"
            >
              演示回放
            </button>
            <button
              type="button"
              aria-pressed={driverType === 'live'}
              onClick={() => setDriverType('live')}
              title="连接真实 TypeScript WebSocket 后端"
            >
              实时连线
            </button>
          </div>

          <Button
            variant="quiet"
            size="sm"
            onClick={() => setJury(!jury)}
            className="h-8 text-xs gap-1"
            aria-pressed={jury}
          >
            {jury ? <EyeOff className="w-3.5 h-3.5 text-held" /> : <Eye className="w-3.5 h-3.5" />}
            <span>评审视界</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => onNavigate('review')}
            className="h-8 text-xs"
          >
            结束并复盘
          </Button>
        </div>
      </div>

      {/* 主界面网格 */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* 左列：极简张力刻度与关切状态 */}
        <div className="lg:col-span-3 flex flex-col justify-between space-y-6">
          <div className="border border-line bg-surface/50 p-5 rounded-[2px] space-y-5">
            <div>
              <span className="font-doctor text-2xl font-bold tracking-tight text-ink block">
                {META.doctor.name}
              </span>
              <span className="text-xs text-ink-3 tracking-wide">{META.doctor.role}</span>
            </div>

            {/* 关切张力刻度线 */}
            <div className="space-y-3 pt-3 border-t border-line/60">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span className="font-medium text-ink">关切要点</span>
                <span className="font-mono text-[11px]">
                  {CONCERN.points.filter((p) => t >= p.answeredAt).length}/{CONCERN.points.length}
                </span>
              </div>

              <div className="space-y-2">
                {CONCERN.points.map((p) => {
                  const isDone = t >= p.answeredAt;
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        'flex items-center justify-between p-2 rounded-[2px] transition-all duration-300',
                        isDone
                          ? 'bg-resolved-tint/60 text-resolved border-l-2 border-resolved font-medium'
                          : 'bg-ground-2/40 text-ink-3'
                      )}
                    >
                      <span className="text-xs">{p.label}</span>
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: isDone ? '#28604f' : '#a9ada6' }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 实时辅助功能 HUD (Clinical Scaffolding HUD) */}
          <ClinicalScaffoldingHUD
            currentSec={t}
            level={scaffoldingLevel}
            onLevelChange={setScaffoldingLevel}
          />
        </div>

        {/* 中列：3D 石膏舞台 (前倾/点头/朱砂 Fresnel 侧光) */}
        <div data-capture="doctor" className="lg:col-span-5 flex flex-col items-center justify-center min-h-[460px] bg-ground-2/20 border border-line rounded-[2px] relative overflow-hidden">
          <DoctorCanvas
            state={currentStateName}
            readiness={readiness}
            framing="stage"
            bust={false}
            nodTrigger={nodTrigger}
            className="w-full h-full absolute inset-0"
          />

          {/* 身体与光影指示条 */}
          {currentStateName === 'holding' && (
            <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-held-tint/80 border border-held/50 px-2.5 py-1 rounded-[2px] animate-pulse">
              <span className="w-2 h-2 rounded-full bg-held" />
              <span className="text-xs font-semibold text-held-ink tracking-wide">想插话</span>
            </div>
          )}

          {currentStateName === 'withdrawing' && (
            <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-resolved-tint/80 border border-resolved/50 px-2.5 py-1 rounded-[2px] transition-all">
              <span className="w-2 h-2 rounded-full bg-resolved" />
              <span className="text-xs font-semibold text-resolved tracking-wide">已放下</span>
            </div>
          )}
        </div>

        {/* 右列：双声部对谈现场，以字号和字重区别角色 */}
        <div data-capture="transcript" className="lg:col-span-4 flex flex-col justify-between border border-line bg-surface rounded-[2px] p-5 shadow-sm">
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="text-xs font-bold text-ink-3 uppercase tracking-widest">对谈现场</span>
              <span className="text-[11px] text-ink-3 font-mono">LIVE TRANSCRIPT</span>
            </div>

            {/* 历史记录：双声部纯粹排版 */}
            <div className="space-y-4 opacity-60">
              {pastUtterances.map((u) => {
                const isDoc = u.who === 'doctor';
                return (
                  <p
                    key={u.id}
                    className={cn(
                      'leading-relaxed text-xs',
                      isDoc ? 'font-doctor text-sm text-ink font-semibold' : 'font-ui text-ink-2'
                    )}
                  >
                    {u.text}
                  </p>
                );
              })}
            </div>

            {/* 当前正在进行的语句 */}
            {activeUtterance && (
              <div className="pt-3 border-t border-line space-y-1">
                {(() => {
                  const body = activeUtterance.text;
                  const len = Math.round(body.length * activeUtteranceProgress);
                  const spoken = body.slice(0, len);
                  const remaining = body.slice(len);
                  const isDoc = activeUtterance.who === 'doctor';

                  return (
                    <p
                      className={cn(
                        'leading-relaxed text-base',
                        isDoc ? 'font-doctor text-ink font-bold' : 'font-ui text-ink font-medium'
                      )}
                    >
                      <span>{spoken}</span>
                      <span className="opacity-20 text-ink-3 select-none">{remaining}</span>
                      {activeUtterance.cutAt && t >= activeUtterance.cutAt && (
                        <span className="inline-block ml-1 text-xs text-held-ink font-bold">
                          ——
                        </span>
                      )}
                    </p>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-3">
            <span>陈主任 / 医药代表</span>
            <span className="font-mono">{fmtD(t)}</span>
          </div>
        </div>
      </div>

      {/* 评审视界：脑电波脉冲与悬珠 */}
      {jury && (
        <div data-capture="decisions" className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 mb-4">
          <div className="border border-line bg-surface/90 rounded-[2px] p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between border-b border-line pb-1.5 text-xs">
              <span className="font-bold text-ink">系统双层决策时序</span>
              <span className="text-held-ink text-[11px]">朱砂色 = 处于悬置的追问</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* System 1: 脉冲判定 */}
              <div className="bg-ground-2/40 border border-line p-3 rounded-[2px] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">System 1 · 快速判定 (Jev)</span>
                  <span className="font-mono text-ink-3 text-[11px]">
                    {latestJudgment ? fmt(latestJudgment.t) : '0:00'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      latestJudgment?.verdict === 'on' ? 'bg-resolved' : 'bg-held animate-ping'
                    )}
                  />
                  <span className="text-ink font-medium">
                    {latestJudgment ? latestJudgment.read : '倾听中'}
                  </span>
                </div>
              </div>

              {/* System 2: 候选追问生命周期悬珠 */}
              <div className="bg-ground-2/40 border border-line p-3 rounded-[2px] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">System 2 · 候选追问 (PiAgent)</span>
                  {candidateInFocus && (
                    <Badge variant={candidatePhase === 'withdrawn' ? 'resolved' : candidatePhase === 'ready' ? 'held' : 'secondary'}>
                      {candidatePhase === 'ready' && '已就绪 · 未说出'}
                      {candidatePhase === 'withdrawn' && '已撤销 · 依据失效'}
                      {candidatePhase === 'asked' && '已问出'}
                      {candidatePhase === 'prep' && '检索中'}
                    </Badge>
                  )}
                </div>

                {candidateInFocus ? (
                  <p className="font-doctor text-xs text-ink-2 bg-surface p-2 rounded-[2px] border border-line">
                    {candidatePhase === 'withdrawn' ? (
                      <del className="text-ink-3">{candidateInFocus.text}</del>
                    ) : (
                      <span>{candidateInFocus.text}</span>
                    )}
                  </p>
                ) : (
                  <span className="text-ink-3 text-xs">暂无追问候选</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 底部控制台与时刻轴 */}
      <div className="sticky bottom-0 z-30 w-full border-t border-line bg-surface/95 backdrop-blur-md px-4 sm:px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <Button
              variant="quiet"
              size="sm"
              onClick={() => setPlaying(!playing)}
              className="h-8 px-2.5 gap-1 text-xs"
              aria-label={playing ? '暂停' : '播放'}
            >
              {playing ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{playing ? '暂停' : '播放'}</span>
            </Button>
            <span className="font-mono text-xs font-semibold text-ink">
              {fmt(t)} <span className="text-ink-3">/ {fmt(D)}</span>
            </span>
          </div>

          <div className="flex-1 w-full space-y-1.5">
            <div className="flex items-center justify-between gap-1 overflow-x-auto text-xs">
              {MOMENTS.map((m) => {
                const isSelected = t >= m.at && t < m.to;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      seek(JUMP[m.kind]);
                      setPlaying(true);
                    }}
                    className={cn(
                      'px-2 py-0.5 rounded-[2px] transition-colors whitespace-nowrap text-xs',
                      isSelected ? 'bg-ink text-ground font-medium' : 'text-ink-2 hover:bg-ground-2'
                    )}
                  >
                    <span>{m.title}</span>
                    <span className="ml-1 text-[10px] opacity-70 font-mono">{fmt(JUMP[m.kind])}</span>
                  </button>
                );
              })}
            </div>

            <div
              className="relative h-2 w-full bg-ground-3 rounded-[2px] cursor-pointer group flex items-center"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                seek(pos * D);
              }}
            >
              <div
                className="absolute top-0 left-0 h-full bg-ink rounded-[2px] pointer-events-none"
                style={{ width: `${(t / D) * 100}%` }}
              />
              <div
                className="absolute w-3 h-3 bg-surface border border-ink rounded-[2px] shadow-sm -ml-1 pointer-events-none group-hover:scale-125 transition-transform"
                style={{ left: `${(t / D) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
