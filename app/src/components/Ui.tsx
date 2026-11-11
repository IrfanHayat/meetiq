import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [pressed && styles.pressed, disabled && styles.disabled]}>
      <LinearGradient colors={['#6C61FF', '#5340F0']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.button}>
        <Text style={styles.buttonText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function IconButton({ name, onPress, light = false }: { name: React.ComponentProps<typeof Feather>['name']; onPress: () => void; light?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={[styles.iconBtn, light && styles.iconBtnLight]}>
      <Feather name={name} size={18} color={light ? colors.white : colors.ink} />
    </Pressable>
  );
}

export function OfflineBanner({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <Pressable onPress={onRetry} style={styles.banner}>
      <Feather name="cloud-off" size={16} color={colors.accentDeep} />
      <Text style={styles.bannerText}>{message || 'Can’t reach MeetIQ. Tap to retry.'}</Text>
    </Pressable>
  );
}

export function TaskOverlay({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.overlayTitle}>{label}</Text>
        <Text style={styles.overlayBody}>This can take a minute if the server is waking up.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5B4DFF',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  buttonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 15 },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.55 },
  iconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconBtnLight: { backgroundColor: 'rgba(255,255,255,0.08)' },
  banner: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: colors.accentSoft,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bannerText: { flex: 1, color: colors.accentDeep, fontFamily: fonts.semibold, fontSize: 12.5 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(22,17,38,0.35)', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: 28 },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 22, width: '100%', alignItems: 'center' },
  overlayTitle: { marginTop: 12, fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  overlayBody: { marginTop: 6, fontFamily: fonts.medium, fontSize: 13, color: colors.ink2, textAlign: 'center' },
});
