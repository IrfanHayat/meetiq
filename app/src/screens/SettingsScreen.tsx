import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDeviceId } from '../format';
import { restorePurchases } from '../services/purchases';
import { explainError } from '../services/feedback';
import { useApp } from '../state/AppState';
import { colors, fonts, languageLabel } from '../theme';
import { RootStackParamList } from '../types';

export function SettingsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Settings'>) {
  const { user, deviceId, setNotifications, syncPremium, offline, retryConnection } = useApp();
  const used = user?.usage.usedMinutes ?? 0;
  const allowance = user?.usage.allowanceMinutes ?? 100;
  const ratio = allowance > 0 ? Math.min(1, used / allowance) : 0;
  const displayId = formatDeviceId(user?.deviceId || deviceId || 'device');

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(displayId);
      Alert.alert('Copied', 'Device ID copied.');
    } catch {
      Alert.alert('Couldn’t copy', 'Select the ID and copy it from your device.');
    }
  };

  const restore = async () => {
    try {
      const entitlement = await restorePurchases();
      if (!entitlement) {
        Alert.alert('Nothing to restore', 'Purchases aren’t available, or this device has no previous plan.');
        return;
      }
      await syncPremium(entitlement);
      Alert.alert(entitlement.isPremium ? 'Premium restored' : 'No active plan', entitlement.isPremium ? 'Premium is active on this device.' : 'No active subscription was found.');
    } catch (err) {
      Alert.alert('Restore failed', explainError(err, 'Try again.'));
    }
  };

  const toggleNotifications = () => {
    const next = !(user?.notificationsEnabled ?? true);
    setNotifications(next).catch((err) => Alert.alert('Couldn’t update', explainError(err, 'Try again when you’re online.')));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}><Feather name="chevron-left" size={22} color={colors.ink} /></Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.acct}>
          <View style={styles.avatar}><Feather name="smartphone" size={22} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.acctTitle}>This device</Text>
            <Text style={styles.did}>ID  {displayId}</Text>
            <Text style={styles.auto}>{offline ? 'Saved on this phone' : 'Signed in automatically'}</Text>
          </View>
          <Pressable style={styles.copy} onPress={() => void copy()}><Feather name="copy" size={15} color={colors.ink2} /></Pressable>
        </View>
        <View style={styles.usage}>
          <View style={styles.usageTop}>
            <Text style={styles.usageTitle}>Usage this plan</Text>
            <Text style={styles.usageAmt}>{Math.round(used)} / {allowance} min</Text>
          </View>
          <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.round(ratio * 100)}%` }]} /></View>
          <Text style={styles.usageBody}>
            {user?.isPremium
              ? 'Premium · 1,200 minutes refresh every month.'
              : `Free plan · ${Math.max(0, Math.floor(user?.usage.remainingMinutes ?? 100))} minutes left. Upgrade for 1,200 min every month.`}
          </Text>
        </View>
        <View style={styles.group}>
          <Row icon="globe" tint="#EEECFF" color={colors.accent} label="Transcription language" value={languageLabel(user?.language)} onPress={() => navigation.navigate('Language')} />
          <Row icon="star" tint="#FFF4DE" color={colors.goldDeep} label="Upgrade to Premium" onPress={() => navigation.navigate('Paywall')} />
          <Row icon="rotate-ccw" tint="#E8F8F1" color={colors.good} label="Restore purchase" onPress={() => void restore()} />
        </View>
        <View style={styles.group}>
          <Row icon="bell" label="Notifications" value={user?.notificationsEnabled === false ? 'Off' : 'On'} onPress={toggleNotifications} />
          <Row icon="shield" label="Privacy & data" onPress={() => navigation.navigate('Privacy')} />
          <Row icon="info" label="Help & about" onPress={() => navigation.navigate('Help')} />
        </View>
        {offline ? <Pressable onPress={() => void retryConnection()}><Text style={styles.retry}>Retry connection</Text></Pressable> : null}
        <Text style={styles.ver}>MeetIQ 1.1.0 · Device-ID account</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, value, onPress, tint = '#EEEFF3', color = colors.ink2 }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; value?: string; onPress: () => void; tint?: string; color?: string }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.rowIcon, { backgroundColor: tint }]}><Feather name={icon} size={16} color={color} /></View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
      <Feather name="chevron-right" size={16} color={colors.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.extra, fontSize: 24, color: colors.ink, letterSpacing: -0.6 },
  acct: { marginHorizontal: 20, marginBottom: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  acctTitle: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.ink },
  did: { fontFamily: fonts.semibold, fontSize: 12, color: colors.ink2, marginTop: 2 },
  auto: { fontFamily: fonts.bold, fontSize: 11, color: colors.good, marginTop: 3 },
  copy: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  usage: { marginHorizontal: 20, marginBottom: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 14 },
  usageTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  usageTitle: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink },
  usageAmt: { fontFamily: fonts.bold, fontSize: 12, color: colors.accent },
  bar: { height: 8, backgroundColor: '#ECEAF6', borderRadius: 99, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 99 },
  usageBody: { marginTop: 8, fontFamily: fonts.medium, fontSize: 12, color: colors.ink2 },
  group: { marginHorizontal: 20, marginBottom: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  rowValue: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink3 },
  retry: { textAlign: 'center', fontFamily: fonts.bold, color: colors.accent, marginBottom: 8 },
  ver: { textAlign: 'center', fontFamily: fonts.medium, fontSize: 11.5, color: colors.ink3, paddingVertical: 8 },
});
