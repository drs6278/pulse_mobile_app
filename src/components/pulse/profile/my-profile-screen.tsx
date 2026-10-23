import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Screen, TitleHeader } from '../ui';
import { ageLabels } from '@/lib/profile/types';
import { useAuth } from '@/providers/auth-provider';
import { useProfile } from '@/providers/profile-provider';
import { useFocusEffect } from 'expo-router';
import { ProfileAvatar, ProfileButton, ProfileLink, ProfileLoading, ProfileMessage, ProfileText, profileStyles as S } from './controls';

export function MyProfileScreen() {
  const { data, loading, error, refresh } = useProfile();
  const { session } = useAuth();
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  return <Screen header={<TitleHeader title="My profile" />}><View style={S.content}>
    {loading ? <ProfileLoading /> : error ? <><ProfileMessage text={error} error /><ProfileButton label="Try again" onPress={refresh} /></> : data?.public && <>
      <View style={S.card}><ProfileAvatar name={data.public.display_name} path={data.public.avatar_path} /><ProfileText title>{data.public.display_name}</ProfileText><ProfileText muted>{data.public.bio || 'Add a short bio to introduce yourself.'}</ProfileText>
        {data.private.profile_hidden && <ProfileMessage text="Your student profile is hidden by moderation. Account settings remain available." />}
        <ProfileLink href="/edit-profile" label="Edit profile" detail="Photo, name, bio, and private age eligibility" />
        {!data.private.profile_hidden && <ProfileLink href={{ pathname: '/student-profile', params: { id: data.public.user_id } }} label="View student profile" detail="See what other signed-in students can see" />}
      </View>
      <View style={S.card}><ProfileText title>Only you can see this</ProfileText><ProfileText muted>{session?.user.email}</ProfileText><ProfileText>Age eligibility: {ageLabels[data.private.age_band]}</ProfileText><ProfileText muted>Your email, age, schedule, and attendance history stay private.</ProfileText></View>
      <View style={S.card}><ProfileLink href="/settings" label="Account settings" detail="Security, preferences, and account controls" /><ProfileLink href="/schedule-settings" label="Schedule preferences and imports" /></View>
    </>}
  </View></Screen>;
}

export function AccountSettingsScreen() {
  const { data } = useProfile();
  return <Screen header={<TitleHeader title="Account settings" />}><View style={S.content}>
    <View style={S.card}><ProfileText title>Profile & privacy</ProfileText><ProfileLink href="/edit-profile" label="Edit profile and age eligibility" detail={data ? `${ageLabels[data.private.age_band]} · Age is private` : undefined} /><ProfileLink href="/blocked-users" label="Blocked students" detail="Review and unblock accounts" /><ProfileLink href="/schedule-settings" label="Schedule preferences and imports" /></View>
    <View style={S.card}><ProfileText title>Account security</ProfileText><ProfileLink href="/change-password" label="Change password" /><SignOutButton /></View>
    <View style={S.card}><ProfileText title>Delete account</ProfileText><ProfileText muted>Permanently remove your account, private files, and personally hosted events.</ProfileText><ProfileLink href="/delete-account" label="Delete my account" /></View>
  </View></Screen>;
}
export function SignOutButton() {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  async function submit() { setBusy(true); setError(null); try { const result = await signOut(); setError(result.error); } catch { setError('Unable to sign out. Try again.'); } finally { setBusy(false); } }
  return <View style={{ gap: 8 }}><ProfileMessage text={error} error /><ProfileButton label={busy ? 'Signing out…' : 'Sign out'} disabled={busy} onPress={() => void submit()} /></View>;
}
