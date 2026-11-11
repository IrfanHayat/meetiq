import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../services/api';
import { explainError } from '../services/feedback';
import { colors, fonts } from '../theme';
import { MindMap, NoteDetail } from '../types';

export function CitedText({ text, onTime, light = false }: { text: string; onTime: (seconds: number) => void; light?: boolean }) {
  const parts = text.split(/(\[\d{1,2}:\d{2}(?::\d{2})?\])/g);
  return (
    <Text style={[styles.body, light && styles.light]}>
      {parts.map((part, index) => {
        const match = part.match(/^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]$/);
        if (!match) return <Text key={index}>{part}</Text>;
        const seconds = match[3] ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : Number(match[1]) * 60 + Number(match[2]);
        return <Text key={index} style={styles.time} onPress={() => onTime(seconds)}>{part}</Text>;
      })}
    </Text>
  );
}

export async function shareNote(note: NoteDetail): Promise<void> {
  const text = [
    note.title,
    note.summary,
    '',
    ...(note.keyPoints || []).map((point) => `• ${point}`),
    '',
    note.transcript,
  ].filter(Boolean).join('\n');
  try {
    await Share.share({ message: text.slice(0, 8000), title: note.title });
  } catch {
    await Clipboard.setStringAsync(text.slice(0, 8000));
    Alert.alert('Copied', 'The note text is on your clipboard.');
  }
}

export function NoteExtra({
  note,
  mode,
  onBack,
  onNote,
  onTime,
}: {
  note: NoteDetail;
  mode: 'speakers' | 'decisions' | 'map' | 'email';
  onBack: () => void;
  onNote: (note: NoteDetail) => void;
  onTime: (seconds: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [map, setMap] = useState<MindMap | null>(note.mindMap);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [rename, setRename] = useState<{ speaker: string; name: string } | null>(null);

  const loadMap = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.mindMap(note.id);
      setMap(res.mindMap);
      onNote({ ...note, mindMap: res.mindMap });
    } catch (err) {
      setError(explainError(err, 'Mind map failed.'));
    } finally {
      setBusy(false);
    }
  };

  const loadEmail = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.email(note.id);
      setSubject(res.subject);
      setBody(res.body);
    } catch (err) {
      setError(explainError(err, 'Could not draft the email.'));
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    if (mode === 'map' && !map) void loadMap();
    if (mode === 'email' && !body) void loadEmail();
  }, [mode]);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Pressable onPress={onBack}><Text style={styles.back}>Back to note</Text></Pressable>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {busy ? <ActivityIndicator color={colors.accent} /> : null}
      {mode === 'speakers' ? (note.speakers?.speakers || []).map((speaker) => (
        <Pressable key={speaker.id} style={styles.card} onPress={() => setRename({ speaker: speaker.id, name: speaker.name })}>
          <Text style={styles.cardTitle}>{speaker.name}</Text>
          <Text style={styles.meta}>{speaker.percent}% · {Math.round(speaker.seconds)}s · tap to rename</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, speaker.percent)}%` }]} /></View>
        </Pressable>
      )) : null}
      {mode === 'speakers' && !(note.speakers?.speakers || []).length ? <Text style={styles.meta}>Speaker labels appear when diarization finds more than one voice. Imported captions may have none.</Text> : null}
      {mode === 'speakers' ? (note.speakers?.timeline || []).slice(0, 30).map((line, index) => (
        <Pressable key={index} onPress={() => onTime(line.start)}>
          <Text style={styles.meta}>{line.speaker ? `${note.speakerNames?.[line.speaker] || `Speaker ${Number(line.speaker) + 1}`}: ` : ''}{line.text}</Text>
        </Pressable>
      )) : null}
      {mode === 'decisions' ? (note.decisions || []).map((item, index) => (
        <Pressable key={index} style={styles.card} onPress={() => item.timestamp && onTime(parseStamp(item.timestamp))}>
          <Text style={styles.cardTitle}>{item.text}</Text>
          <Text style={styles.meta}>{[item.owner, item.timestamp].filter(Boolean).join(' · ') || 'Decision'}</Text>
        </Pressable>
      )) : null}
      {mode === 'decisions' && !(note.decisions || []).length ? <Text style={styles.meta}>No decisions were found in this meeting.</Text> : null}
      {mode === 'map' && map ? (
        <View style={styles.map}>
          {map.nodes.map((node) => (
            <View key={node.id} style={[styles.node, node.kind === 'decision' && styles.decision, node.kind === 'idea' && styles.idea]}>
              <Text style={styles.nodeKind}>{node.kind}</Text>
              <Text style={styles.cardTitle}>{node.label}</Text>
            </View>
          ))}
          {map.edges.map((edge, index) => (
            <Text key={index} style={styles.meta}>{edge.from} → {edge.to}{edge.label ? ` (${edge.label})` : ''}</Text>
          ))}
        </View>
      ) : null}
      {mode === 'email' && body ? (
        <View style={styles.card}>
          <TextInput value={subject} onChangeText={setSubject} style={styles.input} />
          <TextInput value={body} onChangeText={setBody} style={[styles.input, styles.area]} multiline />
          <Pressable style={styles.btn} onPress={() => void Share.share({ message: `${subject}\n\n${body}` })}><Text style={styles.btnText}>Share</Text></Pressable>
          <Pressable style={styles.btn} onPress={() => void Linking.openURL(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.slice(0, 1800))}`)}><Text style={styles.btnText}>Open mail</Text></Pressable>
        </View>
      ) : null}
      {rename ? (
        <View style={styles.card}>
          <TextInput value={rename.name} onChangeText={(name) => setRename({ ...rename, name })} style={styles.input} />
          <Pressable style={styles.btn} onPress={() => {
            void api.renameSpeaker(note.id, rename.speaker, rename.name.trim()).then((res) => {
              onNote(res.note);
              setRename(null);
            }).catch((err) => setError(explainError(err, 'Could not rename.')));
          }}><Text style={styles.btnText}>Save name</Text></Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function parseStamp(value: string): number {
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 10, paddingBottom: 40 },
  back: { fontFamily: fonts.bold, color: colors.accent, marginBottom: 6 },
  body: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: '#241E38' },
  light: { color: '#fff' },
  time: { color: colors.accent, fontFamily: fonts.bold },
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 6 },
  cardTitle: { fontFamily: fonts.bold, color: colors.ink, fontSize: 14 },
  meta: { fontFamily: fonts.medium, color: colors.ink2, fontSize: 12 },
  err: { color: colors.danger, fontFamily: fonts.medium },
  track: { height: 8, backgroundColor: '#ECEAF6', borderRadius: 99, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent },
  map: { gap: 8 },
  node: { backgroundColor: colors.accentSoft, borderRadius: 14, padding: 12 },
  decision: { backgroundColor: '#E8F8F1' },
  idea: { backgroundColor: '#FFF4DE' },
  nodeKind: { fontFamily: fonts.bold, fontSize: 10, color: colors.ink3, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 10, fontFamily: fonts.medium, color: colors.ink },
  area: { minHeight: 140, textAlignVertical: 'top' },
  btn: { backgroundColor: colors.accent, borderRadius: 12, alignItems: 'center', paddingVertical: 10 },
  btnText: { color: '#fff', fontFamily: fonts.bold },
});
