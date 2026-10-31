import { WebSocketGateway } from './gateway/WebSocketGateway';

const PORT = parseInt(process.env.PORT || '8765', 10);
const gateway = new WebSocketGateway(PORT);

gateway.start();

process.on('SIGINT', () => {
  gateway.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  gateway.stop();
  process.exit(0);
});
