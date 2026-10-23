import { Image } from 'expo-image';
import { useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Link, type Href } from 'expo-router';
import { PulseColors as C, PulseFonts } from '@/constants/pulse-theme';
import { profileInitials } from '@/lib/profile/types';
import { useAuth } from '@/providers/auth-provider';

export const profileStyles = StyleSheet.create({
  content: { padding: 20, gap: 20, paddingBottom: 36 },
  card: { padding: 18, borderRadius: 20, backgroundColor: C.surface, gap: 14, borderWidth: 1, borderColor: C.border },
  row: { minHeight: 56, paddingVertical: 14, gap: 4, justifyContent: 'center' },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#929BAA', borderRadius: 12, padding: 14, color: C.text, fontFamily: PulseFonts.regular, fontSize: 16 },
});
// Keep readable text and touch targets independent of the legacy phone scale.
export function ProfileText({ children, muted = false, title = false, pink = false }: PropsWithChildren<{ muted?: boolean; title?: boolean; pink?: boolean }>) {
  return <Text accessibilityRole={title ? 'header' : undefined} style={{ color: pink ? C.pink : muted ? '#AEB6C4' : C.text, fontFamily: title ? PulseFonts.black : PulseFonts.semibold, fontSize: title ? 24 : 15, lineHeight: title ? 33 : 23, flexShrink: 1 }}>{children}</Text>;
}
export function ProfileButton({ label, onPress, disabled = false, primary = false, danger = false }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minWidth: 48, minHeight: 52, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: danger || primary ? C.pink : '#929BAA', backgroundColor: primary ? C.pink : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: disabled || pressed ? 0.55 : 1 })}>
    <Text style={{ color: primary ? C.background : danger ? C.pink : C.text, fontFamily: PulseFonts.semibold, fontSize: 15, lineHeight: 22 }}>{label}</Text>
  </Pressable>;
}
export function ProfileLink({ href, label, detail }: { href: Href; label: string; detail?: string }) {
  return <Link href={href} asChild><Pressable accessibilityRole="link" accessibilityLabel={detail ? `${label}. ${detail}` : label} style={profileStyles.row}><ProfileText>{label} ›</ProfileText>{detail && <ProfileText muted>{detail}</ProfileText>}</Pressable></Link>;
}
export function ProfileField({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return <View style={{ gap: 8 }}><ProfileText>{label}</ProfileText><TextInput accessibilityLabel={label} placeholderTextColor="#AEB6C4" style={profileStyles.input} {...props} />{error && <ProfileMessage text={error} error />}</View>;
}
export function ProfileMessage({ text, error = false }: { text?: string | null; error?: boolean }) {
  return text ? <View accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite"><ProfileText pink={error} muted={!error}>{text}</ProfileText></View> : null;
}
export function ProfileLoading({ label = 'Loading profile' }: { label?: string }) {
  return <View style={{ padding: 24, gap: 12 }}><ActivityIndicator accessibilityLabel={label} color={C.pink} /><ProfileText muted>{label}…</ProfileText></View>;
}
export function ProfileAvatar({ name, path, preview }: { name: string; path: string | null; preview?: string }) {
  const { session } = useAuth();
  const [failed, setFailed] = useState<string | null>(null);
  const key = preview ?? `${session?.user.id}:${path}`;
  const source = preview ? { uri: preview } : path && session ? {
    uri: `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/profile-avatars/${path.split('/').map(encodeURIComponent).join('/')}`,
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' },
  } : null;
  return <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: C.background, borderWidth: 2, borderColor: C.pink, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
    {source && failed !== key ? <Image key={key} source={source} cachePolicy="none" recyclingKey={key} contentFit="cover" accessibilityLabel={`${name}'s profile photo`} onError={() => setFailed(key)} style={{ width: 96, height: 96 }} /> : <Text accessibilityLabel={`${name}'s initials`} style={{ color: C.pink, fontFamily: PulseFonts.black, fontSize: 28 }}>{profileInitials(name)}</Text>}
  </View>;
}
