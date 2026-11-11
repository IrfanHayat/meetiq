import React from 'react';
import { StyleSheet, View } from 'react-native';

const BARS = [0.37, 0.79, 1, 0.68, 0.47];

export function WaveMark({ size = 58, color = '#5B4DFF', dot = true }: { size?: number; color?: string; dot?: boolean }) {
  const barW = size * 0.12;
  const gap = size * 0.07;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: size * 0.72, gap }}>
        {BARS.map((rel, index) => (
          <View
            key={index}
            style={{ width: barW, height: size * 0.66 * rel, borderRadius: barW, backgroundColor: color }}
          />
        ))}
      </View>
      {dot ? <View style={[styles.dot, { width: barW * 0.85, height: barW * 0.85, right: size * 0.08, top: size * 0.08 }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', borderRadius: 99, backgroundColor: '#F3B23C' },
});
