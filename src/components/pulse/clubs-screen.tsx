import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { communityRpc, emptyClub, summaries, type Club, type ClubDraft, type ClubMember, type ClubRole } from '@/lib/community';
import { useUserResource } from '@/hooks/use-user-resource';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useEvents } from '@/providers/events-provider';
import { useRSVPs } from '@/providers/rsvp-provider';
import { useSavedEvents } from '@/providers/saved-events-provider';
import { defaultEventDraft, eventRow, validateEventDraft } from '@/lib/event-create';
import { EventFormFields } from './screens';
import { ClubEventVisibility } from './club-event-visibility';
import { Screen, TitleHeader } from './ui';
import { ProfileButton, ProfileField, ProfileLink, ProfileMessage, ProfileText } from './profile/controls';
import { VoteButtons } from './community';

export default function ClubsScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { session } = useAuth();
  return <ClubSession key={`${session?.user.id}:${id}`} id={id} />;
}
function ClubSession({ id }: { id?: string }) {
  const [page, setPage] = useState(0), [top, setTop] = useState(false);
  const [memberPage, setMemberPage] = useState(0), [eventPage, setEventPage] = useState(0);
  const [draft, setDraft] = useState<ClubDraft | null>(null), [editing, setEditing] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState<ReturnType<typeof defaultEventDraft> | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{ message: string; label: string; action: () => Promise<unknown> } | null>(null);
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const eventResource = useEvents(), rsvps = useRSVPs(), saved = useSavedEvents();
  const load = useCallback(async (user: string, signal: AbortSignal) => {
    const response = await supabase.rpc('list_community_clubs', { p_top: top, p_offset: page * 20, p_id: id ?? null }).abortSignal(signal);
    if (response.error) throw response.error;
    const clubs = (response.data ?? []) as Club[];
    const values = await summaries('club', clubs.filter(c => !c.deleted_at).map(c => c.id));
    if (!id) return { clubs, values, own: null, members: [] as ClubMember[], count: 0, events: [] as { id: string; title: string }[], moreEvents: false };
    const [own, members, count, events] = await Promise.all([
      supabase.from('club_memberships').select('user_id,role,status').eq('club_id', id).eq('user_id', user).abortSignal(signal).maybeSingle<ClubMember>(),
      supabase.rpc('list_club_members', { p_club: id, p_offset: memberPage * 25 }).abortSignal(signal),
      supabase.rpc('club_member_count', { p_club: id }).abortSignal(signal),
      supabase.from('events').select('id::text,title').eq('club_id', id).eq('pulse_cancelled', false).gte('event_date', new Date().toISOString().slice(0, 10)).order('event_date').order('id').range(eventPage * 25, eventPage * 25 + 25).abortSignal(signal),
    ]);
    for (const result of [own, members, count, events]) if (result.error) throw result.error;
    return { clubs, values, own: own.data, members: (members.data ?? []) as ClubMember[], count: Number(count.data), events: (events.data ?? []).slice(0, 25), moreEvents: (events.data?.length ?? 0) > 25 };
  }, [id, top, page, memberPage, eventPage]);
  const resource = useUserResource(load);
  const refresh = resource.refresh;
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  const data = resource.data, own = data?.own;
  const admin = own?.role === 'admin' && own.status === 'active';
  const manager = own?.status === 'active' && (own.role === 'admin' || own.role === 'officer');
  async function run(operation: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await resource.mutate(async () => { await operation(); });
      if (!alive.current) return;
      setConfirmation(null); eventResource.refresh(); rsvps.refresh(); saved.refresh();
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : 'Unable to update this club.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const membership = (club: string, action: string, user = resource.userId) => communityRpc('manage_club_member', { p_club: club, p_action: action, p_user: user });
  const confirm = (message: string, label: string, action: () => Promise<unknown>) => setConfirmation({ message, label, action });
  return <Screen header={<TitleHeader title={id ? 'Club details' : 'Clubs'} />} onRefresh={resource.refresh} refreshing={resource.loading}><View style={{ padding: 16, gap: 16 }}>
    <ProfileMessage error text={error || resource.error} />
    <ProfileButton label="Refresh clubs" disabled={busy || resource.loading} onPress={resource.refresh} />
    {!id && <><ProfileButton label="Create club" disabled={busy} onPress={() => { setDraft({ ...emptyClub }); setEditing(null); }} /><ProfileButton label={top ? 'Sort: Top' : 'Sort: Alphabetical'} disabled={busy} onPress={() => { setTop(v => !v); setPage(0); }} /></>}
    {draft && (!editing || admin) && <View style={{ gap: 12 }}><ProfileText title>{editing ? 'Edit club' : 'Create club'}</ProfileText>
      {(['name', 'description', 'category', 'contact', 'website', 'meeting_location', 'image_url'] as const).map(field => <ProfileField key={field} label={field.replaceAll('_', ' ')} value={draft[field]} editable={!busy} multiline={field === 'description'} maxLength={field === 'description' ? 4000 : field === 'name' ? 100 : 500} onChangeText={value => setDraft({ ...draft, [field]: value })} />)}
      <ProfileText muted>Website and optional image URL must use HTTPS.</ProfileText>
      <ProfileButton label={draft.approval_required ? 'Joining: Admin approval' : 'Joining: Open'} disabled={busy} onPress={() => setDraft({ ...draft, approval_required: !draft.approval_required })} />
      <ProfileButton label="Save club" disabled={busy || !draft.name.trim() || !draft.description.trim()} onPress={() => void run(async () => { const clubId = await communityRpc<string>('save_club', { p_draft: draft, p_id: editing }); if (alive.current) { setDraft(null); if (!editing) router.push({ pathname: '/clubs', params: { id: clubId } }); } })} />
      <ProfileButton label="Cancel editing" disabled={busy} onPress={() => setDraft(null)} />
    </View>}
    {resource.loading && <ProfileText>Loading clubs…</ProfileText>}
    {data && !data.clubs.length && <ProfileText>{id ? 'This club is unavailable.' : 'No clubs found.'}</ProfileText>}
    {data?.clubs.map(club => <View key={club.id} style={{ gap: 12 }}>
      <ProfileLink href={{ pathname: '/clubs', params: { id: club.id } }} label={club.deleted_at ? `${club.name} (deleted club)` : club.name} />
      <ProfileText>{club.description}</ProfileText><ProfileText muted>{club.category}</ProfileText>
      {!!club.image_url && <Image source={{ uri: club.image_url }} accessibilityLabel={`${club.name} image`} contentFit="cover" style={{ width: 96, height: 96, borderRadius: 48 }} />}
      {data.values.find(v => v.id === club.id) && <VoteButtons kind="club" value={data.values.find(v => v.id === club.id)!} onChange={resource.refresh} />}
      {id && <>
        <ProfileText>{data.count} members · {club.approval_required ? 'Approval required' : 'Open membership'}</ProfileText>
        <ProfileText>Contact: {club.contact || 'Not provided'}</ProfileText><ProfileText>Website: {club.website || 'Not provided'}</ProfileText><ProfileText>Meeting location: {club.meeting_location || 'Not provided'}</ProfileText>
        {!club.deleted_at && <>
          {own ? <><ProfileText>Your membership: {own.role} · {own.status}</ProfileText><ProfileButton label={own.status === 'pending' ? 'Cancel join request' : 'Leave club'} disabled={busy} onPress={() => own.status === 'pending' ? void run(() => membership(club.id, 'leave')) : confirm('Leave this club? Your RSVPs for its club-only events will be cancelled. Public event RSVPs are kept. The last admin must appoint another admin first.', 'Confirm leave club', () => membership(club.id, 'leave'))} /></> : <ProfileButton label={club.approval_required ? 'Request to join' : 'Join club'} disabled={busy} onPress={() => void run(() => membership(club.id, 'join'))} />}
          {manager && <ProfileButton label="Create club event" disabled={busy} onPress={() => setEventDraft({ ...defaultEventDraft(), visibility: 'public' })} />}
          {admin && <ProfileButton label="Edit club" disabled={busy} onPress={() => { setDraft(club); setEditing(club.id); }} />}
          {own?.status === 'active' && <><ProfileText title>Members</ProfileText>
            {data.members.map(member => <View key={member.user_id} style={{ gap: 8 }}>
              <ProfileLink href={{ pathname: '/student-profile', params: { id: member.user_id } }} label={member.display_name || 'Club member'} detail={`${member.role} · ${member.status}`} />
              {admin && (member.status === 'pending' ? <><ProfileButton label="Approve member" disabled={busy} onPress={() => void run(() => membership(club.id, 'approve', member.user_id))} /><ProfileButton label="Reject request" disabled={busy} onPress={() => confirm('Reject this join request?', 'Confirm rejection', () => membership(club.id, 'reject', member.user_id))} /></> : <>
                {(['member', 'officer', 'admin'] as ClubRole[]).filter(role => role !== member.role).map(role => <ProfileButton key={role} label={`Set role: ${role}`} disabled={busy} onPress={() => confirm(`Change ${member.display_name || 'this member'} to ${role}?`, 'Confirm role change', () => communityRpc('set_club_member_role', { p_club: club.id, p_user: member.user_id, p_role: role }))} />)}
                <ProfileButton label="Remove member" danger disabled={busy} onPress={() => confirm('Remove this member? Their RSVPs for club-only events will be cancelled.', 'Confirm member removal', () => membership(club.id, 'remove', member.user_id))} />
              </>)}
            </View>)}
            <ProfileButton label="Previous members" disabled={busy || memberPage === 0} onPress={() => setMemberPage(v => v - 1)} /><ProfileButton label="Next members" disabled={busy || data.members.length < 25} onPress={() => setMemberPage(v => v + 1)} />
          </>}
          {admin && <ProfileButton label="Delete club" danger disabled={busy} onPress={() => confirm('Delete this club and cancel its future events? Existing discussions are retained subject to event access rules.', 'Confirm club deletion', () => communityRpc('delete_club', { p_club: club.id }))} />}
          {eventDraft && manager && <><EventFormFields draft={eventDraft} busy={busy} change={changes => setEventDraft({ ...eventDraft, ...changes })} /><ClubEventVisibility value={eventDraft.visibility} disabled={busy} onChange={visibility => setEventDraft({ ...eventDraft, visibility })} />
            <ProfileButton label="Publish club event" disabled={busy} onPress={() => void run(async () => { const errors = validateEventDraft(eventDraft); if (errors.length) throw new Error(errors.join('\n')); const eventId = await communityRpc<string>('create_club_event', { p_club: club.id, p_draft: eventRow(eventDraft) }); if (alive.current) { setEventDraft(null); router.push({ pathname: '/event', params: { id: eventId } }); } })} /><ProfileButton label="Cancel event draft" disabled={busy} onPress={() => setEventDraft(null)} />
          </>}
        </>}
        <ProfileText title>Upcoming events</ProfileText>{data.events.map(event => <ProfileLink key={event.id} href={{ pathname: '/event', params: { id: event.id } }} label={event.title} />)}
        <ProfileButton label="Previous events" disabled={busy || eventPage === 0} onPress={() => setEventPage(v => v - 1)} /><ProfileButton label="Next events" disabled={busy || !data.moreEvents} onPress={() => setEventPage(v => v + 1)} />
      </>}
    </View>)}
    {confirmation && <View style={{ gap: 8 }}><ProfileText>{confirmation.message}</ProfileText><ProfileButton label={confirmation.label} danger disabled={busy} onPress={() => void run(confirmation.action)} /><ProfileButton label="Keep current settings" disabled={busy} onPress={() => setConfirmation(null)} /></View>}
    {!id && <><ProfileButton label="Previous clubs" disabled={busy || page === 0} onPress={() => setPage(v => v - 1)} /><ProfileButton label="Next clubs" disabled={busy || !data || data.clubs.length < 20} onPress={() => setPage(v => v + 1)} /></>}
  </View></Screen>;
}
