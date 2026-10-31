import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AudioCapture } from '../audio/AudioCapture';
import { LiveWSDriver } from '../driver/LiveWSDriver';
import { emptySession, liveSessionReducer } from './liveSession';

export function useLiveSession(enabled: boolean) {
  const [session, dispatch] = useReducer(liveSessionReducer, emptySession);
  const [mic, setMic] = useState<'off' | 'starting' | 'on'>('off');
  const [volume, setVolume] = useState(0);
  const [sending, setSending] = useState(false);
  const driver = useRef<LiveWSDriver>();
  const capture = useRef(new AudioCapture());
  const textTimer = useRef<number>();
  const textPrefix = useRef('');

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

  const connect = useCallback(() => {
    cancelText();
    stopMic();
    driver.current?.destroy();
    dispatch({ type: 'reset' });
    const live = new LiveWSDriver();
    driver.current = live;
    void live.init({
      onServerEvent: event => {
        dispatch({ type: 'event', event });
        if (event.type === 'controller.dispatch' && event.payload.action.type === 'interrupt_speak') cancelText();
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
    void live.unlockAudio().catch(() => dispatch({ type: 'error', message: '请允许浏览器播放音频，再重新连接。' }));
    void live.start();
  }, [cancelText, stopMic]);

  useEffect(() => {
    if (!enabled) return;
    if (!driver.current) connect();
    return () => {
      cancelText();
      stopMic();
      driver.current?.destroy();
      driver.current = undefined;
    };
  }, [enabled, connect, cancelText, stopMic]);

  const toggleMic = useCallback(async () => {
    if (mic !== 'off') { stopMic(); return; }
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
    setMic(started ? 'on' : 'off');
  }, [mic, cancelText, stopMic]);

  const sendText = useCallback((text: string) => {
    const speech = text.trim();
    if (!speech || session.status !== 'running' || speech.length > 10000) return;
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
  }, [session.status, cancelText, stopMic]);

  const finishText = useCallback(() => {
    if (sending) driver.current?.sendSpeechDelta('', true);
    cancelText();
  }, [sending, cancelText]);

  return { session, connect, stop, mic, volume, toggleMic, sending, sendText, finishText };
}
