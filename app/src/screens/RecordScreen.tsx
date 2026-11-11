import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatClock } from '../format';
import { api } from '../services/api';
import { showInterstitialIfAllowed } from '../services/ads';
import { alertForTranscribeError } from '../services/feedback';
import { useApp } from '../state/AppState';
import { colors, fonts, languageLabel } from '../theme';
import { RootStackParamList, Segment } from '../types';

const BASE_WAVE = [18, 28, 42, 22, 54, 36, 62, 24, 48, 70, 40, 22, 58, 34, 16, 44, 66, 30, 50, 20, 38, 60, 26, 48, 18, 32, 56, 24];

export function RecordScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Record'>) {
  const { folders, user, transcribe, unlockWithAd, applyUser, upsertNote } = useApp();
  const [folderId, setFolderId] = useState<string | null>(route.params?.folderId ?? null);
  const [millis, setMillis] = useState(0);
  const [paused, setPaused] = useState(false);
  const [levels, setLevels] = useState<number[]>(BASE_WAVE);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState(false);
  const [marks, setMarks] = useState<number[]>([]);
  const [savedUri, setSavedUri] = useState<string | null>(null);
  const [liveLines, setLiveLines] = useState<Segment[]>([]);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const stopping = useRef(false);
  const linesRef = useRef<Segment[]>([]);
  const baseRef = useRef(0);
  const rotateLock = useRef(false);
  const languageRef = useRef(user?.language || 'en');
  languageRef.current = user?.language || 'en';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const permission = await Audio.requestPermissionsAsync();
        if (!permission.granted) {
          if (!cancelled) setError('Microphone access is off. Allow it in system settings to record.');
          return;
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
          staysActiveInBackground: false,
        });
        const recording = new Audio.Recording();
        recording.setProgressUpdateInterval(120);
        recording.setOnRecordingStatusUpdate((status) => {
          if (!status.canRecord && !status.isRecording) return;
          setMillis(baseRef.current * 1000 + (status.durationMillis || 0));
          setPaused(Boolean(status.isRecording === false && (status.durationMillis || 0) > 0));
          if (typeof status.metering === 'number') {
            const height = Math.max(10, Math.min(72, (status.metering + 50) * 1.4));
            setLevels((current) => [...current.slice(1), height]);
          }
        });
        await recording.prepareToRecordAsync({
          isMeteringEnabled: true,
          android: {
            extension: '.m4a',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          ios: {
            extension: '.m4a',
            outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
            audioQuality: Audio.IOSAudioQuality.HIGH,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
        });
        await recording.startAsync();
        await activateKeepAwakeAsync('meetiq-record').catch(() => undefined);
        recordingRef.current = recording;
        if (!cancelled) setReady(true);
      } catch (err) {
        console.warn('Recording failed to start', err);
        if (!cancelled) setError('The microphone couldn’t start. Close other audio apps and try again.');
      }
    })();
    return () => {
      cancelled = true;
      void deactivateKeepAwake('meetiq-record').catch(() => undefined);
      const recording = recordingRef.current;
      recordingRef.current = null;
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      void (async () => {
        if (stopping.current || rotateLock.current || !recordingRef.current) return;
        rotateLock.current = true;
        const recording = recordingRef.current;
        try {
          const status = await recording.getStatusAsync();
          const chunkSec = status.durationMillis ? status.durationMillis / 1000 : 0;
          if (chunkSec < 2) {
            rotateLock.current = false;
            return;
          }
          await recording.stopAndUnloadAsync();
          recordingRef.current = null;
          const uri = recording.getURI();
          const offset = baseRef.current;
          baseRef.current += chunkSec;
          const next = new Audio.Recording();
          next.setProgressUpdateInterval(120);
          next.setOnRecordingStatusUpdate((nextStatus) => {
            if (!nextStatus.canRecord && !nextStatus.isRecording) return;
            setMillis(baseRef.current * 1000 + (nextStatus.durationMillis || 0));
          });
          await next.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
          await next.startAsync();
          recordingRef.current = next;
          if (uri) {
            const result = await api.liveChunk({ uri, offsetSeconds: offset, language: languageRef.current });
            if (result.segments?.length) {
              linesRef.current = [...linesRef.current, ...result.segments].slice(-50);
              setLiveLines(linesRef.current);
            }
          }
        } catch (err) {
          console.warn('Live chunk skipped', err);
          if (!recordingRef.current) {
            try {
              const next = new Audio.Recording();
              await next.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
              await next.startAsync();
              recordingRef.current = next;
            } catch {
              setError('Live transcription paused. Stop to save what was captured.');
            }
          }
        } finally {
          rotateLock.current = false;
        }
      })();
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  const folderName = folders.find((folder) => folder.id === folderId)?.name || 'Unfiled';

  const discard = async () => {
    stopping.current = true;
    const recording = recordingRef.current;
    recordingRef.current = null;
    try {
      await recording?.stopAndUnloadAsync();
    } catch {
      // Already stopped.
    }
    navigation.goBack();
  };

  const askDiscard = () => {
    if (millis < 800) {
      void discard();
      return;
    }
    Alert.alert('Discard recording?', 'This audio won’t be transcribed.', [
      { text: 'Keep recording', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void discard() },
    ]);
  };

  const togglePause = async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    try {
      const status = await recording.getStatusAsync();
      if (status.isRecording) await recording.pauseAsync();
      else await recording.startAsync();
    } catch (err) {
      console.warn('Pause failed', err);
    }
  };

  const finish = async () => {
    if (stopping.current) return;
    if (!savedUri && millis < 800) {
      Alert.alert('Too short', 'Record at least a second of audio.');
      return;
    }
    stopping.current = true;
    try {
      let uri = savedUri;
      if (!uri) {
        const recording = recordingRef.current;
        if (!recording) {
          stopping.current = false;
          return;
        }
        await recording.stopAndUnloadAsync();
        recordingRef.current = null;
        uri = recording.getURI();
        if (!uri) throw new Error('The recording file is missing.');
        setSavedUri(uri);
      }
      if (uri && !savedUri) {
        try {
          const result = await api.liveChunk({ uri, offsetSeconds: baseRef.current, language: user?.language || 'en' });
          if (result.segments?.length) linesRef.current = [...linesRef.current, ...result.segments];
          baseRef.current += result.durationSeconds || 0;
        } catch {
          // The full-file path below still saves the recording.
        }
      }
      if (linesRef.current.length) {
        const live = await api.finishLive({
          segments: linesRef.current,
          durationSeconds: Math.max(1, baseRef.current || millis / 1000),
          folderId,
          language: user?.language || 'en',
        });
        applyUser(live.user);
        upsertNote(live.note);
        await showInterstitialIfAllowed(Boolean(user?.isPremium));
        navigation.replace('Note', { id: live.note.id, tab: 'summary' });
        return;
      }
      if (!uri) throw new Error('The recording file is missing.');
      const note = await transcribe({
        uri,
        name: 'recording.m4a',
        mime: 'audio/mp4',
        folderId,
        language: user?.language || 'en',
        durationSeconds: Math.max(1, millis / 1000),
        source: 'recording',
      });
      await showInterstitialIfAllowed(Boolean(user?.isPremium));
      navigation.replace('Note', { id: note.id, tab: 'summary' });
    } catch (err) {
      stopping.current = false;
      alertForTranscribeError(err, () => navigation.navigate('Paywall'), () => {
        void unlockWithAd();
      });
    }
  };

  return (
    <LinearGradient colors={['#1B1630', '#241B46', '#2A1F52']} style={styles.fill}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.top}>
          <Pressable style={styles.round} onPress={askDiscard}>
            <Feather name="x" size={18} color="#fff" />
          </Pressable>
          <Pressable style={styles.folderChip} onPress={() => setPicker((value) => !value)}>
            <Text style={styles.folderText}>{folderName}</Text>
          </Pressable>
          <Pressable style={styles.round} onPress={askDiscard}>
            <Feather name="more-horizontal" size={18} color="#fff" />
          </Pressable>
        </View>
        {picker ? (
          <View style={styles.picker}>
            <Pressable onPress={() => { setFolderId(null); setPicker(false); }}><Text style={styles.pickerItem}>Unfiled</Text></Pressable>
            {folders.map((folder) => (
              <Pressable key={folder.id} onPress={() => { setFolderId(folder.id); setPicker(false); }}>
                <Text style={styles.pickerItem}>{folder.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.mid}>
          <View style={styles.live}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{paused ? 'PAUSED' : 'REC · LIVE'}</Text>
          </View>
          <Text style={styles.timer}>{formatClock(millis / 1000)}</Text>
          <Text style={styles.sub}>{error || `New recording · ${languageLabel(user?.language)}`}</Text>
        </View>
        <View style={styles.wave}>
          {levels.map((height, index) => (
            <View key={index} style={[styles.bar, { height }]} />
          ))}
        </View>
        <View style={styles.transcript}>
          <Text style={styles.transcriptLabel}>Live transcript</Text>
          {liveLines.length ? liveLines.slice(-6).map((line, index) => (
            <Text key={`${line.start}-${index}`} style={styles.transcriptBody}>
              {formatClock(line.start)} {line.speaker !== undefined && line.speaker !== '' ? `Speaker ${Number(line.speaker) + 1}: ` : ''}{line.text}
            </Text>
          )) : marks.length === 0 ? (
            <Text style={styles.transcriptBody}>
              {savedUri
                ? 'Recording saved on this phone. Tap the square button to try transcription again.'
                : ready
                  ? 'Listening… the full transcript, summary, and action items appear when you stop.'
                  : 'Preparing the microphone…'}
            </Text>
          ) : (
            marks.map((mark) => (
              <Text key={mark} style={styles.mark}>Marker · {formatClock(mark / 1000)}</Text>
            ))
          )}
        </View>
        <View style={styles.controls}>
          <Pressable style={styles.ctrl} onPress={() => void togglePause()}>
            <Feather name={paused ? 'play' : 'pause'} size={18} color="#fff" />
          </Pressable>
          <Pressable style={styles.stop} onPress={() => void finish()}>
            <View style={styles.stopSquare} />
          </Pressable>
          <Pressable style={styles.ctrl} onPress={() => setMarks((current) => [...current, millis].slice(-6))}>
            <Feather name="plus" size={18} color="#fff" />
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4 },
  round: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  folderChip: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  folderText: { color: '#fff', fontFamily: fonts.semibold, fontSize: 12 },
  picker: { marginHorizontal: 48, marginTop: 8, backgroundColor: '#2C2548', borderRadius: 14, paddingVertical: 6 },
  pickerItem: { color: '#fff', fontFamily: fonts.semibold, fontSize: 14, paddingHorizontal: 14, paddingVertical: 10 },
  mid: { alignItems: 'center', paddingTop: 22 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(226,71,71,0.16)', borderWidth: 1, borderColor: 'rgba(226,71,71,0.28)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 7, backgroundColor: colors.danger },
  liveText: { color: '#FF8A8A', fontFamily: fonts.bold, fontSize: 11.5, letterSpacing: 0.4 },
  timer: { marginTop: 14, fontFamily: fonts.extra, fontSize: 58, color: '#fff', letterSpacing: -2 },
  sub: { color: 'rgba(255,255,255,0.62)', fontFamily: fonts.medium, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  wave: { height: 86, marginHorizontal: 20, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  bar: { width: 3.5, borderRadius: 4, backgroundColor: '#8D7DFF' },
  transcript: { flex: 1, marginHorizontal: 20, marginTop: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 18, padding: 14 },
  transcriptLabel: { color: 'rgba(255,255,255,0.5)', fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  transcriptBody: { color: 'rgba(255,255,255,0.78)', fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  mark: { color: '#C4B8FF', fontFamily: fonts.semibold, fontSize: 13, marginBottom: 6 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, paddingVertical: 22 },
  ctrl: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  stop: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 22, height: 22, borderRadius: 5, backgroundColor: '#fff' },
});
