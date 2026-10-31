import type { IConversationDriver, DriverStatus, DriverCallbacks } from './IConversationDriver';
import type { ServerMessage, ClientMessage, ControllerDispatchEvent, FollowupCandidate, JevDecisionResponse, AsrTranscriptDelta } from '@cuex/protocol';

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
  private serverUrl: string;
  private scenarioId: string;
  private mode: 'performance' | 'learning';
  private pingTimer: number | null = null;

  constructor(options: LiveWSDriverOptions = {}) {
    this.serverUrl = options.serverUrl || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/session';
    this.scenarioId = options.scenarioId || 'anshu-hypertension-01';
    this.mode = options.mode || 'performance';
  }

  get status(): DriverStatus {
    return this._status;
  }

  async init(callbacks: DriverCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.setStatus('idle');
  }

  async start(): Promise<void> {
    if (this._status === 'running' || this._status === 'connecting') return;
    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.serverUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.setStatus('running');
        this.sendMessage({
          type: 'session.start',
          payload: { scenarioId: this.scenarioId, mode: this.mode },
        });
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data);
          this.handleServerMessage(msg);
        } catch (e) {
          console.warn('[LiveWSDriver] Failed to parse server message:', e);
        }
      };

      this.ws.onerror = (e) => {
        console.error('[LiveWSDriver] WebSocket error:', e);
        this.setStatus('error');
        this.callbacks.onError?.(new Error('WebSocket connection error'));
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.setStatus('idle');
      };
    } catch (err: any) {
      this.setStatus('error');
      this.callbacks.onError?.(err);
    }
  }

  pause(): void {
    // Live sessions generally do not pause server-side streams, but can flag UI
    this.setStatus('paused');
  }

  resume(): void {
    if (this._status === 'paused') {
      this.setStatus('running');
    }
  }

  async stop(): Promise<void> {
    this.stopHeartbeat();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendMessage({
        type: 'session.stop',
        payload: { sessionId: 'current' },
      });
      this.ws.close();
    }
    this.ws = null;
    this.setStatus('idle');
  }

  destroy(): void {
    this.stop();
    this.callbacks = {};
  }

  sendAudioChunk(base64Pcm: string, timestamp: number): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendMessage({
        type: 'audio.chunk',
        payload: {
          format: 'pcm16',
          sampleRate: 16000,
          channels: 1,
          data: base64Pcm,
          timestamp,
        },
      });
    }
  }

  sendSpeechDelta(text: string, isFinal: boolean): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendMessage({
        type: 'speech.delta',
        payload: { text, isFinal },
      });
    }
  }

  private sendMessage(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleServerMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'controller.dispatch':
        this.callbacks.onDoctorDispatch?.(msg.payload);
        break;
      case 'asr.transcript':
        this.callbacks.onTranscript?.(msg.payload);
        break;
      case 'system1.verdict':
        this.callbacks.onSystem1Verdict?.(msg.payload);
        break;
      case 'system2.candidate':
        this.callbacks.onSystem2Candidate?.(msg.payload.candidate);
        break;
      case 'session.error':
        this.callbacks.onError?.(new Error(msg.payload.message));
        break;
      default:
        break;
    }
  }

  private setStatus(s: DriverStatus) {
    this._status = s;
    this.callbacks.onStatusChange?.(s);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
      }
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
