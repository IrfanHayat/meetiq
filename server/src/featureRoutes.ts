import { Express, NextFunction, Request, Response } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { answerMemory, dateWindow, generateEmail, generateMindMap, keywords, meetingInsights } from './aiExtras';
import { deepgramKey, grantDeepgramToken } from './deepgram';
import { clampText, HttpError } from './http';
import { summarizeTranscript } from './groq';
import { GeneralMessage, Note, Segment, UserDoc } from './models';
import { transcribeBest } from './speech';
import { assertCanSpend, assertDaily, chargeMinutes } from './usage';
import { downloadYoutubeAudio, fetchSupadataTranscript, loadYoutube } from './youtube';

type Authed = Request & { user: UserDoc };

interface Deps {
  requireUser: (req: Request, res: Response, next: NextFunction) => void;
  upload: multer.Multer;
  asyncRoute: (handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => void;
  presentNote: (note: InstanceType<typeof Note>, detail?: boolean) => unknown;
  validId: (id: string) => boolean;
}

function cleanSegments(value: unknown): Segment[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 800)
    .map((item) => {
      const row = item as { start?: number; end?: number; text?: string; speaker?: string };
      const text = String(row.text || '').trim().slice(0, 500);
      return {
        start: Math.max(0, Number(row.start) || 0),
        end: Math.max(0, Number(row.end) || 0),
        text,
        speaker: String(row.speaker ?? '').slice(0, 12),
      };
    })
    .filter((segment) => segment.text);
}

async function folderFor(userId: mongoose.Types.ObjectId, raw: unknown): Promise<mongoose.Types.ObjectId | null> {
  const id = clampText(raw, 40);
  if (!id || !mongoose.isValidObjectId(id)) return null;
  const folder = await (await import('./models')).Folder.findOne({ _id: id, userId });
  return folder ? folder._id : null;
}

