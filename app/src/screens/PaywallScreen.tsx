import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadPlans, purchasePlan, purchasesAvailable, restorePurchases, StorePlan } from '../services/purchases';
import { useApp } from '../state/AppState';
import { colors, fonts } from '../theme';
import { RootStackParamList } from '../types';

const FREE = [
  { ok: true, text: '100 transcription minutes' },
  { ok: true, text: 'AI summary & chat' },
  { ok: false, text: 'Contains ads' },
  { ok: false, text: 'Limited file imports' },
];
const PREMIUM = [
  { ok: true, text: '1,200 minutes every month' },
  { ok: true, text: 'AI summary & chat' },
  { ok: true, text: '100% ad-free' },
  { ok: true, text: 'Unlimited imports' },
];

export function PaywallScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Paywall'>) {
  const { syncPremium, unlockWithAd, user } = useApp();
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('annual');
  const [plans, setPlans] = useState<{ monthly: StorePlan | null; annual: StorePlan | null }>({ monthly: null, annual: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    loadPlans()
      .then((next) => {
        if (alive) setPlans(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const annualPer = plans.annual?.perMonthLabel || '$7.50';
  const annualBilled = plans.annual?.billedLabel || 'Billed $90 once a year';
  const monthlyPrice = plans.monthly?.priceString || '$9.99';
  const selected = cycle === 'annual' ? plans.annual : plans.monthly;

  const buy = async () => {
    if (!purchasesAvailable()) {
      Alert.alert('Purchases unavailable', 'Premium billing isn’t configured on this build yet.');
      return;
    }
    if (!selected) {
      Alert.alert('Plan unavailable', 'The store hasn’t returned this plan yet. Try again in a moment.');
      return;
    }
    setBusy(true);
    try {
      const result = await purchasePlan(selected);
      if (result.status === 'cancelled') return;
      if (result.status === 'failed' || !result.entitlement) {
        Alert.alert('Purchase failed', result.message || 'Please try again.');
        return;
      }
      await syncPremium(result.entitlement);
      Alert.alert('You’re Premium', 'Ads are off and you have 1,200 minutes this month.');
      navigation.goBack();
    } catch {
      Alert.alert('Purchase failed', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const entitlement = await restorePurchases();
      if (!entitlement) {
        Alert.alert('Nothing to restore', 'No previous Premium purchase was found for this device.');
        return;
      }
      await syncPremium(entitlement);
      Alert.alert(entitlement.isPremium ? 'Premium restored' : 'No active plan', entitlement.isPremium ? 'Your subscription is active on this device.' : 'This store account doesn’t have an active plan.');
      if (entitlement.isPremium) navigation.goBack();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.top}>
          <Pressable style={styles.icon} onPress={() => navigation.goBack()}>
            <Feather name="x" size={18} color={colors.ink} />
          </Pressable>
          <Pressable onPress={() => navigation.goBack()}><Text style={styles.notNow}>Not now</Text></Pressable>
        </View>
        <View style={styles.hero}>
          <LinearGradient colors={['#F7D277', '#E8A424']} style={styles.crown}>
            <MaterialCommunityIcons name="crown" size={28} color="#7A4E00" />
          </LinearGradient>
          <Text style={styles.h1}>Go Premium</Text>
          <Text style={styles.lead}>More minutes, no ads, and unlimited audio imports — keep every meeting in one place.</Text>
        </View>
        <View style={styles.toggle}>
          <Pressable style={[styles.toggleItem, cycle === 'monthly' && styles.toggleOn]} onPress={() => setCycle('monthly')}>
            <Text style={[styles.toggleText, cycle === 'monthly' && styles.toggleTextOn]}>Monthly</Text>
          </Pressable>
          <Pressable style={[styles.toggleItem, cycle === 'annual' && styles.toggleOn]} onPress={() => setCycle('annual')}>
            <Text style={[styles.toggleText, cycle === 'annual' && styles.toggleTextOn]}>Yearly</Text>
            <Text style={styles.save}>SAVE 25%</Text>
          </Pressable>
        </View>
        <View style={styles.compare}>
          <PlanCard title="Free" price="100" unit="min total" items={FREE} />
          <PlanCard title="Premium" price="1,200" unit="min / mo" items={PREMIUM} recommended />
        </View>
        <View style={styles.priceBox}>
          <View>
            <Text style={styles.planName}>{cycle === 'annual' ? 'Yearly plan' : 'Monthly plan'}</Text>
            <Text style={styles.planMeta}>{cycle === 'annual' ? annualBilled : `Billed ${monthlyPrice} every month`}</Text>
          </View>
          <Text style={styles.amt}>{cycle === 'annual' ? annualPer : monthlyPrice}<Text style={styles.amtUnit}> / month</Text></Text>
        </View>
        <Pressable disabled={busy} onPress={() => void buy()} style={busy && { opacity: 0.7 }}>
          <LinearGradient colors={['#6C61FF', '#5340F0']} style={styles.cta}>
            <Text style={styles.ctaText}>{user?.isPremium ? 'Premium is active' : 'Upgrade to Premium'}</Text>
          </LinearGradient>
        </Pressable>
        {!user?.isPremium ? (
          <Pressable style={styles.reward} onPress={() => void unlockWithAd()}>
            <Text style={styles.rewardText}>Watch an ad for +10 free minutes</Text>
          </Pressable>
        ) : null}
        <Text style={styles.legal}>
          Or {monthlyPrice} per month, billed monthly.{'\n'}
          <Text style={styles.link} onPress={() => void restore()}>Restore purchase</Text>
          {'  ·  '}
          <Text style={styles.link} onPress={() => navigation.navigate('Privacy')}>Terms & Privacy</Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PlanCard({ title, price, unit, items, recommended }: { title: string; price: string; unit: string; items: { ok: boolean; text: string }[]; recommended?: boolean }) {
  return (
    <View style={[styles.plan, recommended && styles.planRec]}>
      {recommended ? <Text style={styles.badge}>BEST</Text> : null}
      <Text style={styles.planTitle}>{title}</Text>
      <Text style={styles.planPrice}>{price} <Text style={styles.planUnit}>{unit}</Text></Text>
      {items.map((item) => (
        <View key={item.text} style={styles.li}>
          <Feather name={item.ok ? 'check' : 'x'} size={12} color={item.ok ? colors.good : colors.danger} />
          <Text style={styles.liText}>{item.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 20, paddingBottom: 28 },
  top: { height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  notNow: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink2 },
  hero: { alignItems: 'center', paddingBottom: 8 },
  crown: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  h1: { fontFamily: fonts.extra, fontSize: 24, color: colors.ink, letterSpacing: -0.5 },
  lead: { marginTop: 6, textAlign: 'center', fontFamily: fonts.medium, fontSize: 13, color: colors.ink2, lineHeight: 18 },
  toggle: { marginTop: 12, marginBottom: 16, alignSelf: 'center', width: 240, backgroundColor: '#ECEAF6', borderRadius: 12, padding: 3, flexDirection: 'row' },
  toggleItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 10 },
  toggleOn: { backgroundColor: colors.white },
  toggleText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.ink2 },
  toggleTextOn: { color: colors.ink },
  save: { position: 'absolute', top: -10, right: 4, backgroundColor: colors.good, color: '#fff', fontFamily: fonts.extra, fontSize: 9, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  compare: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  plan: { flex: 1, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.line, borderRadius: 16, padding: 12 },
  planRec: { borderColor: colors.accent, backgroundColor: '#F7F5FF' },
  badge: { position: 'absolute', top: -9, right: 10, backgroundColor: colors.accent, color: '#fff', fontFamily: fonts.extra, fontSize: 9, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  planTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  planPrice: { fontFamily: fonts.extra, fontSize: 18, color: colors.ink, marginVertical: 6 },
  planUnit: { fontFamily: fonts.semibold, fontSize: 11, color: colors.ink3 },
  li: { flexDirection: 'row', gap: 6, marginBottom: 6, alignItems: 'flex-start' },
  liText: { flex: 1, fontFamily: fonts.medium, fontSize: 11.5, color: '#2A2440', lineHeight: 15 },
  priceBox: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planName: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  planMeta: { fontFamily: fonts.medium, fontSize: 12, color: colors.ink2, marginTop: 2 },
  amt: { fontFamily: fonts.extra, fontSize: 20, color: colors.ink },
  amtUnit: { fontFamily: fonts.semibold, fontSize: 11, color: colors.ink3 },
  cta: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#fff', fontFamily: fonts.bold, fontSize: 15 },
  reward: { marginTop: 12, alignItems: 'center' },
  rewardText: { fontFamily: fonts.bold, fontSize: 13, color: colors.accent },
  legal: { textAlign: 'center', marginTop: 10, fontFamily: fonts.medium, fontSize: 11, color: colors.ink3, lineHeight: 17 },
  link: { color: colors.accent, fontFamily: fonts.bold },
});
