import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { BriefingResponse, VisitEndedPayload } from '@cuex/protocol';
import { useLiveSession } from '@/core/session/useLiveSession';
import { Wordmark } from '@/components/stage/Wordmark';
import { StageControls } from '@/components/stage/StageControls';
import { BriefingPanel } from '@/stage/BriefingPanel';
import { VisitPanel } from '@/stage/VisitPanel';
import { ReviewPanel } from '@/stage/ReviewPanel';
import '@/components/stage/stage.css';

type Phase = 'start' | 'briefing' | 'visit' | 'review';
type MicPref = 'unknown' | 'granted' | 'denied' | 'off';

const W = 1920;
const H = 1080;
const REVIEW_DELAY_MS = 1600;
const MIC_FALLBACK_MS = 9000;

export function StageView() {
  const scenarioId = new URLSearchParams(window.location.search).get('scenarioId') ?? undefined;
  const live = useLiveSession(false, scenarioId);
  const { session } = live;
  const [phase, setPhase] = useState<Phase>('start');
  const [scale, setScale] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [underlying, setUnderlying] = useState(false);
  const [micPref, setMicPref] = useState<MicPref>('unknown');
  const [micAsking, setMicAsking] = useState(false);
  const [micFailed, setMicFailed] = useState(false);
  const [briefing, setBriefing] = useState<BriefingResponse>();
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [briefingError, setBriefingError] = useState<string>();
  const [firstEnded, setFirstEnded] = useState<VisitEndedPayload>();
  const [retryConcern, setRetryConcern] = useState<string>();
  const micStarted = useRef(false);

  useEffect(() => { document.title = 'CueX｜医药代表临场应对训练'; }, []);

  // The socket opens when the page loads, so the server can write the doctor's opening while the audience reads the start screen.
  useEffect(() => { live.open(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit the 1920x1080 canvas to any window.
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, []);
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'f' || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return;
      event.preventDefault();
      toggleFullscreen();
    };
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('fullscreenchange', onChange); window.removeEventListener('keydown', onKey); };
  }, [toggleFullscreen]);

  const briefingRequest = useRef(0);
  const loadBriefing = useCallback(() => {
    const id = ++briefingRequest.current;
    const stale = () => id !== briefingRequest.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    setBriefingLoading(true);
    setBriefingError(undefined);
    fetch(scenarioId ? `/briefing?scenarioId=${encodeURIComponent(scenarioId)}` : '/briefing', { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(String(response.status)); return response.json() as Promise<BriefingResponse>; })
      .then(data => { if (!stale()) setBriefing(data); })
      .catch(() => { if (!stale()) setBriefingError('读不到资料，请确认服务已启动。'); })
      .finally(() => { window.clearTimeout(timer); if (!stale()) setBriefingLoading(false); });
    // A newer request, or leaving the page, makes this one stale. Its result is dropped.
    return () => { briefingRequest.current++; window.clearTimeout(timer); controller.abort(); };
  }, [scenarioId]);
  useEffect(() => loadBriefing(), [loadBriefing]);

  // Start screen: ask for the microphone once, here, so no permission dialog interrupts the visit.
  const begin = useCallback(async (mode: 'voice' | 'text') => {
    if (mode === 'text' || !navigator.mediaDevices?.getUserMedia) setMicPref(mode === 'text' ? 'off' : 'denied');
    else {
      setMicAsking(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        setMicPref('granted');
      } catch { setMicPref('denied'); }
      setMicAsking(false);
    }
    setPhase('briefing');
  }, []);

  const startVisit = useCallback((retry?: string) => {
    micStarted.current = false;
    setMicFailed(false);
    setRetryConcern(retry);
    setPhase('visit');
    live.restartVisit(retry ? { concernId: retry } : undefined);
  }, [live]);

  // Microphone: starts once the doctor's line has been heard. A fallback timer covers a silent opening.
  const doctorHeard = session.transcripts.some(item => item.speaker === 'doctor');
  const running = session.status === 'running';
  const startMic = live.startMic;
  useEffect(() => {
    if (phase !== 'visit' || !running || micPref !== 'granted' || micStarted.current) return;
    const launch = () => {
      if (micStarted.current) return;
      micStarted.current = true;
      void startMic().then(ok => { if (!ok) setMicFailed(true); });
    };
    if (doctorHeard && !session.audioPlaying) { launch(); return; }
    const timer = window.setTimeout(launch, MIC_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [phase, running, micPref, doctorHeard, session.audioPlaying, startMic]);

  // The server sends visit.ended after the closing line was heard. Hold a moment, then show the review.
  const ended = session.visitEnded;
  const stopMic = live.stopMic;
  const endVisit = live.endVisit;
  useEffect(() => {
    if (phase !== 'visit' || !ended) return;
    stopMic();
    const timer = window.setTimeout(() => {
      if (!retryConcern) setFirstEnded(ended);
      endVisit();
      setPhase('review');
    }, REVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, ended, retryConcern, stopMic, endVisit]);

  const next = useCallback(() => {
    live.clear();
    setFirstEnded(undefined);
    setRetryConcern(undefined);
    setUnderlying(false);
    setMicFailed(false);
    setPhase('start');
  }, [live]);

  const connectionLost = phase === 'visit' && session.status === 'error';
  const connected = session.status === 'running';
  const startNote = session.status === 'error'
    ? session.error ?? '无法连接演练服务。'
    : micAsking ? '请在浏览器里允许使用麦克风，用语音回答医生。'
      : session.status === 'connecting' ? '正在连接演练服务……' : '';

  const controls = (
    <StageControls
      connected={connected}
      error={session.error}
      mic={live.mic}
      volume={live.volume}
      sending={live.sending}
      micPossible={micPref === 'granted' && !micFailed}
      micBlocked={micPref === 'denied' || micFailed}
      onStartMic={() => { void live.startMic(); }}
      onStopMic={live.stopMic}
      onSendText={live.sendText}
      onFinishText={live.finishText}
    />
  );

  return (
    <div className="stage" data-testid="stage" data-phase={phase} data-status={session.status} lang="zh-Hans">
      <div className="st-backdrop" aria-hidden="true">
        <div className="st-glow a" /><div className="st-glow b" /><div className="st-dots" /><div className="st-vignette" /><div className="st-grain" />
      </div>
      <div className="st-canvas" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className="st-top" style={{ justifyContent: 'flex-end' }}>
          <div className="tools">
            <button type="button" className="st-iconbtn" onClick={toggleFullscreen} aria-label={fullscreen ? '退出全屏（F）' : '全屏（F）'} title="全屏（F）" data-testid="fullscreen">
              {fullscreen ? <Minimize2 size={24} /> : <Maximize2 size={24} />}
            </button>
          </div>
        </div>

        {phase === 'start' && (
          <main className="st-screen" key="start">
            <div className="st-center">
              <Wordmark size={220} />
              <div className="tagline">医药代表的临场应对训练</div>
              <div className="en">REAL-TIME CONVERSATION TRAINING</div>
              <div className="act">
                {session.status === 'error'
                  ? <button type="button" className="st-cta" onClick={live.open}>重新连接</button>
                  : <>
                      <button type="button" className="st-cta" onClick={() => void begin('voice')} disabled={!connected && session.status !== 'paused' || micAsking}>开始演练</button>
                      <button type="button" className="st-ghost" onClick={() => void begin('text')} disabled={micAsking}>不用麦克风，改用文字</button>
                    </>}
                <div className={`st-note${session.status === 'error' ? ' err' : ''}`} role="status" data-testid="start-note">{startNote}</div>
              </div>
            </div>
            <div className="st-hint">按 F 进入全屏</div>
          </main>
        )}

        {phase === 'briefing' && (
          <main className="st-screen" key="briefing">
            <BriefingPanel briefing={briefing} loading={briefingLoading} error={briefingError} onReload={loadBriefing} onStart={() => startVisit()} />
          </main>
        )}

        {phase === 'visit' && (
          <main className="st-screen" key={`visit-${retryConcern ?? 'first'}`}>
            <VisitPanel session={session} underlying={underlying} onToggleUnderlying={() => setUnderlying(value => !value)} controls={controls} />
          </main>
        )}

        {phase === 'review' && ended && (
          <main className="st-screen" key="review">
            <ReviewPanel ended={ended} previous={retryConcern ? firstEnded : undefined} onRetry={concernId => startVisit(concernId)} onNext={next} />
          </main>
        )}

        {connectionLost && (
          <div className="st-lost" role="alertdialog" aria-label="连接中断" data-testid="connection-lost">
            <div className="m">{session.error ?? '连接已断开。'}</div>
            <button type="button" className="st-cta small" onClick={() => { micStarted.current = false; live.startVisit(retryConcern ? { concernId: retryConcern } : undefined); }}>重新连接</button>
          </div>
        )}

        {phase !== 'start' && <button type="button" className="st-ghost st-reset" onClick={next}>重新开始</button>}
      </div>
    </div>
  );
}

export default StageView;
