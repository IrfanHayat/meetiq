import { transcribeWithDeepgram, deepgramKey, SttResult } from './deepgram';
import { transcribeAudio } from './groq';

export async function transcribeBest(buffer: Buffer, filename: string, mime: string, language: string): Promise<SttResult> {
  if (deepgramKey()) {
    try {
      const deepgram = await transcribeWithDeepgram(buffer, mime, language);
      if (deepgram.text) return deepgram;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Deepgram transcription failed, using Groq Whisper:', message);
    }
  }

  const groq = await transcribeAudio(buffer, filename, mime, language);
  return {
    text: groq.text,
    durationSeconds: groq.durationSeconds,
    language: groq.language,
    segments: groq.segments.map((segment) => ({ ...segment, speaker: segment.speaker || '' })),
    provider: 'groq',
  };
}
