import cors from 'cors';
import express from 'express';
import { connectDb } from './db';
import { HttpError } from './http';
import { startKeepAlive } from './keepalive';
import { attachLiveStream } from './liveStream';
import { registerRoutes } from './routes';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'meetiq-api', version: '1.1.0' });
});

registerRoutes(app);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  const multerCode = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : '';
  const name = err instanceof Error ? err.name : '';
  if (multerCode === 'LIMIT_FILE_SIZE' || name === 'MulterError') {
    const tooBig = multerCode === 'LIMIT_FILE_SIZE';
    res.status(tooBig ? 413 : 400).json({
      error: tooBig ? 'Audio files must be 25 MB or smaller.' : err instanceof Error ? err.message : 'Upload failed.',
      code: tooBig ? 'FILE_TOO_LARGE' : 'UPLOAD',
    });
    return;
  }
  console.error('Request failed:', err instanceof Error ? err.stack || err.message : err);
  res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL' });
});

const port = Number(process.env.PORT) || 10000;
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`MeetIQ API listening on 0.0.0.0:${port}`);
  try {
    connectDb();
    startKeepAlive();
    attachLiveStream(server);
  } catch (err) {
    console.error('Startup task failed:', err instanceof Error ? err.message : err);
  }
});

server.on('error', (err) => {
  console.error('HTTP server error:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
