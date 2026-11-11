import * as Application from 'expo-application';
import { newId } from '../format';
import { keys, readString, writeString } from './storage';

export async function getDeviceId(): Promise<string> {
  const existing = await readString(keys.deviceId);
  if (existing && existing.length >= 6) return existing;

  let id = '';
  try {
    const androidId = Application.getAndroidId();
    if (androidId && androidId !== 'unknown' && androidId.length >= 6) id = androidId;
  } catch {
    id = '';
  }
  if (!id) id = newId();
  await writeString(keys.deviceId, id);
  return id;
}
