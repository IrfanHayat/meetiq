import { Segment } from './models';

const LISTEN = 'https://api.deepgram.com/v1/listen';

export interface SttResult {
  text: string;
  durationSeconds: number;
  language: string;
  segments: Segment[];
  provider: 'deepgram' | 'groq';
}

export function deepgramKey(): string {
  return process.env.DEEPGRAM_API_KEY?.trim() || '';
}

function speakerId(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

export async function grantDeepgramToken(ttlSeconds = 60): Promise<{ accessToken: string; expiresIn: number }> {
  const key = deepgramKey();
  if (!key) {
    throw new Error('DEEPGRAM_API_KEY is not set');
  }
  const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl_seconds: Math.min(3600, Math.max(10, ttlSeconds)) }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    throw new Error(`Deepgram grant failed (${res.status})`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Deepgram grant returned no token');
  return { accessToken: data.access_token, expiresIn: Number(data.expires_in) || ttlSeconds };
}

export async function transcribeWithDeepgram(buffer: Buffer, mime: string, language?: string): Promise<SttResult> {
  const key = deepgramKey();
  if (!key) throw new Error('DEEPGRAM_API_KEY is not set');
  const params = new URLSearchParams({
    model: 'nova-3',
    diarize: 'true',
    punctuate: 'true',
    smart_format: 'true',
    utterances: 'true',
    paragraphs: 'true',
  });
  if (language && language !== 'en') params.set('language', language);
  else params.set('detect_language', 'true');

  const res = await fetch(`${LISTEN}?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': mime || 'audio/mp4',
    },
    body: new Uint8Array(buffer),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    throw new Error(`Deepgram listen failed (${res.status})`);
  }
  const data = (await res.json()) as {
    metadata?: { duration?: number; detected_language?: string };
    results?: {
      channels?: { alternatives?: { transcript?: string; words?: { word?: string; punctuated_word?: string; start?: number; end?: number; speaker?: number }[] }[] }[];
      utterances?: { start?: number; end?: number; transcript?: string; speaker?: number }[];
    };
  };

  const utterances = data.results?.utterances || [];
  let segments: Segment[] = utterances
    .map((item) => ({
      start: Number(item.start) || 0,
      end: Number(item.end) || 0,
      text: (item.transcript || '').trim(),
      speaker: speakerId(item.speaker),
    }))
    .filter((item) => item.text);

  if (!segments.length) {
    const words = data.results?.channels?.[0]?.alternatives?.[0]?.words || [];
    const grouped: Segment[] = [];
    for (const word of words) {
      const text = (word.punctuated_word || word.word || '').trim();
      if (!text) continue;
      const speaker = speakerId(word.speaker);
      const start = Number(word.start) || 0;
      const end = Number(word.end) || start;
      const last = grouped[grouped.length - 1];
      if (last && last.speaker === speaker && start - last.end < 1.2) {
        last.end = end;
        last.text = `${last.text} ${text}`.trim();
      } else {
        grouped.push({ start, end, text, speaker });
      }
    }
    segments = grouped;
  }

  const transcript = (data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim()
    || segments.map((segment) => segment.text).join(' ').trim();

  return {
    text: transcript,
    durationSeconds: Number(data.metadata?.duration) || (segments.length ? segments[segments.length - 1].end : 0),
    language: data.metadata?.detected_language || language || 'en',
    segments: segments.slice(0, 800),
    provider: 'deepgram',
  };
}
