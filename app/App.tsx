import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { WaveMark } from './src/components/Logo';
import { TaskOverlay } from './src/components/Ui';
import { FoldersScreen } from './src/screens/FoldersScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { HelpScreen, LanguageScreen, PrivacyScreen } from './src/screens/InfoScreens';
import { NoteScreen } from './src/screens/NoteScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { PaywallScreen } from './src/screens/PaywallScreen';
import { RecordScreen } from './src/screens/RecordScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { showAppOpenIfAllowed } from './src/services/ads';
import { AppProvider, useApp } from './src/state/AppState';
import { colors, fonts } from './src/theme';
import { RootStackParamList } from './src/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function Splash({ message }: { message: string }) {
  return (
    <View style={styles.splash}>
      <View style={styles.blobA} />
      <View style={styles.blobB} />
      <View style={styles.splashBody}>
        <View style={styles.logoCard}>
          <WaveMark size={58} />
        </View>
        <Text style={styles.brand}>MeetIQ</Text>
        <Text style={styles.tag}>Transcribe Voice Notes</Text>
      </View>
      <SafeAreaView edges={['bottom']} style={styles.splashFoot}>
        <Text style={styles.splashMsg}>{message}</Text>
        <View style={styles.dots}>
          <View style={[styles.dot, { opacity: 0.4 }]} />
          <View style={[styles.dot, { opacity: 1 }]} />
          <View style={[styles.dot, { opacity: 0.4 }]} />
        </View>
      </SafeAreaView>
    </View>
  );
}

function Root() {
  const { ready, onboarded, bootMessage, task, user } = useApp();
  useEffect(() => {
    if (!ready || !onboarded) return;
    const timer = setTimeout(() => {
      void showAppOpenIfAllowed(Boolean(user?.isPremium));
    }, 600);
    return () => clearTimeout(timer);
  }, [ready, onboarded, user?.isPremium]);

  if (!ready) {
    return (
      <>
        <StatusBar style="light" />
        <Splash message={bootMessage} />
      </>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Stack.Navigator
        initialRouteName={onboarded ? 'Home' : 'Onboarding'}
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Record" component={RecordScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="Note" component={NoteScreen} />
        <Stack.Screen name="Folders" component={FoldersScreen} />
        <Stack.Screen name="Paywall" component={PaywallScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Language" component={LanguageScreen} />
        <Stack.Screen name="Privacy" component={PrivacyScreen} />
        <Stack.Screen name="Help" component={HelpScreen} />
      </Stack.Navigator>
      <TaskOverlay label={task} />
    </NavigationContainer>
  );
}

export default function App() {
  useFonts({
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.fill}>
        <SafeAreaProvider>
          <AppProvider>
            <Root />
          </AppProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  splash: { flex: 1, backgroundColor: '#5B4DFF' },
  blobA: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(255,255,255,0.1)', top: -80, right: -70 },
  blobB: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(50,20,140,0.25)', bottom: 80, left: -90 },
  splashBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoCard: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  brand: { fontFamily: fonts.extra, fontSize: 40, color: '#fff', letterSpacing: -1.5 },
  tag: { marginTop: 10, fontFamily: fonts.medium, fontSize: 16, color: 'rgba(255,255,255,0.88)' },
  splashFoot: { alignItems: 'center', paddingBottom: 28 },
  splashMsg: { fontFamily: fonts.semibold, fontSize: 13, color: 'rgba(255,255,255,0.86)', marginBottom: 12 },
  dots: { flexDirection: 'row', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 7, backgroundColor: '#fff' },
});
