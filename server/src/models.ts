import mongoose, { HydratedDocument, Schema, Types } from 'mongoose';

export interface ActionItem {
  text: string;
  owner: string;
  due: string;
  done: boolean;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export interface IUser {
  deviceId: string;
  isPremium: boolean;
  premiumExpiresAt: Date | null;
  premiumProductId: string;
  language: string;
  notificationsEnabled: boolean;
  usageMinutesTotal: number;
  usageMinutesPeriod: number;
  usagePeriodKey: string;
  bonusMinutes: number;
  importCount: number;
  rewardIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IFolder {
  userId: Types.ObjectId;
  name: string;
  color: string;
  icon: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface INote {
  userId: Types.ObjectId;
  folderId: Types.ObjectId | null;
  title: string;
  transcript: string;
  segments: Segment[];
  summary: string;
  keyPoints: string[];
  actionItems: ActionItem[];
  messages: ChatMessage[];
  durationSeconds: number;
  language: string;
  source: 'recording' | 'import';
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    isPremium: { type: Boolean, default: false },
    premiumExpiresAt: { type: Date, default: null },
    premiumProductId: { type: String, default: '' },
    language: { type: String, default: 'en' },
    notificationsEnabled: { type: Boolean, default: true },
    usageMinutesTotal: { type: Number, default: 0 },
    usageMinutesPeriod: { type: Number, default: 0 },
    usagePeriodKey: { type: String, default: '' },
    bonusMinutes: { type: Number, default: 0 },
    importCount: { type: Number, default: 0 },
    rewardIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

const FolderSchema = new Schema<IFolder>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    color: { type: String, default: '#5B4DFF' },
    icon: { type: String, default: 'folder' },
  },
  { timestamps: true },
);

const NoteSchema = new Schema<INote>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    folderId: { type: Schema.Types.ObjectId, ref: 'Folder', default: null },
    title: { type: String, required: true },
    transcript: { type: String, default: '' },
    segments: {
      type: [
        new Schema<Segment>(
          {
            start: Number,
            end: Number,
            text: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    summary: { type: String, default: '' },
    keyPoints: { type: [String], default: [] },
    actionItems: {
      type: [
        new Schema<ActionItem>(
          {
            text: { type: String, default: '' },
            owner: { type: String, default: '' },
            due: { type: String, default: '' },
            done: { type: Boolean, default: false },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    messages: {
      type: [
        new Schema<ChatMessage>(
          {
            role: { type: String, enum: ['user', 'assistant'], required: true },
            content: { type: String, required: true },
            createdAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    durationSeconds: { type: Number, default: 0 },
    language: { type: String, default: 'en' },
    source: { type: String, enum: ['recording', 'import'], default: 'recording' },
  },
  { timestamps: true },
);

NoteSchema.index({ userId: 1, createdAt: -1 });

export type UserDoc = HydratedDocument<IUser>;
export type FolderDoc = HydratedDocument<IFolder>;
export type NoteDoc = HydratedDocument<INote>;

export const User = mongoose.model<IUser>('User', UserSchema);
export const Folder = mongoose.model<IFolder>('Folder', FolderSchema);
export const Note = mongoose.model<INote>('Note', NoteSchema);

export const DEFAULT_FOLDERS: { name: string; color: string; icon: string }[] = [
  { name: 'Meetings', color: '#5B4DFF', icon: 'meetings' },
  { name: 'Lectures', color: '#D99212', icon: 'lectures' },
  { name: 'Interviews', color: '#0E9F6E', icon: 'interviews' },
  { name: 'Ideas', color: '#E24747', icon: 'ideas' },
];
