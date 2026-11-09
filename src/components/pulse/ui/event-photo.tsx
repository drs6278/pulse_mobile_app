import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PulseColors as C, PulseGradients } from '@/constants/pulse-theme';
import { eventPhotoSource } from '@/lib/event-photo';
import { useAuth } from '@/providers/auth-provider';

// Decorative: the surrounding link or heading carries the event's name.
export function EventPhoto({ path, uri, scrim = false, style }: { path?: string | null; uri?: string; scrim?: boolean; style?: StyleProp<ViewStyle> }) {
  const { session } = useAuth();
  const [failed, setFailed] = useState<string | null>(null);
  const key = uri ?? path ?? '';
  const source = uri ? { uri } : path && session ? eventPhotoSource(path, session) : null;
  return <View pointerEvents="none" style={[{ overflow: 'hidden', backgroundColor: C.surfaceRaised }, style]}>
    {source && failed !== key && <Image source={source} recyclingKey={key} cachePolicy="memory-disk" contentFit="cover" transition={150} accessible={false} onError={() => setFailed(key)} style={StyleSheet.absoluteFill} />}
    {scrim && <LinearGradient colors={PulseGradients.card} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />}
  </View>;
}
