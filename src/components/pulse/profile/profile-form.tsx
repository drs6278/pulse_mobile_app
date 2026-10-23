import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useProfile } from '@/providers/profile-provider';
import { useAuth } from '@/providers/auth-provider';
import { pickAvatar } from '@/lib/profile/pick-avatar';
import { invokeProfileFunction, loadOwnProfile, profileSessionClient, saveProfile } from '@/lib/profile/repository';
import { ageBands, ageLabels, validateProfile, type OwnProfile, type PickedAvatar, type ProfileDraft } from '@/lib/profile/types';
import { ProfileAvatar, ProfileButton, ProfileField, ProfileMessage, ProfileText, profileStyles as S } from './controls';
import { PulseColors as C } from '@/constants/pulse-theme';

export function ProfileForm({ initial, setup = false, onSaved }: { initial: OwnProfile; setup?: boolean; onSaved?: () => void }) {
  const [baseline, setBaseline] = useState(initial);
  const { mutate, userId } = useProfile();
  const { session } = useAuth();
  const profile = baseline.public!;
  const [draft, setDraft] = useState<ProfileDraft>({ display_name: profile.display_name, bio: profile.bio, age_band: setup ? null : baseline.private.age_band });
  const [avatar, setAvatar] = useState<PickedAvatar | null>(null), [removeAvatar, setRemoveAvatar] = useState(false);
  const avatarRef = useRef<PickedAvatar | null>(null), stagedPath = useRef<string | null>(null);
  const mounted = useRef(true);
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false);
  // Retry verification, rather than resubmitting an already committed version.
  const committed = useRef(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const busy = saving || verificationPending;
  const [showErrors, setShowErrors] = useState(false);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const dirty = !saved && (draft.display_name !== profile.display_name || draft.bio !== profile.bio || draft.age_band !== baseline.private.age_band || avatar !== null || removeAvatar);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; avatarRef.current?.dispose(); }; }, []);
  useEffect(() => { if (saved && !setup) router.replace('/profile'); }, [saved, setup]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const errors = showErrors ? validateProfile(draft) : {};
  async function choosePhoto() {
    setSaving(true); setError(null);
    try { const next = await pickAvatar(); if (next) { if (!mounted.current) { next.dispose(); return; } avatarRef.current?.dispose(); avatarRef.current = next; setAvatar(next); stagedPath.current = null; setRemoveAvatar(false); } }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to select photo.'); }
    finally { if (mounted.current) setSaving(false); }
  }
  async function save() {
    setShowErrors(true);
    if (Object.keys(validateProfile(draft)).length) return;
    setSaving(true); setError(null);
    try {
      const client = profileSessionClient(session?.access_token);
      await mutate(async () => {
        if (setup && committed.current) return;
        if (avatar && !stagedPath.current) {
          const result = await invokeProfileFunction<{ path: string }>(client, 'profile-avatar', avatar.bytes.slice().buffer as ArrayBuffer, avatar.mime);
          stagedPath.current = result.path;
        }
        await saveProfile(client, draft, profile.version, removeAvatar ? null : avatar ? stagedPath.current! : undefined);
        if (setup) { committed.current = true; if (mounted.current) setVerificationPending(true); }
      }, setup ? { completeSetup: true } : undefined);
      if (mounted.current) { onSaved?.(); setSaved(true); }
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Unable to save. Please try again.'); }
    finally { if (mounted.current) setSaving(false); }
  }
  async function reload() {
    setSaving(true);
    try {
      const latest = await loadOwnProfile(profileSessionClient(session?.access_token), profile.user_id, new AbortController().signal);
      if (!latest.public) throw new Error('Profile unavailable.');
      avatarRef.current?.dispose(); avatarRef.current = null; stagedPath.current = null;
      setAvatar(null); setRemoveAvatar(false); setBaseline(latest);
      setDraft({ display_name: latest.public.display_name, bio: latest.public.bio, age_band: setup ? null : latest.private.age_band });
      setShowErrors(false); setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to reload.'); }
    finally { if (mounted.current) setSaving(false); }
  }
  return <View style={S.content}>
    {!setup && <ProfileNavigationGuard enabled={!!userId && (dirty || busy)} busy={busy} onLeave={action => setLeave(() => action)} />}
    <View style={S.card}><ProfileText title>Visible to signed-in students</ProfileText><ProfileAvatar name={draft.display_name} path={removeAvatar ? null : profile.avatar_path} preview={avatar?.uri} />
      <ProfileButton label="Choose profile photo" disabled={busy} onPress={() => void choosePhoto()} />
      {(profile.avatar_path || avatar) && <ProfileButton label="Remove photo" disabled={busy} onPress={() => { avatarRef.current?.dispose(); avatarRef.current = null; stagedPath.current = null; setAvatar(null); setRemoveAvatar(true); }} />}
      <ProfileText muted>Optional JPEG, PNG, or WebP, up to 5 MB and 4 million pixels. Photos are resized and location metadata is removed.</ProfileText>
      <ProfileField label="Display name" value={draft.display_name} onChangeText={display_name => setDraft(value => ({ ...value, display_name }))} editable={!busy} autoComplete="nickname" autoCapitalize="words" error={errors.display_name} />
      <ProfileField label="Bio (optional)" value={draft.bio} onChangeText={bio => setDraft(value => ({ ...value, bio }))} editable={!busy} multiline autoCapitalize="sentences" error={errors.bio} />
      <ProfileText muted>{Array.from(draft.bio).length}/280 characters</ProfileText>
    </View>
    <View style={S.card}><ProfileText title>Private age eligibility</ProfileText><ProfileText muted>Used to determine which age-restricted events you can attend. Other students cannot see this. This is self-reported, not verified identification.</ProfileText>
      {ageBands.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={ageLabels[value]} accessibilityState={{ checked: draft.age_band === value, disabled: busy }} disabled={busy} onPress={() => setDraft(previous => ({ ...previous, age_band: value }))} style={{ minHeight: 52, justifyContent: 'center', padding: 12, borderWidth: 1, borderRadius: 12, borderColor: draft.age_band === value ? C.pink : C.border }}><ProfileText pink={draft.age_band === value}>{draft.age_band === value ? '● ' : '○ '}{ageLabels[value]}</ProfileText></Pressable>)}
      <ProfileMessage text={errors.age_band} error />
    </View>
    <ProfileMessage text={error} error />
    {error && !verificationPending && <ProfileButton label="Discard changes and reload" disabled={busy} onPress={() => void reload()} />}
    {verificationPending && <ProfileText muted>Your profile was saved. Confirming setup with the server is required before continuing.</ProfileText>}
    <ProfileButton label={saving ? 'Saving…' : verificationPending ? 'Retry profile check' : setup ? 'Finish setup' : 'Save profile'} primary disabled={saving || (!setup && !dirty)} onPress={() => void save()} />
    <Modal visible={!!leave} transparent animationType="fade" onRequestClose={() => setLeave(null)}><View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', padding: 24, justifyContent: 'center' }}><View accessibilityViewIsModal style={S.card}><ProfileText title>Discard unsaved changes?</ProfileText><ProfileText muted>Your changes will not be saved.</ProfileText><ProfileButton label="Keep editing" onPress={() => setLeave(null)} /><ProfileButton label="Discard changes" danger onPress={() => { const action = leave; setLeave(null); action?.(); }} /></View></View></Modal>
  </View>;
}

function ProfileNavigationGuard({ enabled, busy, onLeave }: { enabled: boolean; busy: boolean; onLeave: (action: () => void) => void }) {
  const navigation = useNavigation();
  usePreventRemove(enabled, ({ data }) => { if (!busy) onLeave(() => navigation.dispatch(data.action)); });
  return null;
}
