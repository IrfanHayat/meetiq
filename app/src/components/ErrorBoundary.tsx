import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

type State = { error: Error | null };

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.warn('MeetIQ screen error', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.wrap}>
        <View style={styles.mark} />
        <Text style={styles.title}>MeetIQ hit a snag</Text>
        <Text style={styles.body}>Your notes are safe. Try again and we’ll reload this screen.</Text>
        <Pressable style={styles.button} onPress={() => this.setState({ error: null })}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  mark: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.accent, marginBottom: 20 },
  title: { fontFamily: fonts.extra, fontSize: 24, color: colors.ink, letterSpacing: -0.4 },
  body: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink2, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  button: { marginTop: 22, backgroundColor: colors.accent, borderRadius: 16, paddingHorizontal: 22, height: 52, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: fonts.bold, color: colors.white, fontSize: 15 },
});
