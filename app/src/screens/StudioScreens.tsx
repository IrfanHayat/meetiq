import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, api } from '../services/api';
import { explainError } from '../services/feedback';
import { colors, fonts } from '../theme';
import { RootStackParamList } from '../types';

function Frame({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Feather name="chevron-left" size={22} color={colors.ink} /></Pressable>
        <Text style={styles.title}>{title}</Text>
      </View>
      {children}
    </SafeAreaView>
  );
}

export function GeneralChatScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'GeneralChat'>) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api.generalHistory().then((res) => setMessages(res.messages || [])).catch(() => setError('Chat will load when MeetIQ is reachable.'));
  }, []);
  const send = async () => {
    const message = draft.trim();
    if (!message || busy) return;
    setDraft('');
    setBusy(true);
    setError('');
    try {
      const res = await api.generalChat(message);
      setMessages(res.messages || []);
    } catch (err) {
      setError(explainError(err, 'Try again in a moment.'));
      setDraft(message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Frame title="AI chat" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={styles.hint}>General assistant. It is not limited to one meeting.</Text>
        {messages.map((message, index) => (
          <View key={index} style={[styles.bubble, message.role === 'user' ? styles.user : styles.ai]}>
            <Text style={[styles.bubbleText, message.role === 'user' && styles.userText]}>{message.content}</Text>
          </View>
        ))}
        {error ? <Text style={styles.err}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput value={draft} onChangeText={setDraft} placeholder="Ask MeetIQ…" placeholderTextColor={colors.ink3} style={styles.input} />
        <Pressable style={styles.send} onPress={() => void send()}>{busy ? <ActivityIndicator color="#fff" /> : <Feather name="send" size={16} color="#fff" />}</Pressable>
      </View>
    </Frame>
  );
}

export function MemoryScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Memory'>) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [meetings, setMeetings] = useState<{ id: string; title: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ask = async (text?: string) => {
    const q = (text ?? question).trim();
    if (!q || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.memory(q);
      setAnswer(res.answer);
      setMeetings(res.meetings || []);
    } catch (err) {
      setError(explainError(err, 'Memory is unavailable right now.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Frame title="Meeting memory" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={styles.hint}>Ask across your meetings. Answers cite the meeting and time.</Text>
        {['What was discussed last Monday?', 'Last month client ne budget kitna bataya tha?'].map((sample) => (
          <Pressable key={sample} style={styles.sample} onPress={() => { setQuestion(sample); void ask(sample); }}>
            <Text style={styles.sampleText}>{sample}</Text>
          </Pressable>
        ))}
        {busy ? <ActivityIndicator color={colors.accent} /> : null}
        {answer ? <Text style={styles.answer}>{answer}</Text> : null}
        {meetings.map((meeting) => (
          <Pressable key={meeting.id} onPress={() => navigation.navigate('Note', { id: meeting.id, tab: 'summary' })}>
            <Text style={styles.link}>{meeting.title}</Text>
          </Pressable>
        ))}
        {error ? <Text style={styles.err}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput value={question} onChangeText={setQuestion} placeholder="Ask your meetings…" placeholderTextColor={colors.ink3} style={styles.input} />
        <Pressable style={styles.send} onPress={() => void ask()}><Feather name="search" size={16} color="#fff" /></Pressable>
      </View>
    </Frame>
  );
}

export function InsightsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Insights'>) {
  const [data, setData] = useState<{ repeatedTopics: string[]; unresolvedQuestions: string[]; pendingDecisions: string[]; frequentIssues: string[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.insights().then(setData).catch((err) => setError(explainError(err, 'Insights need a connection.')));
  }, []);
  const block = (title: string, items?: string[]) => (
    <View style={styles.card} key={title}>
      <Text style={styles.cardTitle}>{title}</Text>
      {(items || []).length ? items!.map((item) => <Text key={item} style={styles.item}>• {item}</Text>) : <Text style={styles.hint}>Nothing here yet.</Text>}
    </View>
  );
  return (
    <Frame title="Meeting insights" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={styles.list}>
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {!data && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {data ? <>
          {block('Repeated topics', data.repeatedTopics)}
          {block('Unresolved questions', data.unresolvedQuestions)}
          {block('Pending decisions', data.pendingDecisions)}
          {block('Frequent issues', data.frequentIssues)}
        </> : null}
      </ScrollView>
    </Frame>
  );
}

export function DecisionsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Decisions'>) {
  const [rows, setRows] = useState<{ noteId: string; title: string; text: string; owner: string; timestamp: string }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api.decisions().then((res) => setRows(res.decisions || [])).catch((err) => setError(explainError(err, 'Could not load decisions.')));
  }, []);
  return (
    <Frame title="Decisions" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={styles.list}>
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {!rows.length && !error ? <Text style={styles.hint}>Decisions show up after a meeting is transcribed.</Text> : null}
        {rows.map((row, index) => (
          <Pressable key={`${row.noteId}-${index}`} style={styles.card} onPress={() => navigation.navigate('Note', { id: row.noteId, tab: 'summary' })}>
            <Text style={styles.cardTitle}>{row.text}</Text>
            <Text style={styles.hint}>{row.title}{row.owner ? ` · ${row.owner}` : ''}{row.timestamp ? ` · ${row.timestamp}` : ''}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Frame>
  );
}

void ApiError;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.extra, fontSize: 22, color: colors.ink },
  list: { padding: 20, gap: 10, paddingBottom: 24 },
  hint: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink2, lineHeight: 18 },
  bubble: { maxWidth: '86%', padding: 12, borderRadius: 16 },
  user: { alignSelf: 'flex-end', backgroundColor: colors.accent },
  ai: { alignSelf: 'flex-start', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  bubbleText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  userText: { color: '#fff' },
  composer: { flexDirection: 'row', margin: 16, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, alignItems: 'center', paddingLeft: 12 },
  input: { flex: 1, height: 48, fontFamily: fonts.medium, color: colors.ink },
  send: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  err: { fontFamily: fonts.medium, color: colors.danger },
  sample: { backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  sampleText: { fontFamily: fonts.semibold, color: colors.accentDeep, fontSize: 12 },
  answer: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink, lineHeight: 22 },
  link: { fontFamily: fonts.bold, color: colors.accent, marginTop: 4 },
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 6 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  item: { fontFamily: fonts.medium, fontSize: 13, color: '#2A2440' },
});
