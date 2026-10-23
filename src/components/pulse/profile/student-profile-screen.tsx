import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useUserResource } from '@/hooks/use-user-resource';
import { fetchHostedEvents, loadBlockedProfiles, loadPublicProfile, profileSessionClient, reportProfile, setUserBlock } from '@/lib/profile/repository';
import { reportLabels, reportReasons, type ReportReason } from '@/lib/profile/types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useEvents } from '@/providers/events-provider';
import { useRSVPs } from '@/providers/rsvp-provider';
import { Screen, TitleHeader } from '../ui';
import { ProfileAvatar, ProfileButton, ProfileField, ProfileLink, ProfileLoading, ProfileMessage, ProfileText, profileStyles as S } from './controls';
import { EVENTS_PER_PAGE } from '@/lib/event-query';

export default function StudentProfileScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <Screen header={<TitleHeader title="Student profile" />}>
    {id && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id) ? <StudentProfile key={id} id={id} /> : <View style={S.content}><ProfileText>Profile unavailable.</ProfileText></View>}
  </Screen>;
}
export function StudentProfile({ id }: { id: string }) {
  const [page, setPage] = useState(0);
  const loader = useCallback(async (_user: string, signal: AbortSignal) => {
    const profile = await loadPublicProfile(supabase, id, signal);
    return { profile, hosted: profile ? await fetchHostedEvents(supabase, id, page, signal) : { events: [], count: 0 } };
  }, [id, page]);
  const resource = useUserResource(loader);
  const { refresh } = resource;
  const { session } = useAuth();
  const { refresh: refreshEvents } = useEvents();
  const rsvps = useRSVPs();
  const [reporting, setReporting] = useState(false), [confirmBlock, setConfirmBlock] = useState(false);
  const [reason, setReason] = useState<ReportReason>('inappropriate_content'), [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  async function block() {
    setBusy(true); setError(null);
    try { const client = profileSessionClient(session?.access_token); await resource.mutate(() => setUserBlock(client, id, true)); refreshEvents(); rsvps.refresh(); router.replace('/blocked-users'); }
    catch (value) { setError(value instanceof Error ? value.message : 'Unable to block student.'); }
    finally { setBusy(false); }
  }
  async function report() {
    setBusy(true); setError(null);
    try { const client = profileSessionClient(session?.access_token); await resource.mutate(() => reportProfile(client, id, reason, details)); setReporting(false); setNotice('Report sent. The Pulse team will review it. You can also block this student.'); }
    catch (value) { setError(value instanceof Error ? value.message : 'Unable to send report.'); }
    finally { setBusy(false); }
  }
  const profile = resource.data?.profile;
  return <View style={S.content}>
    {resource.loading ? <ProfileLoading /> : resource.error ? <><ProfileMessage text={resource.error} error /><ProfileButton label="Try again" onPress={resource.refresh} /></> : !profile ? <><ProfileText title>Profile unavailable</ProfileText><ProfileText muted>This profile may have been removed or be unavailable to you.</ProfileText><ProfileLink href="/blocked-users" label="Manage blocked students" /></> : <>
      <View style={S.card}><ProfileAvatar name={profile.display_name} path={profile.avatar_path} /><ProfileText title>{profile.display_name}</ProfileText>{!!profile.bio && <ProfileText>{profile.bio}</ProfileText>}
        {session?.user.id === id ? <ProfileLink href="/edit-profile" label="Edit my profile" /> : <><ProfileButton label="Report profile" disabled={busy} onPress={() => { setReporting(true); setConfirmBlock(false); setNotice(null); }} /><ProfileButton label="Block student" disabled={busy} onPress={() => { setConfirmBlock(true); setReporting(false); }} /></>}
      </View>
      <ProfileMessage text={error} error /><ProfileMessage text={notice} />
      {reporting && <View style={S.card}><ProfileText title>Report profile</ProfileText><ProfileText muted>Choose the reason that best describes the problem. Reports are private.</ProfileText>
        {reportReasons.map(option => <ProfileButton key={option} label={`${reason === option ? '✓ ' : ''}${reportLabels[option]}`} disabled={busy} onPress={() => setReason(option)} />)}
        <ProfileField label="Report details (optional)" value={details} onChangeText={setDetails} multiline maxLength={1000} editable={!busy} />
        <ProfileButton label={busy ? 'Sending…' : 'Send report'} disabled={busy} primary onPress={() => void report()} /><ProfileButton label="Cancel report" disabled={busy} onPress={() => setReporting(false)} />
      </View>}
      {confirmBlock && <View style={S.card}><ProfileText title>Block this student?</ProfileText><ProfileText muted>You will no longer see each other’s profiles or personally hosted events. Existing RSVPs are kept; you can cancel them from your calendar. You can unblock them in account settings.</ProfileText><ProfileButton label="Confirm block" disabled={busy} danger onPress={() => void block()} /><ProfileButton label="Cancel block" disabled={busy} onPress={() => setConfirmBlock(false)} /></View>}
      <View style={S.card}><ProfileText title>Upcoming hosted events</ProfileText>
        {!resource.data?.hosted.events.length && <ProfileText muted>No upcoming events available to you.</ProfileText>}
        {resource.data?.hosted.events.map(event => <ProfileLink key={event.id} href={{ pathname: '/event', params: { id: event.id } }} label={event.title} detail={`${event.event_date} · ${event.location}`} />)}
        {page > 0 && <ProfileButton label="Previous events" onPress={() => setPage(value => value - 1)} />}
        {(page + 1) * EVENTS_PER_PAGE < (resource.data?.hosted.count ?? 0) && <ProfileButton label="More events" onPress={() => setPage(value => value + 1)} />}
      </View>
    </>}
  </View>;
}

export function BlockedUsersScreen() {
  const loader = useCallback((_user: string, signal: AbortSignal) => loadBlockedProfiles(supabase, signal), []);
  const resource = useUserResource(loader);
  const { refresh: refreshEvents } = useEvents();
  const { session } = useAuth();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  async function unblock(id: string) {
    setBusy(true); setError(null);
    try { const client = profileSessionClient(session?.access_token); await resource.mutate(() => setUserBlock(client, id, false)); refreshEvents(); }
    catch (value) { setError(value instanceof Error ? value.message : 'Unable to unblock.'); }
    finally { setBusy(false); }
  }
  return <Screen header={<TitleHeader title="Blocked students" />}><View style={S.content}><ProfileText muted>Blocking hides your profiles and personally hosted events from each other.</ProfileText>
    {resource.loading ? <ProfileLoading label="Loading blocked students" /> : resource.error ? <><ProfileMessage text={resource.error} error /><ProfileButton label="Try again" onPress={resource.refresh} /></> : resource.data?.length ? resource.data.map(profile => <View key={profile.user_id} style={S.card}><ProfileText>{profile.display_name}</ProfileText><ProfileButton label={`Unblock ${profile.display_name}`} disabled={busy} onPress={() => void unblock(profile.user_id)} /></View>) : <ProfileText>No blocked students.</ProfileText>}
    <ProfileMessage text={error} error />
  </View></Screen>;
}
