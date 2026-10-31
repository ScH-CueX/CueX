import React, { useState } from 'react';

interface StageControlsProps {
  connected: boolean;
  error?: string;
  mic: 'off' | 'starting' | 'on';
  volume: number;
  sending: boolean;
  /** False when the browser denied the microphone. The page then offers typed input only. */
  micPossible: boolean;
  /** True when the microphone was refused or failed, as opposed to the audience choosing text. */
  micBlocked: boolean;
  onStartMic: () => void;
  onStopMic: () => void;
  onSendText: (text: string) => void;
  onFinishText: () => void;
}

const BARS = [0.5, 0.8, 0.6, 1, 0.7, 0.9, 0.5, 0.8, 0.6, 0.9, 0.7, 0.5];

/** The rep's answer: microphone first, typed text when the microphone is off or denied. */
export const StageControls: React.FC<StageControlsProps> = props => {
  const [text, setText] = useState('');
  const submit = () => {
    if (!text.trim() || !props.connected || props.sending) return;
    props.onSendText(text);
    setText('');
  };
  const level = Math.min(1, props.volume * 6);
  return (
    <section className="st-input" aria-label="你的回答">
      {props.mic === 'on' ? (
        <>
          <div className="st-meter" role="meter" aria-label="麦克风音量" aria-valuemin={0} aria-valuemax={1} aria-valuenow={level}>
            {BARS.map((k, i) => <b key={i} style={{ height: 8 + level * 40 * k }} />)}
          </div>
          <div className="state">
            <span className="big">正在听你说，直接回答医生</span>
            {props.error && <span className="small err" role="alert" data-testid="live-error">{props.error}</span>}
          </div>
          <button type="button" className="st-ghost" onClick={props.onStopMic}>改用文字</button>
        </>
      ) : props.mic === 'starting' ? (
        <div className="state"><span className="big" role="status">正在打开麦克风……</span></div>
      ) : (
        <>
          <textarea
            id="rep-speech"
            aria-label="文字回应"
            value={text}
            onChange={event => setText(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }}
            maxLength={10000}
            disabled={!props.connected || props.sending}
            placeholder={props.micBlocked ? '麦克风不可用，请输入你的回答，按 Enter 开始说' : '输入你的回答，按 Enter 开始说'}
          />
          {props.error && <span className="small err" role="alert" data-testid="live-error" style={{ maxWidth: 360, fontSize: 19, color: 'var(--cue)' }}>{props.error}</span>}
          {props.micPossible && !props.sending && <button type="button" className="st-ghost" onClick={props.onStartMic} disabled={!props.connected}>用麦克风</button>}
          {props.sending
            ? <button type="button" className="st-cta small go" onClick={props.onFinishText}>停止说话</button>
            : <button type="button" className="st-cta small go" onClick={submit} disabled={!props.connected || !text.trim()}>开始说话</button>}
        </>
      )}
    </section>
  );
};
