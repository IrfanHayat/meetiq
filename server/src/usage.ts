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
