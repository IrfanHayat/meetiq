import AsyncStorage from '@react-native-async-storage/async-storage';

export const keys = {
  deviceId: 'meetiq_device_id',
  token: 'meetiq_token',
  user: 'meetiq_user',
  notes: 'meetiq_notes',
  folders: 'meetiq_folders',
  audio: 'meetiq_audio_map',
  onboarded: 'meetiq_onboarded',
  launches: 'meetiq_launch_count',
  interstitialAt: 'meetiq_interstitial_at',
};

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence is best-effort. The screen still works without it.
  }
}

export async function readString(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function writeString(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Ignore storage failures so startup never crashes.
  }
}
