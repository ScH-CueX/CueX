import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ViewKey } from '@/components/layout/Navbar';
import { DoctorCanvas } from '@/components/r3f/DoctorCanvas';
import { ClinicalScaffoldingHUD, type ScaffoldingLevel } from '@/components/ClinicalScaffoldingHUD';
import { CueEdgeLight, type EdgeCuePhase } from '@/components/CueEdgeLight';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  META,
  MOMENTS,
  NODS,
  fmt,
  fmtD,
} from '@/lib/scenario';
import { Play, Pause, Eye, EyeOff, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLiveSession } from '@/core/session/useLiveSession';
import { replayFrame, liveFrame, phaseLabels, actionLabels } from '@/core/session/trainingFrame';
import { LiveInputControls } from '@/components/LiveInputControls';
import { LiveBriefing } from '@/components/LiveBriefing';
import { LiveOutcome } from '@/components/LiveOutcome';

const D = META.duration;
const JUMP: Record<string, number> = { listen: 9.0, ask: 26.2, withdraw: 51.4 };

interface LiveTrainingViewProps {
  initialTime?: number;
  initialJury?: boolean;
  onNavigate: (view: ViewKey) => void;
}

export const LiveTrainingView: React.FC<LiveTrainingViewProps> = ({
  initialTime = 0,
  initialJury = true,
  onNavigate,
}) => {
  const [t, setT] = useState<number>(initialTime);
  const [playing, setPlaying] = useState<boolean>(() => new URLSearchParams(window.location.search).get('paused') !== '1');
  const [scaffoldingLevel, setScaffoldingLevel] = useState<ScaffoldingLevel>(() => {
    const value=new URLSearchParams(window.location.search).get('assist');
    return value === 'minimal' || value === 'faded' ? value : 'full';
  });
  const [jury, setJury] = useState<boolean>(() => new URLSearchParams(window.location.search).get('mode') !== 'replay' || initialJury);
  const [nodTrigger, setNodTrigger] = useState<number>(0);
  const [driverType] = useState<'replay' | 'live'>(() => new URLSearchParams(window.location.search).get('mode') === 'replay' ? 'replay' : 'live');

  const live = useLiveSession(driverType === 'live');
  const [elapsed, setElapsed] = useState(0);
  const lastTimeRef = useRef<number>(Date.now());
  const nodCheckedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (driverType !== 'live' || !live.session.startedAt) return;
    if (live.session.visitEnded) { setElapsed(live.session.visitEnded.durationMs / 1000); return; }
    const tick = () => setElapsed((Date.now() - live.session.startedAt!) / 1000);
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [driverType, live.session.startedAt, live.session.visitEnded]);

  // 2. 点头检测
  useEffect(() => {
    if (driverType !== 'replay') return;
    for (const nodT of NODS) {
      if (Math.abs(t - nodT) < 0.25 && !nodCheckedRef.current.has(nodT)) {
        nodCheckedRef.current.add(nodT);
        setNodTrigger((v) => v + 1);
      } else if (Math.abs(t - nodT) > 1.0 && nodCheckedRef.current.has(nodT)) {
        nodCheckedRef.current.delete(nodT);
      }
    }
  }, [t, driverType]);

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

  const frame = driverType === 'live' ? liveFrame(live.session) : replayFrame(t);
  const currentStateName = frame.state;
  const readiness = frame.readiness;
  const activeUtterance = frame.utterances[frame.utterances.length - 1] ?? null;
  const pastUtterances = frame.utterances.slice(0, -1).slice(-3);
  const activeUtteranceProgress = frame.activeProgress;
  const latestJudgment = frame.judgment;
  const candidatesInView = driverType === 'live' ? frame.candidates : frame.candidates.slice(-1);
  const candidateInFocus = frame.candidates[frame.candidates.length - 1];
  const clock = driverType === 'live' ? elapsed : t;
  const connected = live.session.status === 'running' && !live.finishing && !live.session.visitEnded;
  const ended = live.session.visitEnded && !live.session.audioPlaying ? live.session.visitEnded : undefined;
  const waitingToStart = driverType === 'live' && !live.session.startedAt;
  const activities = live.session.activities;
  const activityKinds = { reply: '对话回应', silence_prompt: '停顿提示', assessment: '拜访评估' };
  const activityPhases = { preparing: '正在准备', ready: '已准备', speaking: '医生在说', completed: '已完成', cancelled: '已取消', error: '请重试' };

  const seek = useCallback((targetTime: number) => {
    setT(Math.min(D, Math.max(0, targetTime)));
  }, []);

  const edgePhase: EdgeCuePhase = scaffoldingLevel !== 'minimal' || (driverType === 'live' && !connected)
    ? 'quiet'
    : currentStateName === 'withdrawing' ? 'resolved'
    : currentStateName === 'asking' || currentStateName === 'holding' ? 'focus'
    : latestJudgment?.verdict === 'drift' && activeUtterance?.who === 'rep' ? 'drift'
    : 'quiet';

  return (
    <div data-ui="training" className="flex flex-col min-h-[calc(100vh-3.5rem)] bg-ground text-ink select-none">
      <CueEdgeLight phase={edgePhase} paused={driverType === 'replay' && !playing} />
      {/* 极简顶栏 */}
      <div className="w-full border-b border-line bg-surface/80 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-ink-2">
          <span className="font-semibold text-ink">{driverType === 'live' ? live.session.scenario?.sceneTitle ?? '实时训练' : '心内科门诊'}</span>
          <span className="text-line">/</span>
          <span>{frame.study}</span>
          {driverType === 'live' && (
            <Badge variant={connected ? 'resolved' : 'secondary'} className="gap-1" role="status" data-testid="connection-status">
              <Radio className="w-3 h-3" />
              <span>{ended ? '拜访结束' : live.finishing ? '正在收尾' : connected ? '已连接' : live.session.status === 'connecting' ? '正在连接' : live.session.status === 'error' ? '连接失败' : '待开始'}</span>
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 max-w-full">
          {driverType === 'replay' && <span className="text-ink-3">演示回放</span>}

          <Button
            variant="quiet"
            size="sm"
            onClick={() => setJury(!jury)}
            className="h-8 text-xs gap-1"
            aria-pressed={jury}
          >
            {jury ? <EyeOff className="w-3.5 h-3.5 text-held" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{jury ? '收起决策' : '查看决策'}</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => { if (driverType === 'live') live.finishVisit(); else onNavigate('review'); }}
            disabled={driverType === 'live' && (!connected || live.finishing)}
            className="h-8 text-xs"
          >
            {driverType === 'live' ? live.finishing ? '医生正在收尾' : '结束并复盘' : '查看示例复盘'}
          </Button>
        </div>
      </div>

      {waitingToStart && <><LiveBriefing onStart={live.connect} starting={live.session.status === 'connecting'} />{live.session.error && <p role="alert" className="max-w-[1440px] w-full mx-auto px-6 pt-3 text-sm text-held-ink">{live.session.error}</p>}</>}
      {live.finishing && <p role="status" data-testid="visit-closing" className="max-w-[1440px] w-full mx-auto px-6 pt-4 text-sm text-ink-2">医生正在收尾，随后查看本次反馈。</p>}
      {ended && <LiveOutcome ended={ended} onRetry={concernId => live.restartVisit({ concernId })} onNext={live.clear} />}

      {/* 主界面网格 */}
      <div data-testid="live-grid" className={cn("flex-1 max-w-[1440px] w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch", ended && "hidden")}>
        
        {/* 左列：极简张力刻度与关切状态 */}
        <div className="lg:col-span-3 flex flex-col justify-between space-y-6">
          <div className="border border-line bg-surface/50 p-5 rounded-[2px] space-y-5">
            <div>
              <span className="font-doctor text-2xl font-bold tracking-tight text-ink block">
                {frame.doctor.name}
              </span>
              <span className="text-xs text-ink-3 tracking-wide">{frame.doctor.role}</span>
            </div>

            {/* 关切张力刻度线 */}
            <div className="space-y-3 pt-3 border-t border-line/60">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span className="font-medium text-ink">关切要点</span>
                <span className="font-mono text-[11px]">
                  {frame.points.filter(point => point.done).length}/{frame.points.length}
                </span>
              </div>

              <p className="text-sm font-medium" data-testid="concern-title">{frame.concernTitle}</p>
              <div className="space-y-2">
                {frame.points.map((p) => {
                  const isDone = p.done;
                  return (
                    <div
                      key={p.id}
                      data-testid={`point-${p.id}`}
                      data-resolved={isDone}
                      className={cn(
                        'flex items-center justify-between p-2 rounded-[2px] transition-colors duration-300',
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
            liveContext={driverType === 'live' ? {
              concern: frame.concernTitle,
              points: frame.points.filter(point => !point.done).map(point => point.label),
              sourceEvidence: candidateInFocus?.sourceEvidence,
              tactic: latestJudgment?.verdict === 'drift' ? '先回应医生当前的问题，再补充其他研究结果。' : undefined,
            } : undefined}
          />
        </div>

        {/* 中列：3D 石膏舞台 (前倾/点头/朱砂 Fresnel 侧光) */}
        <div data-capture="doctor" className="lg:col-span-5 flex flex-col items-center justify-center min-h-[460px] bg-ground-2/20 border border-line rounded-[2px] relative overflow-hidden">
          <DoctorCanvas
            state={currentStateName}
            readiness={readiness}
            framing="stage"
            bust={false}
            nodTrigger={driverType === 'live' ? live.session.nod : nodTrigger}
            className="w-full h-full absolute inset-0"
          />

          <span className="absolute left-4 top-4 text-sm text-ink-2" role="status" data-testid="doctor-state">
            {{ listening: '在听', speaking: '在说', asking: '追问', holding: '想插话', withdrawing: '已放下' }[currentStateName]}
          </span>
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
          <div className="space-y-5" role="log" aria-label="对谈现场" aria-live="polite" aria-relevant="additions text" data-testid="transcript">
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

            {!activeUtterance && driverType === 'live' && <p className="text-sm text-ink-3">{connected ? '等待医生开场，你也可以直接回应。' : '连接后开始对谈。'}</p>}
            {/* 当前正在进行的语句 */}
            {activeUtterance && (
              <div data-capture="active-utterance" className="pt-3 border-t border-line space-y-1">
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
            <span>{frame.doctor.name} / 医药代表</span>
            <span className="font-mono">{fmtD(clock)}</span>
          </div>
        </div>
      </div>

      {/* 评审视界：脑电波脉冲与悬珠 */}
      {jury && !waitingToStart && (
        <div data-capture="decisions" className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 mb-4">
          <div className="border border-line bg-surface/90 rounded-[2px] p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between border-b border-line pb-1.5 text-xs">
              <span className="font-bold text-ink">对话决策</span>
              <span className="text-held-ink text-[11px]">朱砂色 = 处于悬置的追问</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* System 1: 脉冲判定 */}
              <div className="bg-ground-2/40 border border-line p-3 rounded-[2px] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">System 1 · 即时判断</span>
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
                {driverType === 'live' && latestJudgment && <p className="text-ink-3">{actionLabels[latestJudgment.action ?? 'listen'] ?? latestJudgment.action}</p>}
              </div>


              {/* System 2: 候选追问生命周期悬珠 */}
              <div className="bg-ground-2/40 border border-line p-3 rounded-[2px] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">System 2 · 回应与追问</span>
                </div>
                {driverType === 'live' && <div className="space-y-2" data-testid="system2-activities">{activities.length ? activities.slice(-4).map(activity => <div key={activity.taskId} data-testid="system2-activity" data-kind={activity.kind} data-phase={activity.phase} className="border-t border-line pt-2 space-y-1">
                  <p className="font-medium">{activityKinds[activity.kind]} · {activityPhases[activity.phase]}</p>
                  {activity.reason && <p className="text-ink-2">{activity.reason}</p>}
                  {activity.sourceEvidence && <p className="text-ink-3">{activity.sourceEvidence}</p>}
                </div>) : <p className="text-ink-3">等待对话</p>}</div>}
                {candidatesInView.length ? candidatesInView.map(candidate => (
                  <div key={candidate.id} className="space-y-2 border-t border-line pt-2" data-testid="candidate" data-phase={candidate.phase}>
                    <Badge variant={candidate.phase === 'withdrawn' ? 'resolved' : candidate.phase === 'ready' ? 'held' : 'secondary'}>
                      {phaseLabels[candidate.phase]}
                    </Badge>
                    {candidate.text && <p className="font-doctor text-sm text-ink-2 bg-surface p-2 rounded-[2px] border border-line">
                      <span data-capture="candidate-quote">{candidate.phase === 'withdrawn' ? <del className="text-ink-3">{candidate.text}</del> : candidate.text}</span>
                    </p>}
                    {driverType === 'live' && <><p className="text-ink-3 leading-relaxed">{candidate.basis}</p>{candidate.sourceEvidence && <p className="text-ink-3">{candidate.sourceEvidence}</p>}</>}
                  </div>
                )) : <span className="text-ink-3 text-xs">暂无追问候选</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {driverType === 'live' ? (!ended && !waitingToStart && <LiveInputControls
          connected={connected}
          connecting={live.session.status === 'connecting' || live.finishing}
          error={live.session.error}
          mic={live.mic}
          volume={live.volume}
          sending={live.sending}
          onReconnect={live.connect}
          onToggleMic={live.toggleMic}
          onSendText={live.sendText}
          onFinishText={live.finishText}
          onStop={live.finishVisit}
        />
      ) : <>
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
              role="slider"
              tabIndex={0}
              aria-label="回放进度"
              aria-valuemin={0}
              aria-valuemax={D}
              aria-valuenow={Math.round(t)}
              onKeyDown={event => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                  event.preventDefault();
                  seek(event.key === 'Home' ? 0 : event.key === 'End' ? D : t + (event.key === 'ArrowRight' ? 1 : -1));
                }
              }}
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
      </>}
    </div>
  );
};
