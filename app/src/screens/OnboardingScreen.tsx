import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WaveMark } from '../components/Logo';
import { PrimaryButton } from '../components/Ui';
import { useApp } from '../state/AppState';
import { colors, fonts } from '../theme';
import { RootStackParamList } from '../types';

const FEATURES = [
  {
    title: 'Record & transcribe',
    body: 'Capture meetings, lectures, and ideas. Get accurate text as you speak, or import an audio file.',
    icon: 'mic' as const,
    bg: '#EEECFF',
    fg: colors.accent,
  },
  {
    title: 'AI summaries',
    body: 'Turn a one-hour meeting into key points and action items in seconds.',
    icon: 'file-text' as const,
    bg: '#FFF4DE',
    fg: colors.goldDeep,
  },
  {
    title: 'Chat with your notes',
    body: 'Ask questions, pull decisions, and draft follow-up emails from any transcript.',
    icon: 'message-circle' as const,
    bg: '#E8F8F1',
    fg: colors.good,
  },
];

export function OnboardingScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Onboarding'>) {
  const { completeOnboarding } = useApp();
  const go = async () => {
    await completeOnboarding();
    navigation.replace('Home');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Pressable onPress={() => void go()} hitSlop={8}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>
      <View style={styles.hero}>
        <LinearGradient colors={['#6C61FF', '#5340F0']} style={styles.logo}>
          <WaveMark size={34} color="#fff" dot={false} />
        </LinearGradient>
        <Text style={styles.title}>Your AI voice{'\n'}notebook</Text>
        <Text style={styles.sub}>Record, transcribe, summarize, and chat with every note — no account needed.</Text>
      </View>
      <View style={styles.features}>
        {FEATURES.map((feature) => (
          <View key={feature.title} style={styles.feat}>
            <View style={[styles.ic, { backgroundColor: feature.bg }]}>
              <Feather name={feature.icon} size={20} color={feature.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featTitle}>{feature.title}</Text>
              <Text style={styles.featBody}>{feature.body}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.pager}>
        <View style={[styles.dot, styles.dotOn]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>
      <PrimaryButton label="Get started" onPress={() => void go()} />
      <Text style={styles.hint}>No email or password. We’ll sign you in automatically with this device.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 22, paddingBottom: 12 },
  top: { height: 36, alignItems: 'flex-end', justifyContent: 'center' },
  skip: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink2 },
  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 16 },
  logo: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontFamily: fonts.extra, fontSize: 28, color: colors.ink, textAlign: 'center', letterSpacing: -0.8, lineHeight: 34 },
  sub: { marginTop: 8, fontFamily: fonts.medium, fontSize: 14, color: colors.ink2, textAlign: 'center', lineHeight: 20 },
  features: { gap: 12, flex: 1 },
  feat: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 14, flexDirection: 'row', gap: 14 },
  ic: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  featTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  featBody: { marginTop: 3, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17, color: colors.ink2 },
  pager: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  dot: { width: 7, height: 7, borderRadius: 99, backgroundColor: '#D4CDEA' },
  dotOn: { width: 18, backgroundColor: colors.accent },
  hint: { textAlign: 'center', marginTop: 10, fontFamily: fonts.medium, fontSize: 12, color: colors.ink3, lineHeight: 17 },
});
