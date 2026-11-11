import { HttpError } from './http';
import { Segment } from './models';

export function youtubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/);
  return match?.[1] || null;
}

function extractPlayer(html: string): Record<string, unknown> | null {
  const key = 'ytInitialPlayerResponse';
  const idx = html.indexOf(key);
  if (idx < 0) return null;
  const start = html.indexOf('{', idx);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < html.length && i < start + 2_000_000; i += 1) {
    const char = html[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function decodeText(value: string): string {
  return value
    .replace(/\\n/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export interface YoutubeTranscript {
  videoId: string;
  title: string;
  durationSeconds: number;
  segments: Segment[];
  text: string;
  via: 'captions' | 'audio';
}

export async function loadYoutube(url: string): Promise<{ videoId: string; title: string; durationSeconds: number; captions: YoutubeTranscript | null; audio: { url: string; mime: string } | null; blockedReason: string }> {
  const videoId = youtubeId(url);
  if (!videoId) throw new HttpError(400, 'Paste a YouTube link or an 11-character video id.', 'YOUTUBE_URL');

  let html = '';
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15_000),
    });
    html = await res.text();
    if (!res.ok) {
      return { videoId, title: 'YouTube video', durationSeconds: 0, captions: null, audio: null, blockedReason: `YouTube returned ${res.status}.` };
    }
  } catch {
    return { videoId, title: 'YouTube video', durationSeconds: 0, captions: null, audio: null, blockedReason: 'Could not reach YouTube from this server.' };
  }

  const player = extractPlayer(html);
  if (!player) {
    return { videoId, title: 'YouTube video', durationSeconds: 0, captions: null, audio: null, blockedReason: 'YouTube did not return a playable page. Datacenter IPs are often blocked.' };
  }

  const details = (player.videoDetails || {}) as { title?: string; lengthSeconds?: string };
  const title = (details.title || 'YouTube video').slice(0, 80);
  const durationSeconds = Number(details.lengthSeconds) || 0;
  const status = (player.playabilityStatus || {}) as { status?: string; reason?: string };
  if (status.status && status.status !== 'OK') {
    return { videoId, title, durationSeconds, captions: null, audio: null, blockedReason: status.reason || `YouTube says this video is ${status.status}.` };
  }

  const captionsRoot = player.captions as { playerCaptionsTracklistRenderer?: { captionTracks?: { baseUrl?: string; languageCode?: string }[] } } | undefined;
  const tracks = captionsRoot?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const track = tracks.find((item) => item.languageCode === 'en') || tracks[0];
  let captions: YoutubeTranscript | null = null;
  if (track?.baseUrl) {
    try {
      const capRes = await fetch(`${track.baseUrl}&fmt=json3`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15_000),
      });
      if (capRes.ok) {
        const payload = (await capRes.json()) as { events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }[] };
        const segments: Segment[] = [];
        for (const event of payload.events || []) {
          const text = decodeText((event.segs || []).map((seg) => seg.utf8 || '').join(''));
          if (!text || text === '\n') continue;
          const start = (Number(event.tStartMs) || 0) / 1000;
          const end = start + (Number(event.dDurationMs) || 0) / 1000;
          segments.push({ start, end, text, speaker: '' });
        }
        const text = segments.map((segment) => segment.text).join(' ').trim();
        if (text) {
          captions = { videoId, title, durationSeconds, segments: segments.slice(0, 800), text, via: 'captions' };
        }
      }
    } catch {
      captions = null;
    }
  }

  const streaming = player.streamingData as { adaptiveFormats?: { mimeType?: string; url?: string; contentLength?: string; bitrate?: number }[] } | undefined;
  const audioFormats = (streaming?.adaptiveFormats || [])
    .filter((format) => (format.mimeType || '').startsWith('audio/') && format.url)
    .sort((a, b) => (Number(a.bitrate) || 0) - (Number(b.bitrate) || 0));
  const audio = audioFormats[0]?.url
    ? { url: audioFormats[0].url, mime: (audioFormats[0].mimeType || 'audio/mp4').split(';')[0] }
    : null;

  return { videoId, title, durationSeconds, captions, audio, blockedReason: captions || audio ? '' : 'This video has no captions, and YouTube did not offer a downloadable audio stream.' };
}

export async function downloadYoutubeAudio(audio: { url: string; mime: string }): Promise<Buffer | null> {
  try {
    const res = await fetch(audio.url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const length = Number(res.headers.get('content-length') || 0);
    if (length > 24 * 1024 * 1024) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1000 || buffer.length > 24 * 1024 * 1024) return null;
    return buffer;
  } catch {
    return null;
  }
}
