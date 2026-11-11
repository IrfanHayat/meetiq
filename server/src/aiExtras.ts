import { HttpError } from './http';
import { MindMap, NoteDoc, Segment } from './models';
import { completeChat, speakerLabel, timedTranscript } from './groq';

function parseJson(text: string): Record<string, unknown> | null {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function noteContext(note: NoteDoc): string {
  const names = (note.speakerNames || {}) as Record<string, string>;
  const timed = timedTranscript(note.segments || [], names, note.transcript || '').slice(0, 12_000);
  const decisions = (note.decisions || []).map((item) => `- ${item.text}`).join('\n');
  return `Title: ${note.title}\nDate: ${note.createdAt?.toISOString?.() || ''}\nSummary: ${note.summary || ''}\nDecisions:\n${decisions}\n\nTranscript:\n${timed}`;
}

export function speakerStats(segments: Segment[], names: Record<string, string>) {
  const buckets = new Map<string, { seconds: number; from: number; to: number }>();
  let total = 0;
  const timeline = segments
    .filter((segment) => segment.text)
    .map((segment) => {
      const speaker = segment.speaker || '';
      const seconds = Math.max(0, (Number(segment.end) || 0) - (Number(segment.start) || 0));
      total += seconds;
      if (speaker) {
        const current = buckets.get(speaker) || { seconds: 0, from: segment.start, to: segment.end };
        current.seconds += seconds;
        current.from = Math.min(current.from, segment.start);
        current.to = Math.max(current.to, segment.end);
        buckets.set(speaker, current);
      }
      return {
        speaker,
        name: speakerLabel(speaker, names) || 'Speaker',
        start: segment.start,
        end: segment.end,
        text: segment.text,
      };
    });

  const speakers = [...buckets.entries()]
    .map(([id, value]) => ({
      id,
      name: speakerLabel(id, names),
      seconds: Math.round(value.seconds * 10) / 10,
      percent: total > 0 ? Math.round((value.seconds / total) * 100) : 0,
    }))
    .sort((a, b) => b.seconds - a.seconds);

  return { speakers, totalSeconds: Math.round(total * 10) / 10, timeline: timeline.slice(0, 400) };
}

export async function generateEmail(note: NoteDoc): Promise<{ subject: string; body: string }> {
  const text = await completeChat(
    [
      {
        role: 'system',
        content:
          'Write a professional follow-up email from a meeting. Reply with JSON only: {"subject":"","body":""}. Use only facts from the notes. Keep the body under 180 words. Plain text, no markdown.',
      },
      { role: 'user', content: noteContext(note).slice(0, 10_000) },
    ],
    700,
  );
  const data = parseJson(text);
  const subject = typeof data?.subject === 'string' ? data.subject.trim().slice(0, 140) : `Follow-up: ${note.title}`;
  const body = typeof data?.body === 'string' ? data.body.trim().slice(0, 4000) : text.slice(0, 2000);
  if (!body) throw new HttpError(502, 'MeetIQ couldn’t draft that email. Please try again.', 'EMAIL');
  return { subject: subject || `Follow-up: ${note.title}`, body };
}

export async function generateMindMap(note: NoteDoc): Promise<MindMap> {
  const text = await completeChat(
    [
      {
        role: 'system',
        content:
          'Build a small mind map from this meeting. Reply with JSON only: {"nodes":[{"id":"t1","label":"short label","kind":"topic|decision|idea"}],"edges":[{"from":"t1","to":"d1","label":"leads to"}]}. Use 4 to 10 nodes. Kinds are only topic, decision, or idea. Labels under 6 words. Use only the notes.',
      },
      { role: 'user', content: noteContext(note).slice(0, 8_000) },
    ],
    700,
  );
  const data = parseJson(text);
  const nodes = Array.isArray(data?.nodes)
    ? data.nodes
        .map((item, index) => {
          if (!item || typeof item !== 'object') return null;
          const row = item as Record<string, unknown>;
          const label = typeof row.label === 'string' ? row.label.trim().slice(0, 80) : '';
          if (!label) return null;
          const kind = row.kind === 'decision' || row.kind === 'idea' ? row.kind : 'topic';
          const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim().slice(0, 12) : `n${index}`;
          return { id, label, kind: kind as 'topic' | 'decision' | 'idea' };
        })
        .filter((item): item is MindMap['nodes'][number] => Boolean(item))
        .slice(0, 12)
    : [];
  const ids = new Set(nodes.map((node) => node.id));
  const edges = Array.isArray(data?.edges)
    ? data.edges
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const row = item as Record<string, unknown>;
          const from = typeof row.from === 'string' ? row.from : '';
          const to = typeof row.to === 'string' ? row.to : '';
          if (!ids.has(from) || !ids.has(to) || from === to) return null;
          return { from, to, label: typeof row.label === 'string' ? row.label.trim().slice(0, 40) : '' };
        })
        .filter((item): item is MindMap['edges'][number] => Boolean(item))
        .slice(0, 16)
    : [];
  if (nodes.length < 2) throw new HttpError(502, 'MeetIQ couldn’t map this meeting yet. Please try again.', 'MINDMAP');
  return { nodes, edges };
}

