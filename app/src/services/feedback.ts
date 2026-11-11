import { Alert } from 'react-native';
import { ApiError } from './api';

export function explainError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function alertForTranscribeError(err: unknown, onUpgrade: () => void, onReward: () => void): void {
  const message = explainError(err, 'Transcription didn’t finish. Please try again.');
  const code = err instanceof ApiError ? err.code : undefined;
  if (code === 'QUOTA' || code === 'IMPORT_LIMIT') {
    Alert.alert(code === 'IMPORT_LIMIT' ? 'Import limit' : 'Out of minutes', message, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Watch ad', onPress: onReward },
      { text: 'Upgrade', onPress: onUpgrade },
    ]);
    return;
  }
  Alert.alert('Couldn’t transcribe', message);
}
