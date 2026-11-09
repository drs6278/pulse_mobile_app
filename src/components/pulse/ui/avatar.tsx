import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

import { PulseColors as C, PulseFonts } from '@/constants/pulse-theme';
import { profileInitials } from '@/lib/profile/types';
import { useAuth } from '@/providers/auth-provider';
import { PulseText } from './text';

export function Avatar({ name, path, preview, size = 96 }: { name: string; path: string | null; preview?: string; size?: number }) {
  const { session } = useAuth();
  const [failed, setFailed] = useState<string | null>(null);
  const key = preview ?? `${session?.user.id}:${path}`;
  const source = preview ? { uri: preview } : path && session ? {
    uri: `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/profile-avatars/${path.split('/').map(encodeURIComponent).join('/')}`,
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' },
  } : null;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.surfaceRaised, borderWidth: 1, borderColor: C.border, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
    {source && failed !== key
      ? <Image key={key} source={source} cachePolicy="none" recyclingKey={key} contentFit="cover" accessibilityLabel={`${name}'s profile photo`} onError={() => setFailed(key)} style={{ width: size, height: size }} />
      : <View accessible accessibilityLabel={`${name}'s initials`}><PulseText tone="accent" style={{ fontFamily: PulseFonts.black, fontSize: size * 0.3, lineHeight: size * 0.38 }}>{profileInitials(name)}</PulseText></View>}
  </View>;
}
