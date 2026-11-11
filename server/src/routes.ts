import { Express, NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import mongoose from 'mongoose';
import { dbReady } from './db';
import { clampText, HttpError } from './http';
import { answerFromTranscript, normalizeLanguage, summarizeTranscript, transcribeAudio } from './groq';
import { DEFAULT_FOLDERS, Folder, FolderDoc, Note, NoteDoc, User, UserDoc } from './models';
import { assertCanSpend, chargeMinutes, FREE_IMPORT_LIMIT, presentUser, REWARD_MINUTES, refreshUsageWindow, usageSnapshot } from './usage';

interface AuthedRequest extends Request {
  user: UserDoc;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname || '';
    const mime = file.mimetype || '';
    const allowed =
      /audio|video\/mp4|octet-stream|mp4|mpeg|wav|aac/.test(mime) ||
      /\.(m4a|mp3|wav|aac|mp4|caf|3gp)$/i.test(name);
    if (!allowed) {
      cb(new HttpError(415, 'Upload an MP3, M4A, WAV, or AAC audio file.'));
      return;
    }
    cb(null, true);
  },
});

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

function assertDb(): void {
  if (!dbReady()) {
    throw new HttpError(503, 'MeetIQ is waking up. Please try again in a moment.', 'DB_UNAVAILABLE');
  }
}

function requireUser(req: Request, _res: Response, next: NextFunction): void {
  try {
    assertDb();
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) {
      throw new HttpError(503, 'Sign-in is unavailable because JWT_SECRET is not configured.', 'JWT_SECRET_MISSING');
    }
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new HttpError(401, 'Sign in again to continue.', 'UNAUTHORIZED');
    const payload = jwt.verify(token, secret) as { sub?: string };
    if (!payload.sub) throw new HttpError(401, 'Sign in again to continue.', 'UNAUTHORIZED');
    User.findById(payload.sub)
      .then((user) => {
        if (!user) {
          next(new HttpError(401, 'This device session is no longer valid. Sign in again.', 'UNAUTHORIZED'));
          return;
        }
        (req as AuthedRequest).user = user;
        next();
      })
      .catch(next);
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      next(new HttpError(401, 'Sign in again to continue.', 'UNAUTHORIZED'));
      return;
    }
    next(err);
  }
}

function signToken(user: UserDoc): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new HttpError(503, 'Sign-in is unavailable because JWT_SECRET is not configured.', 'JWT_SECRET_MISSING');
  }
  return jwt.sign({ sub: user.id, deviceId: user.deviceId }, secret, { expiresIn: '180d' });
}

async function ensureDefaultFolders(userId: mongoose.Types.ObjectId): Promise<void> {
  const count = await Folder.countDocuments({ userId });
  if (count > 0) return;
  await Folder.insertMany(DEFAULT_FOLDERS.map((folder) => ({ ...folder, userId })));
}

function presentFolder(folder: FolderDoc, stats?: { notes: number; seconds: number }) {
  return {
    id: String(folder._id),
    name: folder.name,
    color: folder.color,
    icon: folder.icon,
    noteCount: stats?.notes ?? 0,
    durationSeconds: stats?.seconds ?? 0,
    createdAt: folder.createdAt,
  };
}

function presentNote(note: NoteDoc, detail = false) {
  const previewSource = (note.summary || note.transcript || '').replace(/\s+/g, ' ').trim();
  const base = {
    id: note.id,
    title: note.title,
    preview: previewSource.slice(0, 160),
    folderId: note.folderId ? String(note.folderId) : null,
    durationSeconds: note.durationSeconds || 0,
    language: note.language || 'en',
    source: note.source,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
  if (!detail) return base;
  return {
    ...base,
    transcript: note.transcript || '',
    segments: note.segments || [],
    summary: note.summary || '',
    keyPoints: note.keyPoints || [],
    actionItems: note.actionItems || [],
    messages: (note.messages || []).map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    })),
  };
}

function validId(id: string): boolean {
  return mongoose.isValidObjectId(id);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const GRANT_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'REFUND_REVERSED',
]);

