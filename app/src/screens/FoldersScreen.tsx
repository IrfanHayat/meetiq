import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatMinutes } from '../format';
import { useImport } from '../hooks/useImport';
import { explainError } from '../services/feedback';
import { useApp } from '../state/AppState';
import { colors, folderVisual, fonts } from '../theme';
import { RootStackParamList } from '../types';

const COLORS = ['#5B4DFF', '#D99212', '#0E9F6E', '#E24747', '#7A5CFF'];

export function FoldersScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Folders'>) {
  const { folders, unfiled, createFolder, deleteFolder } = useApp();
  const importAudio = useImport(navigation);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createFolder(trimmed, color);
      setName('');
      setOpen(false);
    } catch (err) {
      Alert.alert('Couldn’t create folder', explainError(err, 'Try again.'));
    }
  };

  const rows = [...folders, ...(unfiled ? [unfiled] : [])];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Feather name="chevron-left" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Folders</Text>
        <Pressable style={styles.add} onPress={() => setOpen(true)}>
          <Feather name="plus" size={14} color={colors.accentDeep} />
          <Text style={styles.addText}>New folder</Text>
        </Pressable>
      </View>
      <Pressable style={styles.import} onPress={() => void importAudio(null)}>
        <View style={styles.importIcon}>
          <Feather name="upload" size={22} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.importTitle}>Import audio</Text>
          <Text style={styles.importBody}>Transcribe a file from your phone</Text>
          <View style={styles.fmts}>
            {['MP3', 'M4A', 'WAV', 'AAC'].map((fmt) => (
              <Text key={fmt} style={styles.fmt}>{fmt}</Text>
            ))}
          </View>
        </View>
      </Pressable>
      <Text style={styles.lab}>Your folders</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {rows.map((folder) => {
          const visual = folderVisual(folder.icon, folder.color);
          const minutes = (folder.durationSeconds || 0) / 60;
          return (
            <Pressable
              key={folder.id || 'unfiled'}
              style={styles.folder}
              onPress={() => navigation.navigate('Home', { folderId: folder.id })}
              onLongPress={() => {
                if (!folder.id) return;
                Alert.alert(folder.name, 'Remove this folder? Notes inside become unfiled.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => void deleteFolder(folder.id as string).catch((err) => Alert.alert('Couldn’t delete', explainError(err, 'Try again.'))) },
                ]);
              }}
            >
              <View style={[styles.fic, { backgroundColor: visual.bg }]}>
                <Feather name={visual.ion} size={18} color={visual.fg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.folderName}>{folder.name}</Text>
                <Text style={styles.folderMeta}>{folder.noteCount} notes · {formatMinutes(minutes)}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.ink3} />
            </Pressable>
          );
        })}
      </ScrollView>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>New folder</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Folder name" placeholderTextColor={colors.ink3} style={styles.input} />
            <View style={styles.colors}>
              {COLORS.map((item) => (
                <Pressable key={item} onPress={() => setColor(item)} style={[styles.swatch, { backgroundColor: item }, color === item && styles.swatchOn]} />
              ))}
            </View>
            <Pressable style={styles.save} onPress={() => void save()}><Text style={styles.saveText}>Create folder</Text></Pressable>
            <Pressable onPress={() => setOpen(false)}><Text style={styles.cancel}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: fonts.extra, fontSize: 24, color: colors.ink, letterSpacing: -0.6 },
  add: { height: 32, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: '#DDD9FF', flexDirection: 'row', alignItems: 'center', gap: 4 },
  addText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.accentDeep },
  import: { marginHorizontal: 20, marginBottom: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C8C0EE', backgroundColor: '#F3F1FF', borderRadius: 18, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center' },
  importIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  importTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  importBody: { fontFamily: fonts.medium, fontSize: 12, color: colors.ink2, marginTop: 2 },
  fmts: { flexDirection: 'row', gap: 6, marginTop: 8 },
  fmt: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.accentDeep, backgroundColor: colors.white, borderWidth: 1, borderColor: '#DDD9FF', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  lab: { paddingHorizontal: 20, paddingBottom: 8, fontFamily: fonts.bold, fontSize: 12, color: colors.ink3, letterSpacing: 0.8 },
  list: { paddingHorizontal: 20, gap: 8, paddingBottom: 24 },
  folder: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  fic: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  folderName: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.ink },
  folderMeta: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.ink3, marginTop: 1 },
  modal: { flex: 1, backgroundColor: 'rgba(22,17,38,0.35)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 16 },
  cardTitle: { fontFamily: fonts.extra, fontSize: 18, color: colors.ink, marginBottom: 12 },
  input: { height: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, fontFamily: fonts.medium, color: colors.ink },
  colors: { flexDirection: 'row', gap: 10, marginVertical: 14 },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  swatchOn: { borderWidth: 2, borderColor: colors.ink },
  save: { height: 46, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontFamily: fonts.bold },
  cancel: { textAlign: 'center', marginTop: 12, fontFamily: fonts.semibold, color: colors.ink2 },
});
