import mongoose from 'mongoose';

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let connecting = false;

export function dbReady(): boolean {
  return mongoose.connection.readyState === 1;
}

export function connectDb(): void {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.error('MONGODB_URI is not set. Database routes will return 503 until it is configured.');
    return;
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Will retry.');
    scheduleRetry(uri);
  });

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB error:', err?.message || err);
  });

  void attempt(uri);
}

function scheduleRetry(uri: string): void {
  if (retryTimer || connecting || dbReady()) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void attempt(uri);
  }, 15_000);
}

async function attempt(uri: string): Promise<void> {
  if (connecting || dbReady()) return;
  connecting = true;
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8_000,
      maxPoolSize: 10,
    });
    console.log('MongoDB connected');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('MongoDB connection failed:', message);
    scheduleRetry(uri);
  } finally {
    connecting = false;
  }
}
