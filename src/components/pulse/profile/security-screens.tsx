import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useUserResource } from '@/hooks/use-user-resource';
import { invokeProfileFunction, profileError, profileSessionClient } from '@/lib/profile/repository';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { Screen, TitleHeader } from '../ui';
import { ProfileButton, ProfileField, ProfileLink, ProfileLoading, ProfileMessage, ProfileText, profileStyles as S } from './controls';

export function ChangePasswordScreen() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [nonce, setNonce] = useState('');
  const [showPassword, setShowPassword] = useState(false), [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [done, setDone] = useState(false);
  async function sendCode() {
    setBusy(true); setError(null);
    try { const result = await supabase.auth.reauthenticate(); if (result.error) throw result.error; setNeedsCode(true); setNotice('Check your account email for a verification code.'); }
    catch (value) { setError(profileError(value)); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!currentPassword) { setError('Enter your current password.'); return; }
    if (!password) { setError('Enter a new password.'); return; }
    if (password !== confirmation) { setError('The passwords do not match.'); return; }
    if (needsCode && !nonce.trim()) { setError('Enter the verification code from your email.'); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await supabase.auth.updateUser({ password, current_password: currentPassword, ...(nonce.trim() ? { nonce: nonce.trim() } : {}) });
      if (result.error) {
        if (result.error.code === 'reauthentication_needed' || result.error.code === 'reauthentication_not_valid') setNeedsCode(true);
        throw result.error;
      }
      setCurrentPassword(''); setPassword(''); setConfirmation(''); setNonce(''); setDone(true);
    } catch (value) { setError(profileError(value)); }
    finally { setBusy(false); }
  }
  return <Screen header={<TitleHeader title="Change password" />}><View style={S.content}>
    {done ? <View style={S.card}><ProfileText title>Password changed</ProfileText><ProfileText muted>Your new password is ready to use.</ProfileText><ProfileButton label="Done" primary onPress={() => router.replace('/settings')} /></View> : <>
      <ProfileText muted>Use a long, unique password. Password managers and pasted passwords are supported. Your account’s security policy is checked when you save.</ProfileText>
      <ProfileField label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry={!showPassword} autoComplete="current-password" textContentType="password" autoCapitalize="none" autoCorrect={false} editable={!busy} />
      <ProfileField label="New password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoComplete="new-password" textContentType="newPassword" autoCapitalize="none" autoCorrect={false} editable={!busy} />
      <ProfileField label="Confirm new password" value={confirmation} onChangeText={setConfirmation} secureTextEntry={!showPassword} autoComplete="new-password" textContentType="newPassword" autoCapitalize="none" autoCorrect={false} editable={!busy} />
      <ProfileButton label={showPassword ? 'Hide passwords' : 'Show passwords'} disabled={busy} onPress={() => setShowPassword(value => !value)} />
      {needsCode && <View style={S.card}><ProfileText>Verify your identity to continue.</ProfileText><ProfileButton label="Send verification code" disabled={busy} onPress={() => void sendCode()} /><ProfileField label="Email verification code" value={nonce} onChangeText={setNonce} autoComplete="one-time-code" textContentType="oneTimeCode" autoCapitalize="none" editable={!busy} /></View>}
      <ProfileMessage text={notice} /><ProfileMessage text={error} error /><ProfileButton label={busy ? 'Updating password…' : 'Save new password'} primary disabled={busy} onPress={() => void save()} />
    </>}
  </View></Screen>;
}

export function DeleteAccountScreen() {
  const { signOut, session } = useAuth();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const loader = useCallback(async (_user: string, signal: AbortSignal) => {
    const { data, error } = await supabase.rpc('profile_deletion_preview').abortSignal(signal);
    if (error) throw new Error(profileError(error));
    return data as { hosted_events: number; schedule_entries: number };
  }, []);
  const preview = useUserResource(loader);
  const [confirming, setConfirming] = useState(false), [password, setPassword] = useState(''), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [accepted, setAccepted] = useState(false);
  async function submit() {
    if (!password) { setError('Enter your current password to verify this request.'); return; }
    setBusy(true); setError(null);
    try {
      await invokeProfileFunction(profileSessionClient(session?.access_token), 'profile-account', { password });
      if (!mounted.current) return;
      setPassword(''); setAccepted(true);
      // Clear locally even if the server has already revoked this session.
      await supabase.auth.signOut({ scope: 'local' });
      router.replace({ pathname: '/login', params: { notice: 'deletion-requested' } });
    } catch (value) { setError(value instanceof Error ? value.message : 'Unable to request deletion.'); }
    finally { setBusy(false); }
  }
  return <Screen header={<TitleHeader title="Delete account" />}><View style={S.content}>
    {accepted ? <><ProfileText title>Deletion requested</ProfileText><ProfileText muted>Your account is locked. Deletion normally completes within 24 hours.</ProfileText><ProfileButton label="Return to sign in" onPress={() => void signOut()} /></> : <>
      <View style={S.card}><ProfileText title>Permanently leave Pulse?</ProfileText><ProfileText muted>This removes your profile, photos, private schedules, source uploads, and RSVPs. Personally hosted events and their RSVPs are cancelled and removed. Other students’ accounts and shared club content are preserved.</ProfileText>
        {preview.loading ? <ProfileLoading label="Checking account data" /> : preview.error ? <><ProfileMessage text={preview.error} error /><ProfileButton label="Try again" onPress={preview.refresh} /></> : <><ProfileText>{preview.data?.hosted_events ?? 0} hosted events</ProfileText><ProfileText>{preview.data?.schedule_entries ?? 0} schedule entries</ProfileText></>}
        <ProfileText muted>If you administer a club, administration transfers to another active member. A club with only inactive members needs an administrator to resolve ownership first. A club with no other members is removed.</ProfileText>
        <ProfileText muted>Your access ends when the request is accepted. Deletion normally completes within 24 hours. Minimal moderation audit records remain; deletion retry records expire after 30 days. Backup expiry follows the Pulse operator’s retention policy.</ProfileText>
      </View>
      {confirming ? <View style={S.card}><ProfileText title>Confirm account deletion</ProfileText><ProfileField label="Current password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" autoCapitalize="none" autoCorrect={false} editable={!busy} /><ProfileButton label={busy ? 'Requesting deletion…' : 'Permanently delete my account'} danger disabled={busy} onPress={() => void submit()} /><ProfileButton label="Keep my account" disabled={busy} onPress={() => { setConfirming(false); setPassword(''); setError(null); }} /></View> : <ProfileButton label="Continue to account deletion" danger disabled={preview.loading || !!preview.error} onPress={() => setConfirming(true)} />}
      <ProfileMessage text={error} error />
    </>}
  </View></Screen>;
}

export function AccountDeletionInformationScreen() {
  const { session } = useAuth();
  return <Screen header={<TitleHeader title="Pulse account deletion" />}><View style={S.content}><View style={S.card}>
    <ProfileText title>Delete your Pulse account</ProfileText><ProfileText muted>You can request permanent deletion here or in Pulse under My profile → Account settings → Delete my account.</ProfileText><ProfileText muted>Sign in, review the data that will be removed, and verify your current password. Your account is locked immediately after acceptance; deletion normally completes within 24 hours. This removes your profile, photos, private schedule files, RSVPs, and personally hosted events. Shared club content is preserved when there are other members. Minimal anonymized audit records and backups follow the published retention policy.</ProfileText>
    {session ? <ProfileLink href="/delete-account" label="Request account deletion" /> : <ProfileLink href={{ pathname: '/login', params: { returnTo: 'delete-account' } }} label="Sign in to delete my account" />}
  </View></View></Screen>;
}
