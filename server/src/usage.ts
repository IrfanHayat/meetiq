import { HttpError, roundMinutes } from './http';
import { UserDoc } from './models';

export const FREE_MINUTES = 100;
export const PREMIUM_MINUTES_PER_MONTH = 1200;
export const FREE_IMPORT_LIMIT = 8;
export const REWARD_MINUTES = 10;

export interface UsageSnapshot {
  isPremium: boolean;
  usedMinutes: number;
  allowanceMinutes: number;
  remainingMinutes: number;
  period: 'month' | 'total';
  bonusMinutes: number;
  importsUsed: number;
  importLimit: number | null;
}

export function refreshUsageWindow(user: UserDoc, now = new Date()): boolean {
  let changed = false;
  if (user.isPremium && user.premiumExpiresAt && user.premiumExpiresAt.getTime() <= now.getTime()) {
    user.isPremium = false;
    changed = true;
  }
  if (user.isPremium) {
    const key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    if (user.usagePeriodKey !== key) {
      user.usagePeriodKey = key;
      user.usageMinutesPeriod = 0;
      changed = true;
    }
  }
  return changed;
}

export function usageSnapshot(user: UserDoc): UsageSnapshot {
  refreshUsageWindow(user);
  if (user.isPremium) {
    const used = user.usageMinutesPeriod || 0;
    return {
      isPremium: true,
      usedMinutes: roundMinutes(used),
      allowanceMinutes: PREMIUM_MINUTES_PER_MONTH,
      remainingMinutes: roundMinutes(Math.max(0, PREMIUM_MINUTES_PER_MONTH - used)),
      period: 'month',
      bonusMinutes: 0,
      importsUsed: user.importCount || 0,
      importLimit: null,
    };
  }
  const allowance = FREE_MINUTES + (user.bonusMinutes || 0);
  const used = user.usageMinutesTotal || 0;
  return {
    isPremium: false,
    usedMinutes: roundMinutes(used),
    allowanceMinutes: allowance,
    remainingMinutes: roundMinutes(Math.max(0, allowance - used)),
    period: 'total',
    bonusMinutes: user.bonusMinutes || 0,
    importsUsed: user.importCount || 0,
    importLimit: FREE_IMPORT_LIMIT,
  };
}

export function presentUser(user: UserDoc) {
  const usage = usageSnapshot(user);
  return {
    id: user.id,
    deviceId: user.deviceId,
    isPremium: usage.isPremium,
    language: user.language || 'en',
    notificationsEnabled: user.notificationsEnabled !== false,
    premiumExpiresAt: user.premiumExpiresAt,
    premiumProductId: user.premiumProductId || '',
    usage,
    limits: dailyLimits(user),
  };
}

export function assertCanSpend(user: UserDoc, estimatedSeconds?: number): UsageSnapshot {
  const usage = usageSnapshot(user);
  const estimatedMinutes = estimatedSeconds && estimatedSeconds > 0 ? estimatedSeconds / 60 : 0.25;
  if (usage.remainingMinutes + 0.02 < estimatedMinutes) {
    const left = Math.max(0, Math.floor(usage.remainingMinutes));
    throw new HttpError(
      402,
      left <= 0
        ? 'You are out of transcription minutes. Upgrade to Premium or watch an ad for 10 more minutes.'
        : `You have ${left} min left, which is not enough for this recording. Upgrade or watch an ad for 10 more minutes.`,
      'QUOTA',
    );
  }
  return usage;
}

export function chargeMinutes(user: UserDoc, durationSeconds: number): void {
  const minutes = Math.max(0.05, roundMinutes(durationSeconds / 60));
  if (user.isPremium) user.usageMinutesPeriod = roundMinutes((user.usageMinutesPeriod || 0) + minutes);
  else user.usageMinutesTotal = roundMinutes((user.usageMinutesTotal || 0) + minutes);
}

type DailyField = 'chatCount' | 'generalCount' | 'youtubeCount' | 'liveCount' | 'memoryCount' | 'insightCount' | 'emailCount' | 'mindMapCount';

const DAILY_LIMITS: Record<DailyField, { free: number; premium: number; label: string }> = {
  chatCount: { free: 20, premium: 200, label: 'note chat questions' },
  generalCount: { free: 15, premium: 150, label: 'general chat messages' },
  youtubeCount: { free: 2, premium: 20, label: 'YouTube imports' },
  liveCount: { free: 80, premium: 800, label: 'live transcript updates' },
  memoryCount: { free: 5, premium: 60, label: 'memory questions' },
  insightCount: { free: 3, premium: 30, label: 'insight refreshes' },
  emailCount: { free: 5, premium: 40, label: 'follow-up emails' },
  mindMapCount: { free: 3, premium: 40, label: 'mind maps' },
};

function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function rollDaily(user: UserDoc, now = new Date()): void {
  const key = dayKey(now);
  if (user.usageDayKey === key) return;
  user.usageDayKey = key;
  user.chatCount = 0;
  user.generalCount = 0;
  user.youtubeCount = 0;
  user.liveCount = 0;
  user.memoryCount = 0;
  user.insightCount = 0;
  user.emailCount = 0;
  user.mindMapCount = 0;
}

export function assertDaily(user: UserDoc, field: DailyField): void {
  refreshUsageWindow(user);
  rollDaily(user);
  const spec = DAILY_LIMITS[field];
  const limit = user.isPremium ? spec.premium : spec.free;
  const used = Number(user[field] || 0);
  if (used >= limit) {
    throw new HttpError(
      402,
      user.isPremium
        ? `You’ve used today’s ${spec.label} (${limit}). Try again tomorrow.`
        : `Free plan includes ${limit} ${spec.label} today. Upgrade to Premium for a higher limit.`,
      'DAILY_LIMIT',
    );
  }
  (user[field] as number) = used + 1;
}

export function dailyLimits(user: UserDoc) {
  refreshUsageWindow(user);
  rollDaily(user);
  const premium = Boolean(user.isPremium);
  const view = (field: DailyField) => {
    const spec = DAILY_LIMITS[field];
    const limit = premium ? spec.premium : spec.free;
    const used = Number(user[field] || 0);
    return { used, limit, remaining: Math.max(0, limit - used) };
  };
  return {
    chat: view('chatCount'),
    general: view('generalCount'),
    youtube: view('youtubeCount'),
    live: view('liveCount'),
    memory: view('memoryCount'),
    insights: view('insightCount'),
    email: view('emailCount'),
    mindMap: view('mindMapCount'),
  };
}
