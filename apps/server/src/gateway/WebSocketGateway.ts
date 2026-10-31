import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@cuex/protocol';
import { TurnController } from '../controller/TurnController';

export class WebSocketGateway {
  private wss: WebSocketServer | null = null;
  private controllers = new Map<WebSocket, TurnController>();

  constructor(private port: number = 8765) {}

  start(): void {
    this.wss = new WebSocketServer({ port: this.port });
    console.log(`[WebSocketGateway] CueX Server listening on ws://localhost:${this.port}`);

    this.wss.on('connection', (ws) => {
      const controller = new TurnController();
      this.controllers.set(ws, controller);
      console.log('[WebSocketGateway] Client connected');

      ws.on('message', async (data) => {
        try {
          const msg: ClientMessage = JSON.parse(data.toString());
          await this.handleClientMessage(ws, controller, msg);
        } catch (err) {
          console.warn('[WebSocketGateway] Error parsing message:', err);
        }
      });

      ws.on('close', () => {
        this.controllers.delete(ws);
        console.log('[WebSocketGateway] Client disconnected');
      });
    });
  }

  stop(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  private async handleClientMessage(ws: WebSocket, controller: TurnController, msg: ClientMessage) {
    if (msg.type === 'session.start') {
      this.send(ws, {
        type: 'session.ready',
        payload: { sessionId: `ses-${Date.now()}`, serverTime: Date.now() },
      });
      return;
    }

    if (msg.type === 'speech.delta') {
      const { dispatch, verdict, candidateUpdate } = await controller.onSpeechChunk(
        'current-session',
        msg.payload.text
      );

      // 1. 发送 System 1 快速判定
      if (verdict) {
        this.send(ws, { type: 'system1.verdict', payload: verdict });
      }

      // 2. 发送 System 2 候选更新
      if (candidateUpdate) {
        this.send(ws, {
          type: 'system2.candidate',
          payload: { sessionId: 'current-session', candidate: candidateUpdate },
        });
      }

      // 3. 发送 Controller 仲裁派发指令
      this.send(ws, { type: 'controller.dispatch', payload: dispatch });
    }
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
