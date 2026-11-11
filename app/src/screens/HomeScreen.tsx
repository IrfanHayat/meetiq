import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HomeBanner, NativeListAd } from '../components/AdSlots';
import { OfflineBanner } from '../components/Ui';
import { formatDurationBadge, greeting, relativeDay } from '../format';
import { useImport } from '../hooks/useImport';
import { api } from '../services/api';
import { explainError } from '../services/feedback';
import { useApp } from '../state/AppState';
import { colors, folderVisual, fonts } from '../theme';
import { NoteSummary, RootStackParamList } from '../types';

type Row = { key: string; kind: 'note'; note: NoteSummary } | { key: string; kind: 'ad' };

export function HomeScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Home'>) {
  const { notes, folders, user, offline, retryConnection, refresh } = useApp();
  const importAudio = useImport(navigation);
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<string>(route.params?.folderId ? String(route.params.folderId) : route.params && 'folderId' in route.params ? 'none' : 'all');
  useEffect(() => {
    if (!route.params || !('folderId' in route.params)) return;
    setChip(route.params.folderId ? String(route.params.folderId) : 'none');
  }, [route.params?.folderId]);
  const [refreshing, setRefreshing] = useState(false);
  const [ytOpen, setYtOpen] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const showAds = Boolean(user && !user.isPremium);

  const folderName = (id: string | null) => {
    if (!id) return 'Unfiled';
    return folders.find((folder) => folder.id === id)?.name || 'Notes';
  };
  const folderIcon = (id: string | null) => {
    if (!id) return folderVisual('unfiled');
    const folder = folders.find((item) => item.id === id);
    return folderVisual(folder?.icon, folder?.color);
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = notes.filter((note) => {
      if (chip !== 'all' && (note.folderId || 'none') !== chip) return false;
      if (!q) return true;
      return `${note.title} ${note.preview}`.toLowerCase().includes(q);
    });
    const list: Row[] = filtered.map((note) => ({ key: note.id, kind: 'note', note }));
    if (showAds) {
      const index = list.length > 1 ? 1 : list.length;
      list.splice(index, 0, { key: 'native-ad', kind: 'ad' });
    }
    return list;
  }, [notes, query, chip, showAds]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greet}>{greeting()}</Text>
          <Text style={styles.title}>Your notes</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('Settings')} style={styles.gear} hitSlop={6}>
          <Feather name="settings" size={18} color={colors.ink2} />
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate(user?.isPremium ? 'Settings' : 'Paywall')}
          style={styles.mins}
        >
          <Feather name="clock" size={12} color={colors.accentDeep} />
          <Text style={styles.minsText}>{Math.max(0, Math.floor(user?.usage.remainingMinutes ?? 100))} min left</Text>
        </Pressable>
      </View>
      {offline ? <OfflineBanner onRetry={() => void retryConnection()} /> : null}
      <View style={styles.search}>
        <Feather name="search" size={18} color={colors.ink3} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search notes, folders, or people"
          placeholderTextColor={colors.ink3}
          style={styles.searchInput}
        />
      </View>
      <View style={styles.tools}>
        <Pressable style={styles.tool} onPress={() => setYtOpen(true)}><Text style={styles.toolText}>YouTube</Text></Pressable>
        <Pressable style={styles.tool} onPress={() => navigation.navigate('GeneralChat')}><Text style={styles.toolText}>AI chat</Text></Pressable>
        <Pressable style={styles.tool} onPress={() => navigation.navigate('Memory')}><Text style={styles.toolText}>Memory</Text></Pressable>
        <Pressable style={styles.tool} onPress={() => navigation.navigate('Insights')}><Text style={styles.toolText}>Insights</Text></Pressable>
        <Pressable style={styles.tool} onPress={() => navigation.navigate('Decisions')}><Text style={styles.toolText}>Decisions</Text></Pressable>
      </View>
      <View style={styles.chips}>
        <Chip label="All" active={chip === 'all'} onPress={() => setChip('all')} />
        {folders.map((folder) => (
          <Chip key={folder.id || folder.name} label={folder.name} active={chip === folder.id} onPress={() => setChip(String(folder.id))} />
        ))}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          refresh().finally(() => setRefreshing(false));
        }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No notes yet</Text>
            <Text style={styles.emptyBody}>Record a meeting or import an audio file. Transcripts, summaries, and chat show up here.</Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'ad') return <NativeListAd enabled={showAds} />;
          const visual = folderIcon(item.note.folderId);
          return (
            <Pressable style={styles.note} onPress={() => navigation.navigate('Note', { id: item.note.id, tab: 'summary' })}>
              <View style={[styles.noteIcon, { backgroundColor: visual.bg }]}>
                <Feather name={visual.ion} size={18} color={visual.fg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.noteTitle} numberOfLines={1}>{item.note.title}</Text>
                <Text style={styles.notePreview} numberOfLines={1}>{item.note.preview || 'Transcript ready'}</Text>
                <Text style={styles.noteMeta}>{folderName(item.note.folderId)} · {relativeDay(item.note.createdAt)}</Text>
              </View>
              <View style={styles.dur}>
                <Text style={styles.durText}>{formatDurationBadge(item.note.durationSeconds)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
      <View style={styles.dock}>
        <HomeBanner enabled={showAds} />
        <View style={styles.dockRow}>
          <Pressable style={[styles.side, styles.sideLeft]} onPress={() => void importAudio(chip !== 'all' && chip !== 'none' ? chip : null)}>
            <Feather name="upload" size={20} color={colors.accent} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Record', { folderId: chip !== 'all' && chip !== 'none' ? chip : null })}>
            <LinearGradient colors={['#6C61FF', '#4F3CE8']} style={styles.fab}>
              <Feather name="mic" size={28} color="#fff" />
            </LinearGradient>
          </Pressable>
          <Pressable style={[styles.side, styles.sideRight]} onPress={() => navigation.navigate('Folders')}>
            <Feather name="folder" size={20} color={colors.accent} />
          </Pressable>
        </View>
      </View>
    <Modal visible={ytOpen} transparent animationType="fade" onRequestClose={() => setYtOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalCard}>
            <Text style={styles.emptyTitle}>YouTube link</Text>
            <TextInput value={ytUrl} onChangeText={setYtUrl} placeholder="https://youtu.be/…" placeholderTextColor={colors.ink3} style={styles.ytInput} autoCapitalize="none" />
            <Pressable style={styles.ytBtn} onPress={() => {
              const url = ytUrl.trim();
              if (!url) return;
              setYtOpen(false);
              void api.youtube(url, chip !== 'all' && chip !== 'none' ? chip : null).then((res) => {
                navigation.navigate('Note', { id: res.note.id, tab: 'summary' });
              }).catch((err) => Alert.alert('YouTube', explainError(err, 'That link could not be imported.')));
            }}><Text style={styles.ytBtnText}>Import</Text></Pressable>
            <Pressable onPress={() => setYtOpen(false)}><Text style={styles.toolText}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  greet: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.ink3 },
  title: { fontFamily: fonts.extra, fontSize: 24, color: colors.ink, letterSpacing: -0.6, marginTop: 1 },
  gear: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mins: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: '#DDD9FF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  minsText: { fontFamily: fonts.bold, fontSize: 11.5, color: colors.accentDeep },
  search: { marginHorizontal: 20, marginBottom: 12, height: 44, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.ink, padding: 0 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 20, paddingBottom: 8 },
  tool: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  toolText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.accentDeep },
  modal: { flex: 1, backgroundColor: 'rgba(22,17,38,0.35)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.white, borderRadius: 18, padding: 16, gap: 10 },
  ytInput: { height: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, fontFamily: fonts.medium, color: colors.ink },
  ytBtn: { height: 46, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  ytBtnText: { color: '#fff', fontFamily: fonts.bold },
  chips: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 12, flexWrap: 'wrap' },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.ink2 },
  chipTextOn: { color: colors.white },
  list: { paddingHorizontal: 20, gap: 10, paddingBottom: 168 },
  note: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  noteIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  noteTitle: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink },
  notePreview: { marginTop: 2, fontFamily: fonts.medium, fontSize: 11.5, color: colors.ink2 },
  noteMeta: { marginTop: 3, fontFamily: fonts.semibold, fontSize: 10.5, color: colors.ink3 },
  dur: { backgroundColor: colors.bg, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  durText: { fontFamily: fonts.bold, fontSize: 11, color: colors.ink2 },
  empty: { paddingTop: 36, paddingHorizontal: 12 },
  emptyTitle: { fontFamily: fonts.extra, fontSize: 18, color: colors.ink },
  emptyBody: { marginTop: 6, fontFamily: fonts.medium, fontSize: 14, color: colors.ink2, lineHeight: 20 },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: 18, backgroundColor: 'rgba(245,243,251,0.96)' },
  dockRow: { height: 96, alignItems: 'center', justifyContent: 'center' },
  side: { position: 'absolute', bottom: 22, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  sideLeft: { left: 28 },
  sideRight: { right: 28 },
  fab: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', shadowColor: '#5B4DFF', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
});