export interface InsightReport {
  repeatedTopics: string[];
  unresolvedQuestions: string[];
  pendingDecisions: string[];
  frequentIssues: string[];
}

export async function meetingInsights(digest: string): Promise<InsightReport> {
  const text = await completeChat(
    [
      {
        role: 'system',
        content:
          'Compare these meetings. Reply with JSON only: {"repeatedTopics":[],"unresolvedQuestions":[],"pendingDecisions":[],"frequentIssues":[]}. Each array has at most 5 short strings. Use only the notes. If there is not enough material, return empty arrays.',
      },
      { role: 'user', content: digest.slice(0, 12_000) },
    ],
    700,
  );
  const data = parseJson(text);
  const list = (value: unknown) =>
    Array.isArray(value)
      ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean).slice(0, 5)
      : [];
  return {
    repeatedTopics: list(data?.repeatedTopics),
    unresolvedQuestions: list(data?.unresolvedQuestions),
    pendingDecisions: list(data?.pendingDecisions),
    frequentIssues: list(data?.frequentIssues),
  };
}

export function dateWindow(question: string, now = new Date()): { from: Date; to: Date } | null {
  const q = question.toLowerCase();
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (/\btoday\b/.test(q)) return { from: startOfDay(now), to: now };
  if (/\byesterday\b/.test(q)) {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 1);
    return { from, to: startOfDay(now) };
  }
  if (/last week/.test(q)) {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 7);
    return { from, to: now };
  }
  if (/last month/.test(q)) {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to };
  }
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const mentioned = weekdays.findIndex((day) => q.includes(day));
  if (mentioned >= 0) {
    const from = startOfDay(now);
    const delta = (from.getDay() - mentioned + 7) % 7 || 7;
    from.setDate(from.getDate() - delta);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }
  return null;
}

export async function answerMemory(question: string, notes: { title: string; createdAt: Date; summary: string; segments: Segment[]; speakerNames?: Record<string, string> }[]): Promise<string> {
  if (!notes.length) {
    return 'I couldn’t find a meeting that matches that question.';
  }
  const packed = notes
    .slice(0, 6)
    .map((note) => {
      const when = note.createdAt.toISOString().slice(0, 10);
      const excerpt = timedTranscript(note.segments || [], note.speakerNames, note.summary).slice(0, 1800);
      return `Meeting: ${note.title}\nDate: ${when}\n${excerpt}`;
    })
    .join('\n\n---\n\n');
  const answer = await completeChat(
    [
      {
        role: 'system',
        content:
          'Answer from these meetings only. Keep it under 100 words. Name the meeting and date. Cite a timestamp as [m:ss] when the excerpt has one. If it is not in the meetings, say you cannot find it. The user may write in any language; answer in the language of the question.',
      },
      { role: 'user', content: `Question: ${question.slice(0, 500)}\n\nMeetings:\n${packed}` },
    ],
    500,
  );
  const words = answer.split(/\s+/);
  return (words.length > 100 ? words.slice(0, 100).join(' ') : answer).slice(0, 1200);
}

export function keywords(question: string): string[] {
  const stop = new Set(['what', 'when', 'where', 'which', 'last', 'month', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'week', 'today', 'yesterday', 'about', 'from', 'that', 'this', 'with', 'have', 'been', 'were', 'was', 'the', 'and', 'for', 'kitna', 'kya', 'tha', 'thi', 'mein', 'ne']);
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stop.has(word))
    .slice(0, 6);
}
