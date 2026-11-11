import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { ApiError, api, saveToken } from '../services/api';
import { initAds, showRewarded } from '../services/ads';
import { getDeviceId } from '../services/device';
import { initPurchases } from '../services/purchases';
import { keys, readJson, readString, writeJson, writeString } from '../services/storage';
import { Folder, NoteDetail, NoteSummary, User } from '../types';
import { newId } from '../format';

type AppContextValue = {
  ready: boolean;
  onboarded: boolean;
  offline: boolean;
  bootMessage: string;
  user: User | null;
  notes: NoteSummary[];
  folders: Folder[];
  unfiled: Folder | null;
  audioMap: Record<string, string>;
  task: string | null;
  deviceId: string;
  completeOnboarding: () => Promise<void>;
  retryConnection: () => Promise<void>;
  refresh: () => Promise<void>;
  applyUser: (user: User) => void;
  rememberAudio: (noteId: string, uri: string) => void;
  transcribe: (input: Parameters<typeof api.transcribe>[0]) => Promise<NoteDetail>;
  upsertNote: (note: NoteSummary) => void;
  removeNote: (id: string) => void;
  createFolder: (name: string, color: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  setLanguage: (code: string) => Promise<void>;
  setNotifications: (enabled: boolean) => Promise<void>;
  syncPremium: (body: { isPremium: boolean; expiresAt: string | null; productId: string }) => Promise<void>;
  unlockWithAd: () => Promise<boolean>;
};

const AppContext = createContext<AppContextValue | null>(null);

const emptyUnfiled: Folder = {
  id: null,
  name: 'Unfiled',
  color: '#5C566F',
  icon: 'unfiled',
  noteCount: 0,
  durationSeconds: 0,
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [bootMessage, setBootMessage] = useState('Setting up this device…');
  const [user, setUser] = useState<User | null>(null);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [unfiled, setUnfiled] = useState<Folder | null>(emptyUnfiled);
  const [audioMap, setAudioMap] = useState<Record<string, string>>({});
  const [task, setTask] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState('');

  const applyUser = useCallback((next: User) => {
    setUser(next);
    void writeJson(keys.user, next);
  }, []);

  const loadContent = useCallback(async () => {
    const [noteRes, folderRes] = await Promise.all([api.notes(), api.folders()]);
    setNotes(noteRes.notes);
    setFolders(folderRes.folders);
    setUnfiled(folderRes.unfiled);
    await writeJson(keys.notes, noteRes.notes);
    await writeJson(keys.folders, { folders: folderRes.folders, unfiled: folderRes.unfiled });
  }, []);

  const signInDevice = useCallback(async (id: string) => {
    const session = await api.signIn(id);
    await saveToken(session.token);
    applyUser(session.user);
    setOffline(false);
    void initPurchases(id)
      .then(async (entitlement) => {
        if (!entitlement) return;
        try {
          const synced = await api.syncEntitlement(entitlement);
          applyUser(synced.user);
        } catch {
          // Premium sync can wait until the server is awake.
        }
      })
      .catch(() => undefined);
    void initAds();
    await loadContent();
  }, [applyUser, loadContent]);

  const boot = useCallback(async () => {
    setBootMessage('Setting up this device…');
    const cachedUser = await readJson<User | null>(keys.user, null);
    const cachedNotes = await readJson<NoteSummary[]>(keys.notes, []);
    const cachedFolders = await readJson<{ folders: Folder[]; unfiled: Folder | null }>(keys.folders, { folders: [], unfiled: emptyUnfiled });
    const cachedAudio = await readJson<Record<string, string>>(keys.audio, {});
    const seen = await readString(keys.onboarded);
    const launches = Number((await readString(keys.launches)) || '0');
    await writeString(keys.launches, String(launches + 1));
    if (cachedUser) setUser(cachedUser);
    setNotes(cachedNotes);
    setFolders(cachedFolders.folders);
    setUnfiled(cachedFolders.unfiled);
    setAudioMap(cachedAudio);
    setOnboarded(seen === '1');

    const id = await getDeviceId().catch(() => 'device-fallback');
    setDeviceId(id);
    try {
      await signInDevice(id);
      setOffline(false);
    } catch (err) {
      setOffline(true);
      setBootMessage(err instanceof ApiError ? err.message : 'Working offline');
    }
  }, [signInDevice]);

  useEffect(() => {
    let cancelled = false;
    const minSplash = new Promise((resolve) => setTimeout(resolve, 1100));
    boot()
      .catch((err) => {
        console.warn('Boot failed', err);
        setOffline(true);
        setBootMessage('MeetIQ opened offline. We’ll retry when you ask.');
      })
      .finally(async () => {
        await minSplash;
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [boot]);

  const retryConnection = useCallback(async () => {
    try {
      const id = deviceId || (await getDeviceId());
      setDeviceId(id);
      await signInDevice(id);
    } catch (err) {
      setOffline(true);
      const message = err instanceof ApiError ? err.message : 'Still can’t reach MeetIQ.';
      Alert.alert('Still waking up', message);
    }
  }, [deviceId, signInDevice]);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      applyUser(me.user);
      await loadContent();
      setOffline(false);
    } catch (err) {
      setOffline(true);
      if (!(err instanceof ApiError)) return;
    }
  }, [applyUser, loadContent]);

  const rememberAudio = useCallback((noteId: string, uri: string) => {
    setAudioMap((current) => {
      const next = { ...current, [noteId]: uri };
      void writeJson(keys.audio, next);
      return next;
    });
  }, []);

  const upsertNote = useCallback((note: NoteSummary) => {
    setNotes((current) => [note, ...current.filter((item) => item.id !== note.id)]);
  }, []);

  const removeNote = useCallback((id: string) => {
    setNotes((current) => current.filter((item) => item.id !== id));
  }, []);

  const transcribe = useCallback(async (input: Parameters<typeof api.transcribe>[0]) => {
    setTask(input.source === 'import' ? 'Importing and transcribing…' : 'Transcribing your note…');
    try {
      const result = await api.transcribe(input);
      applyUser(result.user);
      upsertNote(result.note);
      if (input.uri) rememberAudio(result.note.id, input.uri);
      setOffline(false);
      return result.note;
    } finally {
      setTask(null);
    }
  }, [applyUser, rememberAudio, upsertNote]);

  const createFolder = useCallback(async (name: string, color: string) => {
    const result = await api.createFolder(name, color);
    setFolders((current) => [...current, { ...result.folder, noteCount: 0, durationSeconds: 0 }]);
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    await api.deleteFolder(id);
    setFolders((current) => current.filter((folder) => folder.id !== id));
    await loadContent().catch(() => undefined);
  }, [loadContent]);

  const setLanguage = useCallback(async (code: string) => {
    const result = await api.updateMe({ language: code });
    applyUser(result.user);
  }, [applyUser]);

  const setNotifications = useCallback(async (enabled: boolean) => {
    const result = await api.updateMe({ notificationsEnabled: enabled });
    applyUser(result.user);
  }, [applyUser]);

  const syncPremium = useCallback(async (body: { isPremium: boolean; expiresAt: string | null; productId: string }) => {
    const result = await api.syncEntitlement(body);
    applyUser(result.user);
  }, [applyUser]);

  const completeOnboarding = useCallback(async () => {
    await writeString(keys.onboarded, '1');
    setOnboarded(true);
  }, []);

  const unlockWithAd = useCallback(async () => {
    if (user?.isPremium) return false;
    const earned = await showRewarded();
    if (!earned) {
      Alert.alert('Ad unavailable', 'The reward ad didn’t finish. Please try again in a moment.');
      return false;
    }
    try {
      const result = await api.reward(newId());
      applyUser(result.user);
      Alert.alert('10 minutes added', 'You can keep transcribing on the free plan.');
      return true;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'The minutes couldn’t be added. Try again.';
      Alert.alert('Couldn’t add minutes', message);
      return false;
    }
  }, [applyUser, user?.isPremium]);

  const value = useMemo<AppContextValue>(() => ({
    ready,
    onboarded,
    offline,
    bootMessage,
    user,
    notes,
    folders,
    unfiled,
    audioMap,
    task,
    deviceId,
    completeOnboarding,
    retryConnection,
    refresh,
    applyUser,
    rememberAudio,
    transcribe,
    upsertNote,
    removeNote,
    createFolder,
    deleteFolder,
    setLanguage,
    setNotifications,
    syncPremium,
    unlockWithAd,
  }), [
    ready, onboarded, offline, bootMessage, user, notes, folders, unfiled, audioMap, task, deviceId,
    completeOnboarding, retryConnection, refresh, applyUser, rememberAudio, transcribe,
    upsertNote, removeNote, createFolder, deleteFolder, setLanguage, setNotifications, syncPremium, unlockWithAd,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
