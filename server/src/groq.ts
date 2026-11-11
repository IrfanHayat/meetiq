import { HttpError } from './http';
import { ActionItem, Segment } from './models';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const WHISPER_MODEL = 'whisper-large-v3-turbo';
const CHAT_MODEL = 'llama-3.1-8b-instant';

export interface TranscriptResult {
  text: string;
  durationSeconds: number;
  language: string;
  segments: Segment[];
}

export interface SummaryResult {
  title: string;
  summary: string;
  keyPoints: string[];
  actionItems: ActionItem[];
}

export function requireGroqKey(): string {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) {
    throw new HttpError(
      503,
      'Transcription is temporarily unavailable because GROQ_API_KEY is not configured on the server.',
      'GROQ_NOT_CONFIGURED',
    );
  }
  return key;
}

function groqFailure(status: number, fallback: string): HttpError {
  if (status === 401 || status === 403) {
    return new HttpError(502, 'The AI service rejected the server API key. Check GROQ_API_KEY.', 'GROQ_AUTH');
  }
  if (status === 429) {
    return new HttpError(429, 'The AI service is busy right now. Please try again in a minute.', 'GROQ_RATE');
  }
  if (status === 413) {
    return new HttpError(413, 'That audio file is too large for transcription.', 'GROQ_TOO_LARGE');
  }
  return new HttpError(502, fallback, 'GROQ_ERROR');
}

async function groqFetch(path: string, body: FormData | Record<string, unknown>, timeoutMs: number, key: string): Promise<Response> {
  const isForm = body instanceof FormData;
  try {
    return await fetch(`${GROQ_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      },
      body: isForm ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new HttpError(504, 'The AI service took too long to respond. Try a shorter recording.', 'GROQ_TIMEOUT');
    }
    throw new HttpError(502, 'Could not reach the AI service. Please try again.', 'GROQ_NETWORK');
  }
}

export function normalizeLanguage(input: unknown): string {
  if (typeof input !== 'string') return 'en';
  const code = input.trim().toLowerCase().replace('_', '-').split('-')[0];
  if (!/^[a-z]{2,3}$/.test(code)) return 'en';
  return code;
}

export async function transcribeAudio(buffer: Buffer, filename: string, mime: string, language: string): Promise<TranscriptResult> {
  const key = requireGroqKey();
  const form = new FormData();
  const file = new File([new Uint8Array(buffer)], filename || 'audio.m4a', { type: mime || 'audio/mp4' });
  form.append('file', file);
  form.append('model', WHISPER_MODEL);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  if (language) form.append('language', language);

  const res = await groqFetch('/audio/transcriptions', form, 100_000, key);
  if (!res.ok) throw groqFailure(res.status, 'Transcription failed. Please try again.');

  const data = (await res.json()) as {
    text?: string;
    duration?: number;
    language?: string;
    segments?: { start?: number; end?: number; text?: string }[];
  };

  const text = (data.text || '').trim();
  const segments: Segment[] = Array.isArray(data.segments)
    ? data.segments
        .map((segment) => ({
          start: Number(segment.start) || 0,
          end: Number(segment.end) || 0,
          text: (segment.text || '').trim(),
        }))
        .filter((segment) => segment.text)
        .slice(0, 800)
    : [];

  return {
    text,
    durationSeconds: Number.isFinite(data.duration) ? Math.max(0, Number(data.duration)) : 0,
    language: normalizeLanguage(data.language || language),
    segments,
  };
}

function asStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, max);
}

function asActionItems(value: unknown): ActionItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const text = typeof row.text === 'string' ? row.text.trim() : '';
      if (!text) return null;
      return {
        text: text.slice(0, 280),
        owner: typeof row.owner === 'string' ? row.owner.trim().slice(0, 80) : '',
        due: typeof row.due === 'string' ? row.due.trim().slice(0, 80) : '',
        done: Boolean(row.done),
      };
    })
    .filter((item): item is ActionItem => Boolean(item))
    .slice(0, 12);
}

function parseSummary(rawText: string): SummaryResult | null {
  let raw = rawText.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      title: typeof data.title === 'string' ? data.title.replace(/^["']|["']$/g, '').trim().slice(0, 80) : '',
      summary: typeof data.summary === 'string' ? data.summary.trim().slice(0, 2000) : '',
      keyPoints: asStringArray(data.keyPoints, 8).map((point) => point.slice(0, 280)),
      actionItems: asActionItems(data.actionItems),
    };
  } catch {
    return null;
  }
}

export async function summarizeTranscript(transcript: string, language: string): Promise<SummaryResult> {
  const key = requireGroqKey();
  const clipped = transcript.slice(0, 24_000);
  const res = await groqFetch(
    '/chat/completions',
    {
      model: CHAT_MODEL,
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You turn a voice-note transcript into meeting notes. Reply with JSON only, using keys title (string, at most 8 words), summary (string, 1-3 sentences), keyPoints (array of 3-6 short strings), actionItems (array of objects with text, owner, due, done). owner and due are strings and may be empty. done is boolean. Use only facts from the transcript. Do not invent people, prices, or dates. Write in the same language as the transcript.',
        },
        {
          role: 'user',
          content: `Language hint: ${language}\n\nTranscript:\n${clipped}`,
        },
      ],
    },
    30_000,
    key,
  );

  if (!res.ok) {
    return fallbackSummary(transcript);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content || '';
  return parseSummary(content) || fallbackSummary(transcript);
}

function fallbackSummary(transcript: string): SummaryResult {
  const sentence = transcript.replace(/\s+/g, ' ').trim().slice(0, 320);
  return {
    title: '',
    summary: sentence,
    keyPoints: sentence ? [sentence] : [],
    actionItems: [],
  };
}

export async function answerFromTranscript(transcript: string, title: string, history: { role: 'user' | 'assistant'; content: string }[], question: string): Promise<string> {
  const key = requireGroqKey();
  const clipped = transcript.slice(0, 16_000);
  const prior = history.slice(-12).map((message) => ({
    role: message.role,
    content: message.content.slice(0, 2000),
  }));

  const res = await groqFetch(
    '/chat/completions',
    {
      model: CHAT_MODEL,
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: `You are MeetIQ. Answer questions using only the voice note below. If the note does not contain the answer, say you cannot find it in this note. Be concise and specific. Do not invent owners, dates, or decisions.\n\nTitle: ${title}\n\nTranscript:\n${clipped}`,
        },
        ...prior,
        { role: 'user', content: question.slice(0, 2000) },
      ],
    },
    30_000,
    key,
  );

  if (!res.ok) throw groqFailure(res.status, 'Chat is unavailable right now. Please try again.');
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const answer = (data.choices?.[0]?.message?.content || '').trim();
  if (!answer) throw new HttpError(502, 'The assistant returned an empty reply. Please try again.', 'GROQ_EMPTY');
  return answer.slice(0, 4000);
}
