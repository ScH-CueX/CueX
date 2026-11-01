import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AudioCapture } from '../audio/AudioCapture';
import { LiveWSDriver } from '../driver/LiveWSDriver';
import { emptySession, liveSessionReducer } from './liveSession';

export type RetryRequest = { concernId: string };

export function useLiveSession(enabled: boolean, scenarioId?: string) {
  const [session, dispatch] = useReducer(liveSessionReducer, emptySession);
  const [mic, setMic] = useState<'off' | 'starting' | 'on'>('off');
  const [volume, setVolume] = useState(0);
  const [sending, setSending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const driver = useRef<LiveWSDriver>();
  const capture = useRef(new AudioCapture());
  const textTimer = useRef<number>();
  const textPrefix = useRef('');
  const inputBlocked = useRef(false);

  const cancelText = useCallback(() => {
    window.clearInterval(textTimer.current);
    textTimer.current = undefined;
    textPrefix.current = '';
    setSending(false);
  }, []);
  const stopMic = useCallback(() => {
    capture.current.stop();
    setMic('off');
    setVolume(0);
  }, []);
  const stop = useCallback(() => {
    cancelText();
    stopMic();
    void driver.current?.stop();
  }, [cancelText, stopMic]);

  const startVisit = useCallback((retry?: RetryRequest, idle = false) => {
    inputBlocked.current = false;
    cancelText();
    stopMic();
    driver.current?.destroy();
    dispatch({ type: 'reset' });
    setFinishing(false);
    const live = new LiveWSDriver({ retry, idle, scenarioId });
    driver.current = live;
    void live.init({
      onServerEvent: event => {
        dispatch({ type: 'event', event });
        if (event.type === 'controller.dispatch' && event.payload.action.type === 'interrupt_speak') cancelText();
        if (event.type === 'visit.ended') { inputBlocked.current = true; cancelText(); stopMic(); setFinishing(false); }
      },
      onStatusChange: status => {
        dispatch({ type: 'status', status });
        if (status === 'error') { cancelText(); stopMic(); }
      },
      onAudioPlayingChange: playing => dispatch({ type: 'audio', playing }),
      onError: (error, code) => {
        dispatch({ type: 'error', message: error.message });
        if (code?.startsWith('ASR') || code === 'UNSUPPORTED_AUDIO') stopMic();
      },
    });
    // connect() is called by a user gesture. Resume before the server's first audio.
    if (idle) void live.start();
    else void live.unlockAudio().then(() => { if (driver.current === live) void live.start(); })
      .catch(() => dispatch({ type: 'error', message: '请允许浏览器播放音频，再点击开始拜访。' }));
  }, [cancelText, stopMic, scenarioId]);
  const connect = useCallback(() => startVisit(), [startVisit]);
  /** Connects without starting a visit. The stage page calls this on load. */
  const open = useCallback(() => startVisit(undefined, true), [startVisit]);

  const finishVisit = useCallback(() => {
    if (session.status !== 'running' || finishing || session.visitEnded) return;
    cancelText();
    stopMic();
    inputBlocked.current = true;
    setFinishing(true);
    driver.current?.finishVisit();
  }, [session.status, session.visitEnded, finishing, cancelText, stopMic]);

  /** Abrupt visit reset for internal legacy consumers. */
  const endVisit = useCallback(() => {
    cancelText();
    stopMic();
    driver.current?.endVisit();
  }, [cancelText, stopMic]);

  /** Next visit on the same socket. A dead socket falls back to a fresh connection. */
  const restartVisit = useCallback((retry?: RetryRequest) => {
    cancelText();
    stopMic();
    dispatch({ type: 'visit' });
    inputBlocked.current = false;
    setFinishing(false);
    const live = driver.current;
    if (live && (live.status === 'paused' || live.status === 'running')) {
      void live.unlockAudio().then(() => { if (!live.restart(retry)) startVisit(retry); })
        .catch(() => dispatch({ type: 'error', message: '请允许浏览器播放音频，再重新连接。' }));
    } else startVisit(retry);
  }, [cancelText, stopMic, startVisit]);

  useEffect(() => {
    if (!enabled) return;
    // Starting a real visit requires an explicit click for browser audio.
    return () => {
      cancelText();
      stopMic();
      driver.current?.destroy();
      driver.current = undefined;
    };
  }, [enabled, connect, cancelText, stopMic]);

  /** Always (re)starts capture. Call it from a click so the browser can ask for permission. */
  const startMic = useCallback(async (): Promise<boolean> => {
    if (inputBlocked.current) return false;
    cancelText();
    dispatch({ type: 'error', message: undefined });
    setMic('starting');
    void driver.current?.unlockAudio();
    let voicedFrames = 0;
    let voiceActive = false;
    const started = await capture.current.start({
      onAudioChunk: (pcm, timestamp) => driver.current?.sendAudioChunk(pcm, timestamp),
      onVolumeChange: rms => {
        setVolume(rms);
        // Three voiced frames reject short clicks. Silence rearms interruption.
        voicedFrames = rms > 0.06 ? voicedFrames + 1 : 0;
        if (voicedFrames >= 3 && !voiceActive) { voiceActive = true; driver.current?.interruptDoctor(); }
        if (!voicedFrames) voiceActive = false;
      },
      onError: error => dispatch({ type: 'error', message: error.name === 'NotAllowedError' ? '麦克风权限已关闭。请允许访问，或用文字回应。' : error.message }),
    });
    if (inputBlocked.current) { stopMic(); return false; }
    setMic(started ? 'on' : 'off');
    return started;
  }, [cancelText, stopMic]);
  const toggleMic = useCallback(async () => {
    if (mic !== 'off') { stopMic(); return; }
    await startMic();
  }, [mic, stopMic, startMic]);

  /** Clears the visit for the next audience member and keeps the socket for the server's prepared opening. */
  const clear = useCallback(() => {
    cancelText();
    stopMic();
    driver.current?.endVisit();
    dispatch({ type: 'visit' });
    // The socket stays open for the next audience member. Reset must not read as a closed connection.
    if (driver.current) dispatch({ type: 'status', status: driver.current.status });
  }, [cancelText, stopMic]);

  useEffect(() => () => {
    window.clearInterval(textTimer.current);
    capture.current.stop();
    driver.current?.destroy();
    driver.current = undefined;
  }, []);

  const sendText = useCallback((text: string) => {
    const speech = text.trim();
    if (!speech || session.status !== 'running' || finishing || session.visitEnded || speech.length > 10000) return;
    cancelText();
    stopMic();
    dispatch({ type: 'error', message: undefined });
    void driver.current?.unlockAudio();
    setSending(true);
    let cursor = 0;
    // Incremental deltas remain valid if the Controller closes a rep turn mid-sentence.
    const advance = () => {
      const delta = speech.slice(cursor, cursor + 2);
      cursor += delta.length;
      textPrefix.current += delta;
      const final = cursor === speech.length;
      driver.current?.sendSpeechDelta(textPrefix.current, final);
      if (final) cancelText();
    };
    advance();
    if (cursor < speech.length) textTimer.current = window.setInterval(advance, 200);
  }, [session.status, session.visitEnded, finishing, cancelText, stopMic]);

  const finishText = useCallback(() => {
    if (sending) driver.current?.sendSpeechDelta('', true);
    cancelText();
  }, [sending, cancelText]);

  return { session, connect, open, startVisit, restartVisit, finishVisit, finishing, endVisit, clear, stop, stopMic, startMic, mic, volume, toggleMic, sending, sendText, finishText };
}
