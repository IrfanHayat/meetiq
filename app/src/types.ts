export interface Usage {
  isPremium: boolean;
  usedMinutes: number;
  allowanceMinutes: number;
  remainingMinutes: number;
  period: 'month' | 'total';
  bonusMinutes: number;
  importsUsed: number;
  importLimit: number | null;
}

export interface User {
  id: string;
  deviceId: string;
  isPremium: boolean;
  language: string;
  notificationsEnabled: boolean;
  premiumExpiresAt: string | null;
  premiumProductId: string;
  usage: Usage;
}

export interface Folder {
  id: string | null;
  name: string;
  color: string;
  icon: string;
  noteCount: number;
  durationSeconds: number;
}

export interface NoteSummary {
  id: string;
  title: string;
  preview: string;
  folderId: string | null;
  durationSeconds: number;
  language: string;
  source: 'recording' | 'import';
  createdAt: string;
  updatedAt: string;
}

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
  createdAt: string;
}

export interface NoteDetail extends NoteSummary {
  transcript: string;
  segments: Segment[];
  summary: string;
  keyPoints: string[];
  actionItems: ActionItem[];
  messages: ChatMessage[];
}

export type RootStackParamList = {
  Onboarding: undefined;
  Home: { folderId?: string | null } | undefined;
  Record: { folderId?: string | null } | undefined;
  Note: { id: string; tab?: 'transcript' | 'summary' | 'chat' };
  Folders: undefined;
  Paywall: undefined;
  Settings: undefined;
  Language: undefined;
  Privacy: undefined;
  Help: undefined;
};
