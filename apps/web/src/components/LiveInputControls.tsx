import { useState } from 'react';
import { Mic, MicOff, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

interface LiveInputControlsProps {
  connected: boolean;
  connecting: boolean;
  error?: string;
  mic: 'off' | 'starting' | 'on';
  volume: number;
  sending: boolean;
  onReconnect: () => void;
  onToggleMic: () => void;
  onSendText: (text: string) => void;
  onFinishText: () => void;
  onStop: () => void;
}

export function LiveInputControls(props: LiveInputControlsProps) {
  const [text, setText] = useState('');
  const submit = () => {
    if (!text.trim() || !props.connected || props.sending) return;
    props.onSendText(text);
    setText('');
  };
  return (
    <section className="sticky bottom-0 z-30 w-full border-t border-line bg-surface px-4 sm:px-6 py-3" aria-label="实时回应">
      <div className="max-w-[1440px] mx-auto space-y-3">
        {props.error && <p role="alert" className="text-sm text-held-ink" data-testid="live-error">{props.error}</p>}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Button type="button" variant={props.mic === 'on' ? 'default' : 'quiet'} onClick={props.onToggleMic} disabled={!props.connected} aria-pressed={props.mic === 'on'}>
            {props.mic === 'on' ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {props.mic === 'on' ? '关闭麦克风' : props.mic === 'starting' ? '取消麦克风' : '开启麦克风'}
          </Button>
          <span role="status" className="text-ink-2">{props.mic === 'on' ? '正在收音' : props.mic === 'starting' ? '等待麦克风权限' : '用麦克风或文字回应医生'}</span>
          {props.mic === 'on' && <meter min={0} max={1} value={props.volume} aria-label="麦克风音量" className="w-24" />}
          <Button type="button" variant="quiet" size="sm" onClick={props.onReconnect} disabled={props.connecting} className="ml-auto gap-1">
            <RefreshCw className="w-3.5 h-3.5" />重新连接
          </Button>
          <Button type="button" variant="quiet" size="sm" onClick={props.onStop} disabled={!props.connected}>结束连线</Button>
        </div>
        <form onSubmit={event => { event.preventDefault(); submit(); }} className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full space-y-1">
            <label htmlFor="rep-speech" className="text-sm text-ink-2">文字回应</label>
            <textarea
              id="rep-speech"
              value={text}
              onChange={event => setText(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }}
              rows={2}
              maxLength={10000}
              disabled={!props.connected || props.sending}
              placeholder="输入或粘贴你的回应，按 Enter 开始说；Shift + Enter 换行"
              aria-describedby="rep-speech-help"
              className="block w-full resize-y border border-line bg-ground/50 rounded-[2px] px-3 py-2 text-sm text-ink select-text disabled:opacity-60"
            />
            <p id="rep-speech-help" className="text-xs text-ink-3">文字会逐步送出；医生可以在你说完前追问。</p>
          </div>
          {props.sending ? <Button type="button" onClick={props.onFinishText}>停止说话</Button> : <Button type="submit" disabled={!props.connected || !text.trim()}>开始说话</Button>}
        </form>
        <span className="sr-only" role="status">{props.sending ? '正在发送你的回应' : ''}</span>
      </div>
    </section>
  );
}
