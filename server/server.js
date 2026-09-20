import http from 'http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 10000;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'dub-together-server'
    }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Dub Together server is running');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.send(JSON.stringify({
    type: 'CONNECTED',
    message: 'Connected to Dub Together server'
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      console.log('Message:', data);

      if (data.type === 'PING') {
        ws.send(JSON.stringify({
          type: 'PONG'
        }));
      }
    } catch (error) {
      console.error('Invalid message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dub Together server listening on port ${PORT}`);
});