const REVOKE_EVENTS = new Set(['EXPIRATION', 'SUBSCRIPTION_PAUSED']);

function premiumProduct(productId: string): boolean {
  const id = productId.toLowerCase();
  return id.includes('meetiq') || id.includes('premium') || id === '$rc_monthly' || id === '$rc_annual';
}

function applyEntitlement(user: UserDoc, isPremium: boolean, expiresAt: Date | null, productId: string): void {
  const stillActive = isPremium && (!expiresAt || expiresAt.getTime() > Date.now());
  user.isPremium = stillActive;
  user.premiumExpiresAt = expiresAt;
  if (productId) user.premiumProductId = productId.slice(0, 80);
  refreshUsageWindow(user);
}

export function registerRoutes(app: Express): void {
  app.post(
    '/api/auth/device',
    asyncRoute(async (req, res) => {
      assertDb();
      const deviceId = clampText(req.body?.deviceId, 128);
      if (deviceId.length < 6) throw new HttpError(400, 'A device id is required.', 'DEVICE_ID');

      let user = await User.findOne({ deviceId });
      if (!user) {
        user = await User.create({ deviceId });
        await ensureDefaultFolders(user._id);
      } else {
        await ensureDefaultFolders(user._id);
      }

      if (refreshUsageWindow(user)) await user.save();
      const token = signToken(user);
      res.json({ token, user: presentUser(user) });
    }),
  );

  app.get(
    '/api/me',
    requireUser,
    asyncRoute(async (req, res) => {
      const user = (req as AuthedRequest).user;
      if (refreshUsageWindow(user)) await user.save();
      res.json({ user: presentUser(user) });
    }),
  );

  app.patch(
    '/api/me',
    requireUser,
    asyncRoute(async (req, res) => {
      const user = (req as AuthedRequest).user;
      if (typeof req.body?.language === 'string') user.language = normalizeLanguage(req.body.language);
      if (typeof req.body?.notificationsEnabled === 'boolean') user.notificationsEnabled = req.body.notificationsEnabled;
      refreshUsageWindow(user);
      await user.save();
      res.json({ user: presentUser(user) });
    }),
  );

  app.post(
    '/api/usage/reward',
    requireUser,
    asyncRoute(async (req, res) => {
      const user = (req as AuthedRequest).user;
      const rewardId = clampText(req.body?.rewardId, 80);
      if (!rewardId) throw new HttpError(400, 'rewardId is required.', 'REWARD_ID');
      if (user.isPremium) {
        res.json({ user: presentUser(user), granted: false });
        return;
      }
      if (user.rewardIds?.includes(rewardId)) {
        res.json({ user: presentUser(user), granted: false, duplicate: true });
        return;
      }
      user.bonusMinutes = (user.bonusMinutes || 0) + REWARD_MINUTES;
      user.rewardIds = [...(user.rewardIds || []), rewardId].slice(-40);
      await user.save();
      res.json({ user: presentUser(user), granted: true, minutes: REWARD_MINUTES });
    }),
  );

  app.get(
    '/api/folders',
    requireUser,
    asyncRoute(async (req, res) => {
      const user = (req as AuthedRequest).user;
      const folders = await Folder.find({ userId: user._id }).sort({ createdAt: 1 });
      const stats = await Note.aggregate<{ _id: mongoose.Types.ObjectId | null; notes: number; seconds: number }>([
        { $match: { userId: user._id } },
        { $group: { _id: '$folderId', notes: { $sum: 1 }, seconds: { $sum: '$durationSeconds' } } },
      ]);
      const byId = new Map(stats.map((row) => [row._id ? String(row._id) : 'none', row]));
      const unfiled = byId.get('none');
      res.json({
        folders: folders.map((folder) => presentFolder(folder, byId.get(String(folder._id)))),
        unfiled: {
          id: null,
          name: 'Unfiled',
          color: '#5C566F',
          icon: 'unfiled',
          noteCount: unfiled?.notes ?? 0,
          durationSeconds: unfiled?.seconds ?? 0,
        },
      });
    }),
  );

  app.post(
    '/api/folders',
    requireUser,
    asyncRoute(async (req, res) => {
      const user = (req as AuthedRequest).user;
      const name = clampText(req.body?.name, 40);
      if (name.length < 1) throw new HttpError(400, 'Give the folder a name.', 'FOLDER_NAME');
      const color = clampText(req.body?.color, 20) || '#5B4DFF';
      const icon = clampText(req.body?.icon, 20) || 'folder';
      const folder = await Folder.create({ userId: user._id, name, color, icon });
      res.status(201).json({ folder: presentFolder(folder) });
    }),
  );

  app.patch(
    '/api/folders/:id',
    requireUser,
    asyncRoute(async (req, res) => {
      const user = (req as AuthedRequest).user;
      if (!validId(req.params.id)) throw new HttpError(404, 'Folder not found.', 'NOT_FOUND');
      const folder = await Folder.findOne({ _id: req.params.id, userId: user._id });
      if (!folder) throw new HttpError(404, 'Folder not found.', 'NOT_FOUND');
      const name = clampText(req.body?.name, 40);
      if (name) folder.name = name;
      const color = clampText(req.body?.color, 20);
      if (color) folder.color = color;
      await folder.save();
      res.json({ folder: presentFolder(folder) });
    }),
  );

  app.delete(
    '/api/folders/:id',
    requireUser,
    asyncRoute(async (req, res) => {
      const user = (req as AuthedRequest).user;
      if (!validId(req.params.id)) throw new HttpError(404, 'Folder not found.', 'NOT_FOUND');
      const folder = await Folder.findOne({ _id: req.params.id, userId: user._id });
      if (!folder) throw new HttpError(404, 'Folder not found.', 'NOT_FOUND');
      await Note.updateMany({ userId: user._id, folderId: folder._id }, { $set: { folderId: null } });
      await folder.deleteOne();
      res.json({ ok: true });
    }),
  );

  app.get(
    '/api/notes',
    requireUser,
    asyncRoute(async (req, res) => {
      const user = (req as AuthedRequest).user;
      const query: Record<string, unknown> = { userId: user._id };
      const folderId = typeof req.query.folderId === 'string' ? req.query.folderId : '';
      if (folderId === 'none') query.folderId = null;
      else if (folderId && validId(folderId)) query.folderId = folderId;
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
      if (q) {
        const rx = new RegExp(escapeRegex(q), 'i');
        query.$or = [{ title: rx }, { transcript: rx }, { summary: rx }];
      }
      const notes = await Note.find(query).sort({ createdAt: -1 }).limit(200);
      res.json({ notes: notes.map((note) => presentNote(note)) });
    }),
  );

  app.post(
    '/api/notes/transcribe',
    requireUser,
    (req, res, next) => {
      upload.single('audio')(req, res, (err) => {
        if (err) next(err);
        else next();
      });
    },
    asyncRoute(async (req, res) => {
      const user = (req as AuthedRequest).user;
      const file = req.file;
      if (!file || !file.buffer?.length) throw new HttpError(400, 'Choose an audio file to transcribe.', 'AUDIO_REQUIRED');

      const source = req.body?.source === 'import' ? 'import' : 'recording';
      const usage = usageSnapshot(user);
      if (source === 'import' && !usage.isPremium && usage.importsUsed >= FREE_IMPORT_LIMIT) {
        throw new HttpError(
          402,
          `Free includes ${FREE_IMPORT_LIMIT} audio imports. Upgrade to Premium for unlimited imports.`,
          'IMPORT_LIMIT',
        );
      }

      const clientDuration = Number(req.body?.durationSeconds);
      const estimated = Number.isFinite(clientDuration) && clientDuration > 0 ? clientDuration : undefined;
      assertCanSpend(user, estimated);

      let folderId: mongoose.Types.ObjectId | null = null;
      const rawFolder = clampText(req.body?.folderId, 40);
      if (rawFolder && validId(rawFolder)) {
        const folder = await Folder.findOne({ _id: rawFolder, userId: user._id });
        if (folder) folderId = folder._id;
      }

      const language = normalizeLanguage(req.body?.language || user.language || 'en');
      const filename = (file.originalname || 'audio.m4a').replace(/[^\w.\-]+/g, '_') || 'audio.m4a';
      const transcript = await transcribeAudio(file.buffer, filename, file.mimetype || 'audio/mp4', language);
      if (!transcript.text) {
        throw new HttpError(422, 'We couldn’t detect speech in that audio. Try again a little closer to the mic.', 'NO_SPEECH');
      }

      const summary = await summarizeTranscript(transcript.text, transcript.language || language);
      const durationSeconds = transcript.durationSeconds || (estimated ?? 0);
      const requestedTitle = clampText(req.body?.title, 80);
      const title = requestedTitle || summary.title || 'Voice note';

      const note = await Note.create({
        userId: user._id,
        folderId,
        title,
        transcript: transcript.text,
        segments: transcript.segments,
        summary: summary.summary,
        keyPoints: summary.keyPoints,
        actionItems: summary.actionItems,
        messages: [],
        durationSeconds: durationSeconds || 0,
        language: transcript.language || language,
        source,
      });

      chargeMinutes(user, durationSeconds || 1);
      if (source === 'import') user.importCount = (user.importCount || 0) + 1;
      await user.save();

      res.status(201).json({ note: presentNote(note, true), user: presentUser(user) });
    }),
  );

  app.get(
    '/api/notes/:id',
    requireUser,
    asyncRoute(async (req, res) => {
      const user = (req as AuthedRequest).user;
      if (!validId(req.params.id)) throw new HttpError(404, 'Note not found.', 'NOT_FOUND');
      const note = await Note.findOne({ _id: req.params.id, userId: user._id });
      if (!note) throw new HttpError(404, 'Note not found.', 'NOT_FOUND');
      res.json({ note: presentNote(note, true) });
    }),
  );

  app.patch(
    '/api/notes/:id',
    requireUser,
    asyncRoute(async (req, res) => {
      const user = (req as AuthedRequest).user;
      if (!validId(req.params.id)) throw new HttpError(404, 'Note not found.', 'NOT_FOUND');
      const note = await Note.findOne({ _id: req.params.id, userId: user._id });
      if (!note) throw new HttpError(404, 'Note not found.', 'NOT_FOUND');

      const title = clampText(req.body?.title, 80);
      if (title) note.title = title;

      if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'folderId')) {
        const raw = req.body.folderId;
        if (raw === null || raw === '' || raw === 'none') {
          note.folderId = null;
        } else if (typeof raw === 'string' && validId(raw)) {
          const folder = await Folder.findOne({ _id: raw, userId: user._id });
          if (!folder) throw new HttpError(404, 'Folder not found.', 'NOT_FOUND');
          note.folderId = folder._id;
        }
      }

      await note.save();
      res.json({ note: presentNote(note, true) });
    }),
  );

  app.patch(
    '/api/notes/:id/action-items/:index',
    requireUser,
    asyncRoute(async (req, res) => {
      const user = (req as AuthedRequest).user;
      if (!validId(req.params.id)) throw new HttpError(404, 'Note not found.', 'NOT_FOUND');
      const note = await Note.findOne({ _id: req.params.id, userId: user._id });
      if (!note) throw new HttpError(404, 'Note not found.', 'NOT_FOUND');
      const index = Number(req.params.index);
      if (!Number.isInteger(index) || index < 0 || index >= note.actionItems.length) {
        throw new HttpError(404, 'Action item not found.', 'NOT_FOUND');
      }
      note.actionItems[index].done = req.body?.done === undefined ? !note.actionItems[index].done : Boolean(req.body.done);
      note.markModified('actionItems');
      await note.save();
      res.json({ note: presentNote(note, true) });
    }),
  );

  app.delete(
    '/api/notes/:id',
    requireUser,
    asyncRoute(async (req, res) => {
      const user = (req as AuthedRequest).user;
      if (!validId(req.params.id)) throw new HttpError(404, 'Note not found.', 'NOT_FOUND');
      const deleted = await Note.findOneAndDelete({ _id: req.params.id, userId: user._id });
      if (!deleted) throw new HttpError(404, 'Note not found.', 'NOT_FOUND');
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/notes/:id/chat',
    requireUser,
    asyncRoute(async (req, res) => {
      const user = (req as AuthedRequest).user;
      if (!validId(req.params.id)) throw new HttpError(404, 'Note not found.', 'NOT_FOUND');
      const note = await Note.findOne({ _id: req.params.id, userId: user._id });
      if (!note) throw new HttpError(404, 'Note not found.', 'NOT_FOUND');
      const message = clampText(req.body?.message, 2000);
      if (!message) throw new HttpError(400, 'Type a question about this note.', 'MESSAGE');
      if (!note.transcript) throw new HttpError(409, 'This note has no transcript to chat with yet.', 'NO_TRANSCRIPT');

      const history = (note.messages || []).map((item) => ({ role: item.role, content: item.content }));
      const answer = await answerFromTranscript(note.transcript, note.title, history, message);
      const now = new Date();
      note.messages.push({ role: 'user', content: message, createdAt: now });
      note.messages.push({ role: 'assistant', content: answer, createdAt: new Date() });
      if (note.messages.length > 200) note.messages = note.messages.slice(-200);
      note.markModified('messages');
      await note.save();
      res.json({
        reply: answer,
        messages: note.messages.map((item) => ({ role: item.role, content: item.content, createdAt: item.createdAt })),
      });
    }),
  );

  app.post(
    '/api/revenuecat/sync',
    requireUser,
    asyncRoute(async (req, res) => {
      const user = (req as AuthedRequest).user;
      const expiresRaw = req.body?.expiresAt;
      const expiresAt = typeof expiresRaw === 'string' && expiresRaw ? new Date(expiresRaw) : null;
      const validExpiry = expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null;
      const productId = clampText(req.body?.productId, 80);
      applyEntitlement(user, Boolean(req.body?.isPremium), validExpiry, productId);
      await user.save();
      res.json({ user: presentUser(user) });
    }),
  );

  app.post(
    '/api/revenuecat/webhook',
    asyncRoute(async (req, res) => {
      const secret = process.env.REVENUECAT_WEBHOOK_SECRET?.trim();
      if (secret) {
        const header = req.get('authorization') || '';
        const token = header.replace(/^Bearer\s+/i, '').trim();
        if (token !== secret) throw new HttpError(401, 'Invalid webhook authorization.', 'WEBHOOK_AUTH');
      }

      assertDb();
      const event = (req.body?.event || req.body || {}) as Record<string, unknown>;
      const type = typeof event.type === 'string' ? event.type : '';
      const appUserId = clampText(event.app_user_id || event.original_app_user_id, 128);
      const productId = clampText(event.product_id, 80);
      const entitlementIds = Array.isArray(event.entitlement_ids)
        ? event.entitlement_ids.map((id) => String(id))
        : typeof event.entitlement_id === 'string'
          ? [event.entitlement_id]
          : [];
      const relevant = entitlementIds.includes('premium') || premiumProduct(productId) || entitlementIds.length === 0;
      if (!appUserId || !relevant) {
        res.json({ ok: true, ignored: true });
        return;
      }

      const expirationMs = Number(event.expiration_at_ms);
      const expiresAt = Number.isFinite(expirationMs) && expirationMs > 0 ? new Date(expirationMs) : null;
      let isPremium = false;
      if (GRANT_EVENTS.has(type)) isPremium = !expiresAt || expiresAt.getTime() > Date.now();
      else if (type === 'CANCELLATION') isPremium = Boolean(expiresAt && expiresAt.getTime() > Date.now());
      else if (REVOKE_EVENTS.has(type)) isPremium = false;
      else {
        res.json({ ok: true, ignored: true });
        return;
      }

      const user = await User.findOne({ deviceId: appUserId });
      if (!user) {
        res.json({ ok: true, matched: false });
        return;
      }
      applyEntitlement(user, isPremium, expiresAt, productId);
      await user.save();
      res.json({ ok: true, matched: true });
    }),
  );
}
