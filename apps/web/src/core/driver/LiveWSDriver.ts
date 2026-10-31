import type { IConversationDriver, DriverStatus, DriverCallbacks } from './IConversationDriver';
import type { ServerMessage, ClientMessage } from '@cuex/protocol';
import { StreamAudioPlayer } from '../audio/StreamAudioPlayer';

export interface LiveWSDriverOptions {
  serverUrl?: string;
  scenarioId?: string;
  mode?: 'performance' | 'learning';
}

export class LiveWSDriver implements IConversationDriver {
  readonly id = 'live-ws-driver';
  private _status: DriverStatus = 'idle';
  private callbacks: DriverCallbacks = {};
  private ws: WebSocket | null = null;
  private sessionId?: string;
  private pingTimer?: number;
  private connectTimer?: number;
  private doctorPending = false;
  private readonly onOffline = () => this.fail('网络已断开，请恢复网络后重新连接。');
  private readonly player = new StreamAudioPlayer({
    onReport: payload => this.sendMessage({ type: 'tts.playback', payload }),
    onPlayingChange: playing => this.callbacks.onAudioPlayingChange?.(playing),
    onError: error => this.callbacks.onError?.(error, 'AUDIO_PLAYBACK'),
  });

  constructor(private readonly options: LiveWSDriverOptions = {}) {}
  get status(): DriverStatus { return this._status; }

  async init(callbacks: DriverCallbacks): Promise<void> { this.callbacks = callbacks; }
  unlockAudio(): Promise<void> { return this.player.unlock(); }

  async start(): Promise<void> {
    if (this.ws) return;
    this.setStatus('connecting');
    window.addEventListener('offline', this.onOffline);
    try {
      const url = this.options.serverUrl ?? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/session`;
      const ws = new WebSocket(url);
      this.ws = ws;
      this.connectTimer = window.setTimeout(() => {
        if (this.ws === ws && this._status === 'connecting') this.fail('连接超时，请确认后端已启动后重连。');
      }, 10000);
      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.sendMessage({ type: 'session.start', payload: { scenarioId: this.options.scenarioId ?? 'anshu-hypertension-01', mode: this.options.mode ?? 'performance' } });
        this.pingTimer = window.setInterval(() => this.sendMessage({ type: 'ping', payload: { t: Date.now() } }), 15000);
      };
      ws.onmessage = event => {
        if (this.ws !== ws) return;
        try { this.handleServerMessage(JSON.parse(event.data) as ServerMessage); }
        catch { this.callbacks.onError?.(new Error('收到无法读取的服务端消息，请重新连接。'), 'INVALID_SERVER_MESSAGE'); }
      };
      ws.onerror = () => { if (this.ws === ws) this.fail('无法连接后端，请确认服务已启动后重连。'); };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.player.abort();
        this.ws = null;
        this.clearTimers();
        if (this._status !== 'error') this.fail('连接已断开，请重新连接。');
      };
    } catch { this.fail('无法连接后端，请确认服务地址后重连。'); }
  }

  // Live input cannot pause the server. The view exposes stop/reconnect instead.
  pause(): void {}
  resume(): void {}

  async stop(): Promise<void> {
    this.clearTimers();
    this.player.abort();
    this.sendMessage({ type: 'session.stop', payload: { sessionId: this.sessionId ?? 'current' } });
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.sessionId = undefined;
    this.doctorPending = false;
    this.setStatus('idle');
  }

  destroy(): void {
    void this.stop();
    this.player.destroy();
    this.callbacks = {};
  }

  interruptDoctor(): void {
    const active = this.player.active || this.doctorPending;
    this.player.abort(); // Sends tts.playback synchronously, before interruption or rep input.
    this.doctorPending = false;
    if (active) this.sendMessage({ type: 'user.interrupted_doctor', payload: { timestamp: Date.now() } });
  }

  sendAudioChunk(base64Pcm: string, timestamp: number): void {
    if (this._status !== 'running') return;
    this.sendMessage({ type: 'audio.chunk', payload: { format: 'pcm16', sampleRate: 16000, channels: 1, data: base64Pcm, timestamp } });
  }

  sendSpeechDelta(text: string, isFinal: boolean): void {
    if (this._status !== 'running') return;
    this.interruptDoctor();
    this.sendMessage({ type: 'speech.delta', payload: { text, isFinal } });
  }

  private sendMessage(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private handleServerMessage(msg: ServerMessage): void {
    this.callbacks.onServerEvent?.(msg);
    switch (msg.type) {
      case 'session.ready':
        this.sessionId = msg.payload.sessionId;
        window.clearTimeout(this.connectTimer);
        this.setStatus('running');
        break;
      case 'controller.dispatch':
        if (msg.payload.action.textToSpeak) this.doctorPending = true;
        this.callbacks.onDoctorDispatch?.(msg.payload);
        break;
      case 'asr.transcript': this.callbacks.onTranscript?.(msg.payload); break;
      case 'system1.verdict': this.callbacks.onSystem1Verdict?.(msg.payload); break;
      case 'system2.candidate': this.callbacks.onSystem2Candidate?.(msg.payload.candidate); break;
      case 'tts.stream_chunk':
        this.player.enqueue(msg.payload);
        if (msg.payload.isLastChunk) this.doctorPending = false;
        break;
      case 'tts.abort':
        this.player.abort(msg.payload.utteranceId);
        this.doctorPending = false;
        break;
      case 'session.error': this.callbacks.onError?.(new Error(msg.payload.message), msg.payload.code); break;
      default: {
        const unhandled: never = msg;
        void unhandled;
      }
    }
  }

  private fail(message: string): void {
    this.player.abort();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.clearTimers();
    this.setStatus('error');
    this.callbacks.onError?.(new Error(message), 'CONNECTION_ERROR');
  }

  private setStatus(status: DriverStatus): void {
    this._status = status;
    this.callbacks.onStatusChange?.(status);
  }

  private clearTimers(): void {
    window.removeEventListener('offline', this.onOffline);
    window.clearInterval(this.pingTimer);
    window.clearTimeout(this.connectTimer);
  }
}
