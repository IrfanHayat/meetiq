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
  speaker?: string;
}

export interface Decision {
  text: string;
  owner: string;
  timestamp: string;
}

export interface MindNode {
  id: string;
  label: string;
  kind: 'topic' | 'decision' | 'idea';
}

export interface MindEdge {
  from: string;
  to: string;
  label: string;
}

export interface MindMap {
  nodes: MindNode[];
  edges: MindEdge[];
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
  usageDayKey: string;
  chatCount: number;
  generalCount: number;
  youtubeCount: number;
  liveCount: number;
  memoryCount: number;
  insightCount: number;
  emailCount: number;
  mindMapCount: number;
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
  source: 'recording' | 'import' | 'youtube' | 'live';
  youtubeUrl: string;
  speakerNames: Record<string, string>;
  decisions: Decision[];
  mindMap: MindMap | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGeneralMessage {
  userId: Types.ObjectId;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
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
    usageDayKey: { type: String, default: '' },
    chatCount: { type: Number, default: 0 },
    generalCount: { type: Number, default: 0 },
    youtubeCount: { type: Number, default: 0 },
    liveCount: { type: Number, default: 0 },
    memoryCount: { type: Number, default: 0 },
    insightCount: { type: Number, default: 0 },
    emailCount: { type: Number, default: 0 },
    mindMapCount: { type: Number, default: 0 },
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
            speaker: { type: String, default: '' },
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
    source: { type: String, enum: ['recording', 'import', 'youtube', 'live'], default: 'recording' },
    youtubeUrl: { type: String, default: '' },
    speakerNames: { type: Schema.Types.Mixed, default: {} },
    decisions: {
      type: [
        new Schema<Decision>(
          {
            text: { type: String, default: '' },
            owner: { type: String, default: '' },
            timestamp: { type: String, default: '' },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    mindMap: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

const GeneralMessageSchema = new Schema<IGeneralMessage>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

NoteSchema.index({ userId: 1, createdAt: -1 });

export type UserDoc = HydratedDocument<IUser>;
export type FolderDoc = HydratedDocument<IFolder>;
export type NoteDoc = HydratedDocument<INote>;

export const User = mongoose.model<IUser>('User', UserSchema);
export const Folder = mongoose.model<IFolder>('Folder', FolderSchema);
export const Note = mongoose.model<INote>('Note', NoteSchema);
export const GeneralMessage = mongoose.model<IGeneralMessage>('GeneralMessage', GeneralMessageSchema);

export const DEFAULT_FOLDERS: { name: string; color: string; icon: string }[] = [
  { name: 'Meetings', color: '#5B4DFF', icon: 'meetings' },
  { name: 'Lectures', color: '#D99212', icon: 'lectures' },
  { name: 'Interviews', color: '#0E9F6E', icon: 'interviews' },
  { name: 'Ideas', color: '#E24747', icon: 'ideas' },
];
