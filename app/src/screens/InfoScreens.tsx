import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { explainError } from '../services/feedback';
import { useApp } from '../state/AppState';
import { colors, fonts, LANGUAGES } from '../theme';
import { RootStackParamList } from '../types';

function Page({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
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

export function LanguageScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Language'>) {
  const { user, setLanguage } = useApp();
  return (
    <Page title="Language" onBack={() => navigation.goBack()}>
      <ScrollView>
        {LANGUAGES.map((language) => {
          const on = (user?.language || 'en') === language.code;
          return (
            <Pressable
              key={language.code}
              style={styles.lang}
              onPress={() => {
                setLanguage(language.code)
                  .then(() => navigation.goBack())
                  .catch((err) => Alert.alert('Couldn’t save', explainError(err, 'Try again when you’re online.')));
              }}
            >
              <Text style={styles.langText}>{language.label}</Text>
              {on ? <Feather name="check" size={18} color={colors.accent} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </Page>
  );
}

export function PrivacyScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Privacy'>) {
  return (
    <Page title="Privacy & data" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={styles.copy}>
        <Text style={styles.h}>Device account</Text>
        <Text style={styles.p}>MeetIQ signs you in with this device’s ID. There is no email or password. Anyone with this ID on a signed-in app can open the same notes, so don’t share the ID.</Text>
        <Text style={styles.h}>Audio</Text>
        <Text style={styles.p}>Recordings and imported files are sent to the MeetIQ server so they can be transcribed. The server does not keep the audio file after the transcript is created. Playback uses the copy that stays on this phone.</Text>
        <Text style={styles.h}>AI</Text>
        <Text style={styles.p}>Transcripts are processed by Groq to create text, summaries, and chat replies. Don’t record anything you wouldn’t want sent to that service.</Text>
        <Text style={styles.h}>Purchases and ads</Text>
        <Text style={styles.p}>Premium is billed by Google Play through RevenueCat. Free accounts may see AdMob ads. Premium removes ads and raises the monthly minute allowance to 1,200.</Text>
      </ScrollView>
    </Page>
  );
}

export function HelpScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Help'>) {
  return (
    <Page title="Help & about" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={styles.copy}>
        <Text style={styles.h}>Record</Text>
        <Text style={styles.p}>Tap the microphone, speak, then stop. MeetIQ uploads the M4A file, transcribes it, and opens the summary.</Text>
        <Text style={styles.h}>Import</Text>
        <Text style={styles.p}>From Folders, or the upload button on Home, choose an MP3, M4A, WAV, or AAC file up to 25 MB.</Text>
        <Text style={styles.h}>Chat</Text>
        <Text style={styles.p}>Open a note, switch to Chat, and ask about decisions, owners, or a recap. Answers stay inside that transcript.</Text>
        <Text style={styles.h}>Minutes</Text>
        <Text style={styles.p}>Free includes 100 minutes total, plus 10 minutes each time a reward ad finishes. Premium includes 1,200 minutes every month. If the server is asleep, wait a few seconds and tap retry.</Text>
        <Text style={styles.p}>MeetIQ 1.0.0</Text>
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.extra, fontSize: 22, color: colors.ink, letterSpacing: -0.4 },
  lang: { marginHorizontal: 20, marginBottom: 8, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' },
  langText: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  copy: { paddingHorizontal: 22, paddingBottom: 32 },
  h: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, marginTop: 12, marginBottom: 4 },
  p: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 21, color: colors.ink2 },
});
