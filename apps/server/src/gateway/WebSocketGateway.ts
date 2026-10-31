import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import type { AudioChunkPayload, ServerMessage } from '@cuex/protocol';
import type { AsrEngine, AsrStream, ScenarioPack } from '../contracts';
import { TurnController, type ControllerEngines, type ControllerOptions } from '../controller/TurnController';

export interface SessionEngines extends ControllerEngines { asr: AsrEngine }
export interface GatewayOptions {
  port?: number;
  host?: string;
  pack: ScenarioPack;
  createEngines: () => SessionEngines | Promise<SessionEngines>;
  controller?: ControllerOptions;
  onSessionEnd?: (snapshot: ReturnType<TurnController['snapshot']>) => void;
}
interface Connection {
  controller?: TurnController;
  engines?: SessionEngines;
  asr?: AsrStream;
  asrOpening?: Promise<AsrStream>;
  sampleRate?: number;
  generation: number;
  closed: boolean;
}
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export class WebSocketGateway {
  private http?: Server;
  private wss?: WebSocketServer;
  private readonly connections = new Map<WebSocket, Connection>();
  private actualPort: number;
  constructor(private readonly options: GatewayOptions) { this.actualPort = options.port ?? 8765; }
  get port(): number { return this.actualPort; }

  async start(): Promise<void> {
    if (this.http) return;
    const http = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: true, service: 'cuex', sessions: this.inspectSessions().length }));
      } else { res.writeHead(404); res.end('Not found'); }
    });
    this.http = http;
    this.wss = new WebSocketServer({ server: http, path: '/ws/session', maxPayload: 1024 * 1024, perMessageDeflate: false });
    this.wss.on('error', () => { /* The HTTP listen promise reports bind failures. */ });
    this.wss.on('connection', ws => {
      const connection: Connection = { generation: 0, closed: false };
      this.connections.set(ws, connection);
      ws.on('message', (raw, binary) => {
        if (binary) { this.error(ws, 'INVALID_MESSAGE', '请使用 JSON 消息发送音频。'); return; }
        let message: unknown;
        try { message = JSON.parse(raw.toString()); } catch { this.error(ws, 'INVALID_MESSAGE', '消息格式错误。'); return; }
        void this.handle(ws, connection, message).catch(() => this.error(ws, 'REQUEST_ERROR', '请求处理失败，请重试。'));
      });
      ws.on('error', () => this.closeConnection(connection));
      ws.on('close', () => { this.closeConnection(connection); this.connections.delete(ws); });
    });
    await new Promise<void>((resolve, reject) => {
      http.once('error', reject);
      http.listen(this.actualPort, this.options.host ?? '127.0.0.1', () => { http.off('error', reject); resolve(); });
    });
    this.actualPort = (http.address() as AddressInfo).port;
  }

  private async handle(ws: WebSocket, connection: Connection, message: unknown): Promise<void> {
    if (!isRecord(message) || typeof message.type !== 'string') { this.error(ws, 'INVALID_MESSAGE', '消息格式错误。'); return; }
    if (message.type === 'ping') return; // LiveWSDriver application heartbeat.
    const known = ['session.start', 'session.stop', 'speech.delta', 'audio.chunk', 'user.interrupted_doctor', 'tts.playback'];
    if (!known.includes(message.type)) return;
    const payload = message.payload;
    if (!isRecord(payload)) { this.error(ws, 'INVALID_MESSAGE', '消息缺少 payload。'); return; }
    if (message.type === 'session.start') {
      if (payload.scenarioId !== this.options.pack.scenario.id) { this.error(ws, 'UNKNOWN_SCENARIO', '没有找到这个演练场景。'); return; }
      if (payload.mode !== 'performance' && payload.mode !== 'learning') { this.error(ws, 'INVALID_MESSAGE', '请选择有效的演练模式。'); return; }
      let retryConcernId: string | undefined;
      const retry = payload.retry;
      if (retry !== undefined) {
        if (!isRecord(retry) || typeof retry.concernId !== 'string' || !this.options.pack.scenario.concerns.some(concern => concern.id === retry.concernId)) {
          this.error(ws, 'INVALID_MESSAGE', '重试关切不存在。'); return;
        }
        retryConcernId = retry.concernId;
      }
      this.resetSession(connection);
      const generation = connection.generation;
      const engines = await this.options.createEngines();
      if (connection.closed || generation !== connection.generation) return;
      const sessionId = randomUUID();
      connection.engines = engines;
      connection.controller = new TurnController(sessionId, this.options.pack, engines, event => this.send(ws, event), { ...this.options.controller, retryConcernId });
      this.send(ws, { type: 'session.ready', payload: { sessionId, serverTime: Date.now(), scenario: this.options.pack.scenario } });
      connection.controller.start();
      return;
    }
    if (message.type === 'session.stop') {
      if (typeof payload.sessionId !== 'string') { this.error(ws, 'INVALID_MESSAGE', '消息缺少 sessionId。'); return; }
      if (payload.sessionId === 'current' || payload.sessionId === connection.controller?.sessionId) this.resetSession(connection);
      return;
    }
    if (!connection.controller || !connection.engines) { this.error(ws, 'SESSION_NOT_STARTED', '请先开始演练。'); return; }
    if (message.type === 'speech.delta') {
      if (typeof payload.text !== 'string' || payload.text.length > 20000 || typeof payload.isFinal !== 'boolean') { this.error(ws, 'INVALID_MESSAGE', '语音文本格式错误。'); return; }
      connection.controller.onSpeechDelta(payload.text, payload.isFinal);
    } else if (message.type === 'user.interrupted_doctor') {
      if (typeof payload.timestamp !== 'number' || !Number.isFinite(payload.timestamp)) { this.error(ws, 'INVALID_MESSAGE', '中断时间格式错误。'); return; }
      connection.controller.interruptDoctor();
    } else if (message.type === 'tts.playback') {
      if (typeof payload.sessionId !== 'string' || typeof payload.utteranceId !== 'string' || !Number.isInteger(payload.completedChunks)
        || (payload.completedChunks as number) < 0 || typeof payload.playedMs !== 'number' || !Number.isFinite(payload.playedMs) || payload.playedMs < 0
        || (payload.status !== 'stopped' && payload.status !== 'finished')) { this.error(ws, 'INVALID_MESSAGE', '播放进度格式错误。'); return; }
      connection.controller.onPlaybackReport(payload as unknown as import('@cuex/protocol').TtsPlaybackReport);
    } else if (message.type === 'audio.chunk') {
      const audio = this.validateAudio(payload);
      if (!audio) { this.error(ws, 'UNSUPPORTED_AUDIO', '请发送 16 kHz 单声道 PCM16 音频。'); return; }
      if (connection.engines.asr.backend === 'text-only') { this.error(ws, 'ASR_TEXT_ONLY', '当前为文字模式，请发送文字或启用语音识别。'); return; }
      const generation = connection.generation;
      if (!connection.asrOpening) {
        const controller = connection.controller;
        connection.sampleRate = audio.sampleRate;
        connection.asrOpening = connection.engines.asr.open({ sampleRate: audio.sampleRate }, {
          onPartial: text => { if (generation === connection.generation && !connection.closed) controller.onAsrTranscript(text, false); },
          onFinal: text => { if (generation === connection.generation && !connection.closed) controller.onAsrTranscript(text, true); },
          onError: () => { if (generation === connection.generation && !connection.closed) this.error(ws, 'ASR_ERROR', '语音识别暂时不可用，请重试。'); },
        }).then(stream => {
          if (generation !== connection.generation || connection.closed) { stream.end(); return stream; }
          connection.asr = stream;
          return stream;
        }).catch(error => { if (generation === connection.generation) connection.asrOpening = undefined; throw error; });
      }
      const stream = await connection.asrOpening;
      if (generation !== connection.generation || connection.closed) return;
      stream.write(Buffer.from(audio.data, 'base64'));
    }
  }

  private validateAudio(payload: Record<string, unknown>): AudioChunkPayload | undefined {
    if (payload.format !== 'pcm16' || payload.sampleRate !== 16000 || payload.channels !== 1 || typeof payload.timestamp !== 'number'
      || !Number.isFinite(payload.timestamp) || typeof payload.data !== 'string' || !payload.data.length || payload.data.length > 512000
      || payload.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload.data)) return;
    const bytes = Buffer.from(payload.data, 'base64').length;
    if (!bytes || bytes % 2 !== 0) return;
    return payload as unknown as AudioChunkPayload;
  }

  private resetSession(connection: Connection): void {
    connection.generation++;
    if (connection.controller) {
      this.options.onSessionEnd?.(connection.controller.snapshot());
      connection.controller.stop();
      connection.controller = undefined;
    }
    connection.asr?.end(); connection.asr = undefined; connection.asrOpening = undefined;
    connection.engines = undefined;
  }
  private closeConnection(connection: Connection): void { connection.closed = true; this.resetSession(connection); }
  private error(ws: WebSocket, code: string, message: string): void { this.send(ws, { type: 'session.error', payload: { code, message } }); }
  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 4 * 1024 * 1024) { ws.close(1013, 'Client too slow'); return; }
    ws.send(JSON.stringify(message));
  }
  inspectSessions() { return [...this.connections.values()].flatMap(c => c.controller ? [c.controller.snapshot()] : []); }
  async stop(): Promise<void> {
    const wss = this.wss; const http = this.http;
    this.wss = undefined; this.http = undefined;
    for (const [ws, connection] of this.connections) { this.closeConnection(connection); ws.terminate(); }
    this.connections.clear();
    if (wss) await new Promise<void>(resolve => wss.close(() => resolve()));
    if (http) await new Promise<void>(resolve => http.close(() => resolve()));
  }
}
