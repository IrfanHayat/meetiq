import Constants from 'expo-constants';
import { mimeForName } from '../format';
import { Folder, NoteDetail, NoteSummary, User } from '../types';
import { keys, readString, writeString } from './storage';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function apiBase(): string {
  const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
  const url = extra?.apiUrl?.trim() || 'https://meetiq-api.onrender.com';
  return url.replace(/\/$/, '');
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await readString(keys.token);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(await authHeader()),
      ...((options.headers as Record<string, string>) || {}),
    };
    const response = await fetch(`${apiBase()}${path}`, { ...options, headers, signal: controller.signal });
    const text = await response.text();
    let data: { error?: string; code?: string } = {};
    if (text) {
      try {
        data = JSON.parse(text) as { error?: string; code?: string };
      } catch {
        data = { error: 'MeetIQ sent an unexpected response.' };
      }
    }
    if (!response.ok) {
      throw new ApiError(response.status, data.error || 'Something went wrong. Please try again.', data.code);
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const name = err instanceof Error ? err.name : '';
    if (name === 'AbortError') {
      throw new ApiError(0, 'This is taking longer than expected. The server may be waking up — try again.', 'TIMEOUT');
    }
    throw new ApiError(0, 'Can’t reach MeetIQ right now. Check your connection and try again.', 'OFFLINE');
  } finally {
    clearTimeout(timer);
  }
}

export async function saveToken(token: string): Promise<void> {
  await writeString(keys.token, token);
}

export const api = {
  signIn(deviceId: string) {
    return request<{ token: string; user: User }>('/api/auth/device', {
      method: 'POST',
      body: JSON.stringify({ deviceId }),
    }, 12000);
  },
  me() {
    return request<{ user: User }>('/api/me');
  },
  updateMe(body: { language?: string; notificationsEnabled?: boolean }) {
    return request<{ user: User }>('/api/me', { method: 'PATCH', body: JSON.stringify(body) });
  },
  folders() {
    return request<{ folders: Folder[]; unfiled: Folder }>('/api/folders');
  },
  createFolder(name: string, color: string) {
    return request<{ folder: Folder }>('/api/folders', {
      method: 'POST',
      body: JSON.stringify({ name, color, icon: 'folder' }),
    });
  },
  deleteFolder(id: string) {
    return request<{ ok: boolean }>(`/api/folders/${id}`, { method: 'DELETE' });
  },
  notes(query?: { q?: string; folderId?: string | null }) {
    const params = new URLSearchParams();
    if (query?.q) params.set('q', query.q);
    if (query?.folderId) params.set('folderId', query.folderId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return request<{ notes: NoteSummary[] }>(`/api/notes${suffix}`);
  },
  note(id: string) {
    return request<{ note: NoteDetail }>(`/api/notes/${id}`);
  },
  updateNote(id: string, body: { title?: string; folderId?: string | null }) {
    return request<{ note: NoteDetail }>(`/api/notes/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  toggleAction(id: string, index: number, done: boolean) {
    return request<{ note: NoteDetail }>(`/api/notes/${id}/action-items/${index}`, {
      method: 'PATCH',
      body: JSON.stringify({ done }),
    });
  },
  deleteNote(id: string) {
    return request<{ ok: boolean }>(`/api/notes/${id}`, { method: 'DELETE' });
  },
  chat(id: string, message: string) {
    return request<{ reply: string; messages: NoteDetail['messages'] }>(`/api/notes/${id}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }, 45000);
  },
  reward(rewardId: string) {
    return request<{ user: User; granted: boolean }>('/api/usage/reward', {
      method: 'POST',
      body: JSON.stringify({ rewardId }),
    });
  },
  syncEntitlement(body: { isPremium: boolean; expiresAt: string | null; productId: string }) {
    return request<{ user: User }>('/api/revenuecat/sync', { method: 'POST', body: JSON.stringify(body) });
  },
  async transcribe(input: {
    uri: string;
    name: string;
    mime?: string;
    folderId?: string | null;
    language?: string;
    durationSeconds?: number;
    source: 'recording' | 'import';
    title?: string;
  }) {
    const form = new FormData();
    form.append('audio', {
      uri: input.uri,
      name: input.name || 'note.m4a',
      type: input.mime || mimeForName(input.name || 'note.m4a'),
    } as unknown as Blob);
    form.append('source', input.source);
    if (input.folderId) form.append('folderId', input.folderId);
    if (input.language) form.append('language', input.language);
    if (input.durationSeconds) form.append('durationSeconds', String(Math.round(input.durationSeconds)));
    if (input.title) form.append('title', input.title);
    return request<{ note: NoteDetail; user: User }>('/api/notes/transcribe', { method: 'POST', body: form }, 120000);
  },
  liveChunk(input: { uri: string; offsetSeconds: number; language?: string }) {
    const form = new FormData();
    form.append('audio', { uri: input.uri, name: 'chunk.m4a', type: 'audio/mp4' } as unknown as Blob);
    form.append('offsetSeconds', String(input.offsetSeconds));
    if (input.language) form.append('language', input.language);
    return request<{ text: string; segments: import('../types').Segment[]; durationSeconds: number; provider: 'deepgram' | 'groq' }>('/api/live/chunk', { method: 'POST', body: form }, 45000);
  },
  finishLive(body: { segments: import('../types').Segment[]; durationSeconds: number; folderId?: string | null; language?: string }) {
    return request<{ note: NoteDetail; user: User }>('/api/notes/live', { method: 'POST', body: JSON.stringify(body) }, 60000);
  },
  youtube(url: string, folderId?: string | null) {
    return request<{ note: NoteDetail; via: string }>('/api/notes/youtube', { method: 'POST', body: JSON.stringify({ url, folderId }) }, 90000);
  },
  renameSpeaker(id: string, speaker: string, name: string) {
    return request<{ note: NoteDetail }>(`/api/notes/${id}/speakers`, { method: 'PATCH', body: JSON.stringify({ speaker, name }) });
  },
  email(id: string) {
    return request<{ subject: string; body: string }>(`/api/notes/${id}/email`, { method: 'POST', body: '{}' }, 45000);
  },
  mindMap(id: string) {
    return request<{ mindMap: import('../types').MindMap }>(`/api/notes/${id}/mindmap`, { method: 'POST', body: '{}' }, 45000);
  },
  decisions() {
    return request<{ decisions: { noteId: string; title: string; createdAt: string; text: string; owner: string; timestamp: string }[] }>('/api/decisions');
  },
  insights() {
    return request<{ repeatedTopics: string[]; unresolvedQuestions: string[]; pendingDecisions: string[]; frequentIssues: string[]; meetings: number }>('/api/insights', {}, 45000);
  },
  memory(question: string) {
    return request<{ answer: string; meetings: { id: string; title: string; createdAt: string }[] }>('/api/memory', { method: 'POST', body: JSON.stringify({ question }) }, 45000);
  },
  generalHistory() {
    return request<{ messages: { role: 'user' | 'assistant'; content: string; createdAt: string }[] }>('/api/chat');
  },
  generalChat(message: string) {
    return request<{ reply: string; messages: { role: 'user' | 'assistant'; content: string; createdAt: string }[] }>('/api/chat', { method: 'POST', body: JSON.stringify({ message }) }, 45000);
  },
};
