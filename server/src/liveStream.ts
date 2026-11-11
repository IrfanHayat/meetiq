import { IncomingMessage, Server } from 'http';
import jwt from 'jsonwebtoken';
import { WebSocket, WebSocketServer } from 'ws';
import { deepgramKey } from './deepgram';
import { User } from './models';
import { assertDaily, refreshUsageWindow, rollDaily } from './usage';

function jwtUserId(token: string): Promise<string | null> {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || !token) return Promise.resolve(null);
  try {
    const payload = jwt.verify(token, secret) as { sub?: string };
    return Promise.resolve(payload.sub || null);
  } catch {
    return Promise.resolve(null);
  }
}

export function attachLiveStream(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const host = request.headers.host || 'localhost';
    let url: URL;
    try {
      url = new URL(request.url || '/', `http://${host}`);
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== '/api/live/stream') {
      socket.destroy();
      return;
    }

    const token = url.searchParams.get('access_token') || '';
    void jwtUserId(token).then(async (userId) => {
      if (!userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      const key = deepgramKey();
      if (!key) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      const user = await User.findById(userId);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      try {
        refreshUsageWindow(user);
        rollDaily(user);
        assertDaily(user, 'liveCount');
        await user.save();
      } catch {
        socket.write('HTTP/1.1 402 Payment Required\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (client) => {
        proxyDeepgram(client, key);
      });
    }).catch(() => {
      socket.destroy();
    });
  });
}

function proxyDeepgram(client: WebSocket, key: string): void {
  const params = new URLSearchParams({
    model: 'nova-3',
    diarize: 'true',
    punctuate: 'true',
    smart_format: 'true',
    interim_results: 'true',
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
  });
  const upstream = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, {
    headers: { Authorization: `Token ${key}` },
  });

  const closeBoth = () => {
    if (client.readyState === WebSocket.OPEN) client.close();
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
  };

  upstream.on('message', (data) => {
    if (client.readyState === WebSocket.OPEN) client.send(data.toString());
  });
  upstream.on('error', () => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'Error', message: 'Deepgram streaming failed. Use chunked transcription instead.' }));
    }
    closeBoth();
  });
  upstream.on('close', () => {
    if (client.readyState === WebSocket.OPEN) client.close();
  });

  client.on('message', (data, isBinary) => {
    if (upstream.readyState !== WebSocket.OPEN) return;
    upstream.send(isBinary ? data : data.toString());
  });
  client.on('close', () => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(JSON.stringify({ type: 'CloseStream' }));
      upstream.close();
    }
  });
  client.on('error', closeBoth);
}