export function registerFeatureRoutes(app: Express, deps: Deps): void {
  const { requireUser, upload, asyncRoute, presentNote, validId } = deps;

  app.post('/api/deepgram/grant', requireUser, asyncRoute(async (_req, res) => {
    if (!deepgramKey()) {
      res.status(503).json({
        error: 'DEEPGRAM_API_KEY is not set. Live audio still transcribes with the backup speech engine.',
        code: 'DEEPGRAM_NOT_CONFIGURED',
      });
      return;
    }
    try {
      const grant = await grantDeepgramToken(60);
      res.json({ accessToken: grant.accessToken, expiresIn: grant.expiresIn });
    } catch {
      res.status(503).json({
        error: 'Deepgram did not issue a token. Transcription will use the backup speech engine.',
        code: 'DEEPGRAM_GRANT',
      });
    }
  }));

  app.post('/api/live/chunk', requireUser, (req, res, next) => {
    upload.single('audio')(req, res, (err) => (err ? next(err) : next()));
  }, asyncRoute(async (req, res) => {
    const user = (req as Authed).user;
    const file = req.file;
    if (!file?.buffer?.length) throw new HttpError(400, 'Send a short audio chunk.', 'AUDIO_REQUIRED');
    if (file.buffer.length > 8 * 1024 * 1024) throw new HttpError(413, 'Live chunks must be under 8 MB.', 'FILE_TOO_LARGE');
    assertDaily(user, 'liveCount');
    const language = clampText(req.body?.language, 8) || user.language || 'en';
    const offset = Math.max(0, Number(req.body?.offsetSeconds) || 0);
    const result = await transcribeBest(file.buffer, 'chunk.m4a', file.mimetype || 'audio/mp4', language);
    const segments = result.segments.map((segment) => ({
      ...segment,
      start: segment.start + offset,
      end: segment.end + offset,
    }));
    await user.save();
    res.json({
      text: result.text,
      segments,
      durationSeconds: result.durationSeconds,
      provider: result.provider,
    });
  }));

  app.post('/api/notes/live', requireUser, asyncRoute(async (req, res) => {
    const user = (req as Authed).user;
    const segments = cleanSegments(req.body?.segments);
    const transcript = segments.map((segment) => segment.text).join(' ').trim();
    if (!transcript) throw new HttpError(422, 'No speech was captured in that recording.', 'NO_SPEECH');
    const durationSeconds = Math.max(1, Number(req.body?.durationSeconds) || segments[segments.length - 1]?.end || 1);
    assertCanSpend(user, durationSeconds);
    const language = clampText(req.body?.language, 8) || user.language || 'en';
    const summary = await summarizeTranscript(transcript, language);
    const note = await Note.create({
      userId: user._id,
      folderId: await folderFor(user._id, req.body?.folderId),
      title: clampText(req.body?.title, 80) || summary.title || 'Live recording',
      transcript,
      segments,
      summary: summary.summary,
      keyPoints: summary.keyPoints,
      actionItems: summary.actionItems,
      decisions: summary.decisions,
      messages: [],
      durationSeconds,
      language,
      source: 'live',
      speakerNames: {},
    });
    chargeMinutes(user, durationSeconds);
    await user.save();
    res.status(201).json({ note: presentNote(note, true), user: (await import('./usage')).presentUser(user) });
  }));

  app.post('/api/notes/youtube', requireUser, asyncRoute(async (req, res) => {
    const user = (req as Authed).user;
    assertDaily(user, 'youtubeCount');
    const rawUrl = clampText(req.body?.url, 300);
    const supa = await fetchSupadataTranscript(rawUrl, user.language || undefined);
    let segments: Segment[] = [];
    let transcript = '';
    let durationSeconds = 0;
    let via: 'captions' | 'audio' | 'supadata' | '' = '';
    let title = 'YouTube video';
    let videoId = '';
    if (supa.ok) {
      segments = supa.transcript.segments;
      transcript = supa.transcript.text;
      durationSeconds = supa.transcript.durationSeconds;
      via = 'supadata';
      title = supa.transcript.title;
      videoId = supa.transcript.videoId;
    } else {
      const loaded = await loadYoutube(rawUrl);
      videoId = loaded.videoId;
      title = loaded.title;
      durationSeconds = loaded.durationSeconds;
      if (loaded.captions) {
        segments = loaded.captions.segments;
        transcript = loaded.captions.text;
        durationSeconds = loaded.captions.durationSeconds || durationSeconds;
        via = 'captions';
      } else if (loaded.audio) {
        const audio = await downloadYoutubeAudio(loaded.audio);
        if (audio) {
          const stt = await transcribeBest(audio, 'youtube.m4a', loaded.audio.mime || 'audio/mp4', user.language || 'en');
          segments = stt.segments;
          transcript = stt.text;
          durationSeconds = stt.durationSeconds || durationSeconds;
          via = 'audio';
          chargeMinutes(user, durationSeconds || 1);
        }
      }
      if (!transcript) {
        if (supa.reason === 'quota') {
          throw new HttpError(429, `Supadata transcript quota is used up. ${loaded.blockedReason || 'YouTube did not return a transcript either.'}`.trim(), 'YOUTUBE_QUOTA');
        }
        if (supa.reason === 'no-captions') {
          throw new HttpError(422, loaded.blockedReason || 'This video has no captions.', 'YOUTUBE_NO_CAPTIONS');
        }
        throw new HttpError(
          422,
          loaded.blockedReason || 'YouTube blocked this download from the server. Try another video, or import the audio file from your phone.',
          'YOUTUBE_BLOCKED',
        );
      }
    }
    const summary = await summarizeTranscript(transcript.slice(0, 24000), user.language || 'en');
    const note = await Note.create({
      userId: user._id,
      folderId: await folderFor(user._id, req.body?.folderId),
      title: summary.title || title,
      transcript,
      segments,
      summary: summary.summary,
      keyPoints: summary.keyPoints,
      actionItems: summary.actionItems,
      decisions: summary.decisions,
      messages: [],
      durationSeconds: durationSeconds || 1,
      language: user.language || 'en',
      source: 'youtube',
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      speakerNames: {},
    });
    if (via === 'captions' || via === 'supadata') chargeMinutes(user, 0.25);
    await user.save();
    res.status(201).json({ note: presentNote(note, true), via });
  }));

  app.patch('/api/notes/:id/speakers', requireUser, asyncRoute(async (req, res) => {
    const user = (req as Authed).user;
    if (!validId(req.params.id)) throw new HttpError(404, 'Note not found.', 'NOT_FOUND');
    const note = await Note.findOne({ _id: req.params.id, userId: user._id });
    if (!note) throw new HttpError(404, 'Note not found.', 'NOT_FOUND');
    const speaker = clampText(req.body?.speaker, 12);
    const name = clampText(req.body?.name, 40);
    if (!speaker || !name) throw new HttpError(400, 'Speaker id and name are required.', 'SPEAKER');
    const names = { ...((note.speakerNames || {}) as Record<string, string>), [speaker]: name };
    note.speakerNames = names;
    note.markModified('speakerNames');
    await note.save();
    res.json({ note: presentNote(note, true) });
  }));

  app.post('/api/notes/:id/email', requireUser, asyncRoute(async (req, res) => {
    const user = (req as Authed).user;
    if (!validId(req.params.id)) throw new HttpError(404, 'Note not found.', 'NOT_FOUND');
    const note = await Note.findOne({ _id: req.params.id, userId: user._id });
    if (!note) throw new HttpError(404, 'Note not found.', 'NOT_FOUND');
    assertDaily(user, 'emailCount');
    const email = await generateEmail(note);
    await user.save();
    res.json(email);
  }));

  app.post('/api/notes/:id/mindmap', requireUser, asyncRoute(async (req, res) => {
    const user = (req as Authed).user;
    if (!validId(req.params.id)) throw new HttpError(404, 'Note not found.', 'NOT_FOUND');
    const note = await Note.findOne({ _id: req.params.id, userId: user._id });
    if (!note) throw new HttpError(404, 'Note not found.', 'NOT_FOUND');
    if (note.mindMap && !req.body?.refresh) {
      res.json({ mindMap: note.mindMap, cached: true });
      return;
    }
    assertDaily(user, 'mindMapCount');
    const mindMap = await generateMindMap(note);
    note.mindMap = mindMap;
    note.markModified('mindMap');
    await note.save();
    await user.save();
    res.json({ mindMap, cached: false });
  }));

  app.get('/api/decisions', requireUser, asyncRoute(async (req, res) => {
    const user = (req as Authed).user;
    const notes = await Note.find({ userId: user._id, 'decisions.0': { $exists: true } }).sort({ createdAt: -1 }).limit(40);
    const decisions = notes.flatMap((note) => (note.decisions || []).map((item, index) => ({
      noteId: note.id,
      title: note.title,
      createdAt: note.createdAt,
      index,
      text: item.text,
      owner: item.owner,
      timestamp: item.timestamp,
    })));
    res.json({ decisions });
  }));

  app.get('/api/insights', requireUser, asyncRoute(async (req, res) => {
    const user = (req as Authed).user;
    assertDaily(user, 'insightCount');
    const notes = await Note.find({ userId: user._id }).sort({ createdAt: -1 }).limit(15);
    if (!notes.length) {
      res.json({ repeatedTopics: [], unresolvedQuestions: [], pendingDecisions: [], frequentIssues: [], meetings: 0 });
      return;
    }
    const digest = notes.map((note) => {
      const decisions = (note.decisions || []).map((item) => item.text).join('; ');
      return `${note.createdAt.toISOString().slice(0, 10)} ${note.title}\n${(note.summary || '').slice(0, 400)}\nDecisions: ${decisions}`;
    }).join('\n\n');
    const report = await meetingInsights(digest);
    await user.save();
    res.json({ ...report, meetings: notes.length });
  }));

  app.post('/api/memory', requireUser, asyncRoute(async (req, res) => {
    const user = (req as Authed).user;
    const question = clampText(req.body?.question, 500);
    if (!question) throw new HttpError(400, 'Ask something about your meetings.', 'QUESTION');
    assertDaily(user, 'memoryCount');
    const window = dateWindow(question);
    const words = keywords(question);
    const query: Record<string, unknown> = { userId: user._id };
    if (window) query.createdAt = { $gte: window.from, $lt: window.to };
    if (words.length) {
      query.$or = words.flatMap((word) => {
        const rx = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        return [{ title: rx }, { summary: rx }, { transcript: rx }];
      });
    }
    let notes = await Note.find(query).sort({ createdAt: -1 }).limit(6);
    if (!notes.length) notes = await Note.find({ userId: user._id }).sort({ createdAt: -1 }).limit(4);
    const answer = await answerMemory(question, notes.map((note) => ({
      title: note.title,
      createdAt: note.createdAt,
      summary: note.summary || '',
      segments: note.segments || [],
      speakerNames: (note.speakerNames || {}) as Record<string, string>,
    })));
    await user.save();
    res.json({
      answer,
      meetings: notes.map((note) => ({ id: note.id, title: note.title, createdAt: note.createdAt })),
    });
  }));

  app.get('/api/chat', requireUser, asyncRoute(async (req, res) => {
    const user = (req as Authed).user;
    const messages = await GeneralMessage.find({ userId: user._id }).sort({ createdAt: -1 }).limit(30);
    res.json({ messages: messages.reverse() });
  }));

  app.post('/api/chat', requireUser, asyncRoute(async (req, res) => {
    const user = (req as Authed).user;
    const message = clampText(req.body?.message, 1500);
    if (!message) throw new HttpError(400, 'Type a message.', 'MESSAGE');
    assertDaily(user, 'generalCount');
    const history = await GeneralMessage.find({ userId: user._id }).sort({ createdAt: -1 }).limit(8);
    const { completeChat } = await import('./groq');
    const answer = await completeChat([
      { role: 'system', content: 'You are MeetIQ, a concise meeting assistant. This chat is not tied to one note. Keep answers under 120 words.' },
      ...history.reverse().map((item) => ({ role: item.role, content: item.content.slice(0, 800) })),
      { role: 'user', content: message },
    ], 500);
    const trimmed = answer.split(/\s+/).slice(0, 120).join(' ');
    await GeneralMessage.create({ userId: user._id, role: 'user', content: message });
    await GeneralMessage.create({ userId: user._id, role: 'assistant', content: trimmed });
    await user.save();
    const messages = await GeneralMessage.find({ userId: user._id }).sort({ createdAt: -1 }).limit(30);
    res.json({ reply: trimmed, messages: messages.reverse() });
  }));
}
