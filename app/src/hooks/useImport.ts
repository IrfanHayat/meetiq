import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';
import { mimeForName } from '../format';
import { showInterstitialIfAllowed } from '../services/ads';
import { alertForTranscribeError } from '../services/feedback';
import { useApp } from '../state/AppState';
import { RootStackParamList } from '../types';

type ImportNavigation = {
  navigate: <RouteName extends keyof RootStackParamList>(
    ...args: undefined extends RootStackParamList[RouteName]
      ? [screen: RouteName] | [screen: RouteName, params: RootStackParamList[RouteName]]
      : [screen: RouteName, params: RootStackParamList[RouteName]]
  ) => void;
};

export function useImport(navigation: ImportNavigation) {
  const { transcribe, user, unlockWithAd } = useApp();

  return async function importAudio(folderId?: string | null) {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/aac', 'audio/x-wav'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const name = asset.name || 'import.m4a';
      if (!/\.(mp3|m4a|wav|aac|mp4)$/i.test(name) && asset.mimeType && !asset.mimeType.startsWith('audio/')) {
        Alert.alert('Unsupported file', 'Import an MP3, M4A, WAV, or AAC file.');
        return;
      }
      if (asset.size && asset.size > 25 * 1024 * 1024) {
        Alert.alert('File too large', 'Audio files must be 25 MB or smaller.');
        return;
      }
      let durationSeconds: number | undefined;
      try {
        const probe = await Audio.Sound.createAsync({ uri: asset.uri }, { shouldPlay: false });
        if (probe.status.isLoaded && probe.status.durationMillis) durationSeconds = probe.status.durationMillis / 1000;
        await probe.sound.unloadAsync();
      } catch {
        durationSeconds = undefined;
      }
      const note = await transcribe({
        uri: asset.uri,
        name,
        mime: asset.mimeType || mimeForName(name),
        folderId: folderId || undefined,
        language: user?.language || 'en',
        durationSeconds,
        source: 'import',
      });
      await showInterstitialIfAllowed(Boolean(user?.isPremium));
      navigation.navigate('Note', { id: note.id, tab: 'summary' });
    } catch (err) {
      alertForTranscribeError(
        err,
        () => navigation.navigate('Paywall'),
        () => {
          void unlockWithAd();
        },
      );
    }
  };
}
