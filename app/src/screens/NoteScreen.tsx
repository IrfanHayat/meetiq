import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Audio } from 'expo-av';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatClock, formatDurationBadge, relativeDay } from '../format';
import { CitedText, NoteExtra, shareNote } from '../components/NoteTools';
import { api } from '../services/api';
import { explainError } from '../services/feedback';
import { useApp } from '../state/AppState';
import { colors, fonts } from '../theme';
import { NoteDetail, RootStackParamList } from '../types';

type Tab = 'transcript' | 'summary' | 'chat';

export function NoteScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Note'>) {
  const { folders, audioMap, removeNote, upsertNote } = useApp();
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [tab, setTab] = useState<Tab>(route.params.tab || 'summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [extra, setExtra] = useState<'speakers' | 'decisions' | 'map' | 'email' | null>(null);
  const [focusSec, setFocusSec] = useState<number | null>(null);
  const soundRef = React.useRef<Audio.Sound | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.note(route.params.id);
      setNote(result.note);
      upsertNote(result.note);
    } catch (err) {
      setError(explainError(err, 'This note couldn’t be opened.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    return () => {
      soundRef.current?.unloadAsync().catch(() => undefined);
      soundRef.current = null;
    };
    // Reload when the opened note changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params.id]);

  const folderName = useMemo(() => {
    if (!note?.folderId) return 'Unfiled';
    return folders.find((folder) => folder.id === note.folderId)?.name || 'Notes';
  }, [folders, note?.folderId]);

  const localUri = audioMap[route.params.id];

  const togglePlay = async () => {
    if (!localUri) return;
    try {
      if (!sound) {
        const created = await Audio.Sound.createAsync({ uri: localUri }, { shouldPlay: true }, (status) => {
          if (!status.isLoaded) return;
          setPosition((status.positionMillis || 0) / 1000);
          setPlaying(status.isPlaying);
        });
        soundRef.current = created.sound;
        setSound(created.sound);
        setPlaying(true);
        return;
      }
      const status = await sound.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) await sound.pauseAsync();
      else await sound.playAsync();
    } catch {
      Alert.alert('Playback unavailable', 'This audio is stored on the device that recorded it.');
    }
  };

  const saveTitle = async () => {
    if (!note) return;
    const title = titleDraft.trim();
    if (!title) return;
    try {
      const result = await api.updateNote(note.id, { title });
      setNote(result.note);
      upsertNote(result.note);
      setRename(false);
    } catch (err) {
      Alert.alert('Couldn’t rename', explainError(err, 'Try again.'));
    }
  };

  const moveTo = async (folderId: string | null) => {
    if (!note) return;
    setMenu(false);
    try {
      const result = await api.updateNote(note.id, { folderId });
      setNote(result.note);
      upsertNote(result.note);
    } catch (err) {
      Alert.alert('Couldn’t move note', explainError(err, 'Try again.'));
    }
  };

  const destroy = () => {
    if (!note) return;
    Alert.alert('Delete note?', 'The transcript and summary will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void api.deleteNote(note.id).then(() => {
            removeNote(note.id);
            navigation.goBack();
          }).catch((err) => Alert.alert('Couldn’t delete', explainError(err, 'Try again.')));
        },
      },
    ]);
  };

  const toggle = async (index: number) => {
    if (!note) return;
    const next = !note.actionItems[index]?.done;
    const optimistic = { ...note, actionItems: note.actionItems.map((item, i) => (i === index ? { ...item, done: next } : item)) };
    setNote(optimistic);
    try {
      const result = await api.toggleAction(note.id, index, next);
      setNote(result.note);
    } catch (err) {
      setNote(note);
      Alert.alert('Couldn’t update', explainError(err, 'Try again.'));
    }
  };

  const send = async (text?: string) => {
    if (!note || sending) return;
    const message = (text ?? draft).trim();
    if (!message) return;
    setDraft('');
    setSending(true);
    const prior = note;
    setNote({ ...note, messages: [...note.messages, { role: 'user', content: message, createdAt: new Date().toISOString() }] });
    try {
      const result = await api.chat(note.id, message);
      setNote({ ...prior, messages: result.messages });
    } catch (err) {
      setNote(prior);
      setDraft(message);
      Alert.alert('Chat unavailable', explainError(err, 'Try again in a moment.'));
    } finally {
      setSending(false);
    }
  };

  const suggestions = ['Draft a recap email', 'Who owns pricing?', 'List the decisions'];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={styles.backrow}>
          <Pressable style={styles.iconBtn} onPress={() => navigation.goBack()}>
            <Feather name="chevron-left" size={22} color={colors.ink} />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1}>{note?.title || 'Note'}</Text>
            <Text style={styles.sub}>{tab === 'chat' ? 'Chat with this note' : `${folderName} · ${relativeDay(note?.createdAt)} · ${formatDurationBadge(note?.durationSeconds || 0)}`}</Text>
          </View>
          <Pressable style={styles.iconBtn} onPress={() => setMenu(true)}>
            <Feather name={tab === 'chat' ? 'plus' : 'more-vertical'} size={18} color={colors.ink} />
          </Pressable>
        </View>
        {tab !== 'chat' ? (
          <View style={styles.player}>
            <Pressable style={styles.play} onPress={() => void togglePlay()}>
              <Feather name={playing ? 'pause' : 'play'} size={14} color="#fff" />
            </Pressable>
            <View style={styles.mini}>
              {Array.from({ length: 28 }).map((_, index) => {
                const on = note ? position / Math.max(note.durationSeconds, 1) > index / 28 : index < 10;
                return <View key={index} style={[styles.miniBar, { height: 8 + ((index * 7) % 16), backgroundColor: on ? colors.accent : '#D0CBF0' }]} />;
              })}
            </View>
            <Text style={styles.time}>{formatClock(position)} / {formatClock(note?.durationSeconds || 0)}</Text>
          </View>
        ) : null}
        <View style={styles.tabs}>
          {(['transcript', 'summary', 'chat'] as Tab[]).map((item) => (
            <Pressable key={item} style={[styles.tab, tab === item && styles.tabOn]} onPress={() => setTab(item)}>
              <Text style={[styles.tabText, tab === item && styles.tabTextOn]}>{item[0].toUpperCase() + item.slice(1)}</Text>
            </Pressable>
          ))}
        </View>
        {extra && note ? (
          <NoteExtra note={note} mode={extra} onBack={() => setExtra(null)} onNote={setNote} onTime={(seconds) => { setExtra(null); setTab('transcript'); setFocusSec(seconds); }} />
        ) : loading ? (
          <ActivityIndicator style={{ marginTop: 30 }} color={colors.accent} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void load()}><Text style={styles.retry}>Try again</Text></Pressable>
          </View>
        ) : note && tab === 'summary' ? (
          <ScrollView contentContainerStyle={styles.summary}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Key points</Text>
              {(note.keyPoints.length ? note.keyPoints : ['No key points yet.']).map((point) => (
                <View key={point} style={styles.kp}>
                  <View style={styles.bullet} />
                  <Text style={styles.kpText}>{point}</Text>
                </View>
              ))}
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Action items</Text>
              {note.actionItems.length === 0 ? <Text style={styles.muted}>No action items in this note.</Text> : null}
              {note.actionItems.map((item, index) => (
                <Pressable key={`${item.text}-${index}`} style={styles.ai} onPress={() => void toggle(index)}>
                  <View style={[styles.check, item.done && styles.checkOn]}>
                    {item.done ? <Feather name="check" size={12} color="#fff" /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.aiText}><Text style={styles.aiOwner}>{item.owner || 'Someone'}</Text> — {item.text}</Text>
                    {item.due ? <Text style={styles.aiDue}>{item.due}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : note && tab === 'transcript' ? (
          <ScrollView contentContainerStyle={styles.summary}>
            <View style={styles.card}>
              {note.segments.length > 0 ? note.segments.map((segment, index) => (
                <Pressable key={`${segment.start}-${index}`} style={[styles.line, focusSec !== null && segment.start <= focusSec && segment.end >= focusSec && { backgroundColor: '#F4F2FF' }]} onPress={() => setFocusSec(segment.start)}>
                  <Text style={styles.ts}>{formatClock(segment.start)}</Text>
                  <Text style={styles.lineText}>{segment.speaker ? `${note.speakerNames?.[segment.speaker] || `Speaker ${Number(segment.speaker) + 1}`}: ` : ''}{segment.text}</Text>
                </Pressable>
              )) : <Text style={styles.lineText}>{note.transcript || 'No transcript yet.'}</Text>}
            </View>
          </ScrollView>
        ) : note ? (
          <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.chat}>
              <View style={[styles.bubble, styles.bubbleAi]}>
                <Text style={styles.who}>MEETIQ</Text>
                <Text style={styles.bubbleText}>I read this {formatDurationBadge(note.durationSeconds)} note. Ask me about decisions, owners, dates, or ask me to draft a recap.</Text>
              </View>
              {note.messages.map((message, index) => (
                <View key={`${message.createdAt}-${index}`} style={[styles.bubble, message.role === 'user' ? styles.bubbleUser : styles.bubbleAi]}>
                  {message.role === 'assistant' ? <Text style={styles.who}>MEETIQ</Text> : null}
                  <CitedText text={message.content} light={message.role === 'user'} onTime={(seconds) => { setExtra(null); setTab('transcript'); setFocusSec(seconds); }} />
                </View>
              ))}
              <View style={styles.sugs}>
                {suggestions.map((suggestion) => (
                  <Pressable key={suggestion} style={styles.sug} onPress={() => void send(suggestion)}>
                    <Text style={styles.sugText}>{suggestion}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <View style={styles.composer}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask anything about this note…"
                placeholderTextColor={colors.ink3}
                style={styles.input}
                onSubmitEditing={() => void send()}
              />
              <Pressable style={styles.send} onPress={() => void send()}>
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="send" size={16} color="#fff" />}
              </Pressable>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.modalBg} onPress={() => setMenu(false)}>
          <View style={styles.sheet}>
            <Pressable style={styles.sheetRow} onPress={() => { setMenu(false); if (note) void shareNote(note); }}>
              <Text style={styles.sheetText}>Share transcript</Text>
            </Pressable>
            <Pressable style={styles.sheetRow} onPress={() => { setMenu(false); setExtra('speakers'); }}><Text style={styles.sheetText}>Speakers</Text></Pressable>
            <Pressable style={styles.sheetRow} onPress={() => { setMenu(false); setExtra('decisions'); }}><Text style={styles.sheetText}>Decisions</Text></Pressable>
            <Pressable style={styles.sheetRow} onPress={() => { setMenu(false); setExtra('map'); }}><Text style={styles.sheetText}>Mind map</Text></Pressable>
            <Pressable style={styles.sheetRow} onPress={() => { setMenu(false); setExtra('email'); }}><Text style={styles.sheetText}>Follow-up email</Text></Pressable>
            <Pressable style={styles.sheetRow} onPress={() => { setMenu(false); setTitleDraft(note?.title || ''); setRename(true); }}>
              <Text style={styles.sheetText}>Rename</Text>
            </Pressable>
            <Text style={styles.sheetLabel}>Move to</Text>
            <Pressable style={styles.sheetRow} onPress={() => void moveTo(null)}><Text style={styles.sheetText}>Unfiled</Text></Pressable>
            {folders.map((folder) => (
              <Pressable key={folder.id} style={styles.sheetRow} onPress={() => void moveTo(folder.id)}>
                <Text style={styles.sheetText}>{folder.name}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.sheetRow} onPress={destroy}><Text style={[styles.sheetText, { color: colors.danger }]}>Delete note</Text></Pressable>
          </View>
        </Pressable>
      </Modal>
      <Modal visible={rename} transparent animationType="fade" onRequestClose={() => setRename(false)}>
        <View style={styles.modalBg}>
          <View style={styles.renameCard}>
            <Text style={styles.cardTitle}>Rename note</Text>
            <TextInput value={titleDraft} onChangeText={setTitleDraft} style={styles.renameInput} />
            <PrimaryRow onPress={() => void saveTitle()} label="Save" />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function PrimaryRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.saveBtn}>
      <Text style={styles.saveText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  backrow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { flex: 1, alignItems: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.semibold, fontSize: 11, color: colors.ink3, marginTop: 1 },
  player: { marginHorizontal: 20, marginBottom: 12, marginTop: 4, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  play: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  mini: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 28 },
  miniBar: { width: 2.5, borderRadius: 2 },
  time: { width: 78, textAlign: 'right', fontFamily: fonts.bold, fontSize: 11, color: colors.ink2 },
  tabs: { marginHorizontal: 20, marginBottom: 12, backgroundColor: '#ECEAF6', borderRadius: 12, padding: 3, flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  tabOn: { backgroundColor: colors.white },
  tabText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.ink2 },
  tabTextOn: { color: colors.ink },
  summary: { paddingHorizontal: 20, paddingBottom: 28, gap: 12 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink, marginBottom: 10 },
  kp: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  bullet: { width: 6, height: 6, borderRadius: 6, backgroundColor: colors.accent, marginTop: 6 },
  kpText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: '#2A2440' },
  ai: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  check: { width: 18, height: 18, borderRadius: 6, borderWidth: 1.5, borderColor: '#C9C3DC', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkOn: { backgroundColor: colors.good, borderColor: colors.good },
  aiText: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.ink },
  aiOwner: { fontFamily: fonts.bold },
  aiDue: { fontFamily: fonts.semibold, fontSize: 11, color: colors.ink3, marginTop: 1 },
  muted: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink2 },
  line: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  ts: { width: 44, fontFamily: fonts.bold, fontSize: 11, color: colors.accent, paddingTop: 2 },
  lineText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: '#2A2440' },
  chat: { paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  bubble: { maxWidth: '86%', paddingHorizontal: 13, paddingVertical: 11, borderRadius: 16 },
  bubbleAi: { alignSelf: 'flex-start', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 6 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  who: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.accent, marginBottom: 3 },
  bubbleText: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: '#241E38' },
  bubbleTextUser: { color: '#fff' },
  sugs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sug: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: '#DDD9FF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  sugText: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.accentDeep },
  composer: { marginHorizontal: 16, marginBottom: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6 },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 13.5, color: colors.ink, paddingVertical: 10 },
  send: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  errorBox: { padding: 24, alignItems: 'center' },
  errorText: { fontFamily: fonts.medium, color: colors.ink2, textAlign: 'center' },
  retry: { marginTop: 10, fontFamily: fonts.bold, color: colors.accent },
  modalBg: { flex: 1, backgroundColor: 'rgba(22,17,38,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28 },
  sheetRow: { paddingVertical: 12 },
  sheetText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  sheetLabel: { fontFamily: fonts.bold, fontSize: 11, color: colors.ink3, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 6 },
  renameCard: { margin: 24, backgroundColor: colors.white, borderRadius: 18, padding: 16 },
  renameInput: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, height: 46, fontFamily: fonts.medium, color: colors.ink },
  saveBtn: { marginTop: 12, height: 46, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontFamily: fonts.bold },
});

