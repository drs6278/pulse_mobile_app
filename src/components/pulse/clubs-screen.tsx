import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { communityRpc, emptyClub, summaries, type Club, type ClubDraft, type Engagement } from '@/lib/community';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { defaultEventDraft, eventRow, validateEventDraft } from '@/lib/event-create';
import { EventFormFields } from './screens';
import { Screen, TitleHeader } from './ui';
import { ProfileButton, ProfileField, ProfileLink, ProfileMessage, ProfileText } from './profile/controls';
import { VoteButtons } from './community';

type Member = { user_id: string; role: string; status: string };
export default function ClubsScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]), [scores, setScores] = useState<Record<string, Engagement>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<{ id: string; title: string }[]>([]);
  const [page, setPage] = useState(0), [top, setTop] = useState(false), [more, setMore] = useState(false);
  const [draft, setDraft] = useState<ClubDraft | null>(null), [editing, setEditing] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState<ReturnType<typeof defaultEventDraft> | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmDelete, setConfirmDelete] = useState(false);
  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await communityRpc<Club[]>('list_community_clubs', { p_top: top, p_offset: page * 20, p_id: params.id ?? null });
      setClubs(rows); setMore(rows.length === 20);
      const values = await summaries('club', rows.filter(c => !c.deleted_at).map(c => c.id));
      setScores(Object.fromEntries(values.map(v => [v.id, v])));
      if (params.id) {
        const [membership, upcoming] = await Promise.all([
          supabase.from('club_memberships').select('user_id,role,status').eq('club_id', params.id),
          supabase.from('events').select('id,title').eq('club_id', params.id).eq('pulse_cancelled', false).gte('event_date', new Date().toISOString().slice(0, 10)).order('event_date').limit(50),
        ]);
        if (membership.error || upcoming.error) throw new Error('Unable to load club members or events.');
        setMembers(membership.data ?? []); setEvents(upcoming.data ?? []);
      }
    } catch (e) { setError((e as Error).message); }
  }, [params.id, top, page]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const own = members.find(m => m.user_id === session?.user.id);
  const admin = own?.role === 'admin' && own.status === 'active';
  async function run(operation: () => Promise<unknown>) {
    if (busy) return; setBusy(true); setError('');
    try { await operation(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function membership(club: string, action: string, user = session!.user.id) { return run(() => communityRpc('manage_club_member', { p_club: club, p_action: action, p_user: user })); }
  return <Screen header={<TitleHeader title={params.id ? 'Club details' : 'Clubs'} />}><View style={{ padding: 16, gap: 16 }}>
    <ProfileMessage error text={error} /><ProfileButton label="Refresh clubs" disabled={busy} onPress={() => void load()} />
    {!params.id && <><ProfileButton label="Create club" onPress={() => { setDraft({ ...emptyClub }); setEditing(null); }} /><ProfileButton label={top ? 'Sort: Top' : 'Sort: Alphabetical'} onPress={() => { setTop(v => !v); setPage(0); }} /></>}
    {draft && <View style={{ gap: 12 }}><ProfileText title>{editing ? 'Edit club' : 'Create club'}</ProfileText>
      {(['name', 'description', 'category', 'contact', 'website', 'meeting_location', 'image_url'] as const).map(field => <ProfileField key={field} label={field.replaceAll('_', ' ')} value={draft[field]} multiline={field === 'description'} maxLength={field === 'description' ? 4000 : field === 'name' ? 100 : 500} onChangeText={value => setDraft({ ...draft, [field]: value })} />)}
      <ProfileText muted>Website and optional image URL must use HTTPS.</ProfileText>
      <ProfileButton label={draft.approval_required ? 'Joining: Admin approval' : 'Joining: Open'} onPress={() => setDraft({ ...draft, approval_required: !draft.approval_required })} />
      <ProfileButton label="Save club" disabled={busy || !draft.name.trim() || !draft.description.trim()} onPress={() => void run(async () => { const id = await communityRpc<string>('save_club', { p_draft: draft, p_id: editing }); setDraft(null); router.push({ pathname: '/clubs', params: { id } }); })} />
      <ProfileButton label="Cancel editing" onPress={() => setDraft(null)} />
    </View>}
    {clubs.map(club => <View key={club.id} style={{ gap: 12, padding: 14, borderWidth: 1, borderColor: '#929BAA', borderRadius: 16 }}>
      <ProfileLink href={{ pathname: '/clubs', params: { id: club.id } }} label={club.deleted_at ? `${club.name} (deleted club)` : club.name} />
      <ProfileText>{club.description}</ProfileText><ProfileText muted>{club.category}</ProfileText>
      {!!club.image_url && <Image source={{ uri: club.image_url }} accessibilityLabel={`${club.name} image`} contentFit="cover" style={{ width: 96, height: 96, borderRadius: 48 }} />}
      {scores[club.id] && <VoteButtons kind="club" value={scores[club.id]} onChange={value => setScores(previous => ({ ...previous, [club.id]: value }))} />}
      {params.id && <><ProfileText>{members.filter(m => m.status === 'active').length} members · {club.approval_required ? 'Approval required' : 'Open membership'}</ProfileText>
        <ProfileText>Contact: {club.contact || 'Not provided'}</ProfileText><ProfileText>Website: {club.website || 'Not provided'}</ProfileText><ProfileText>Meeting location: {club.meeting_location || 'Not provided'}</ProfileText>
        {!club.deleted_at && <>{own ? <><ProfileText>Your membership: {own.role} · {own.status}</ProfileText><ProfileButton label={own.status === 'pending' ? 'Cancel join request' : 'Leave club'} disabled={busy} onPress={() => void membership(club.id, 'leave')} /></> : <ProfileButton label={club.approval_required ? 'Request to join' : 'Join club'} disabled={busy} onPress={() => void membership(club.id, 'join')} />}
        {admin && <><ProfileButton label="Edit club" onPress={() => { setDraft(club); setEditing(club.id); }} /><ProfileButton label="Create club event" onPress={() => setEventDraft(defaultEventDraft())} />
          {members.map(member => <View key={member.user_id} style={{ gap: 8 }}><ProfileLink href={{ pathname: '/student-profile', params: { id: member.user_id } }} label={`${member.role} · ${member.status}`} />
            {member.status === 'pending' ? <><ProfileButton label="Approve member" disabled={busy} onPress={() => void membership(club.id, 'approve', member.user_id)} /><ProfileButton label="Reject request" disabled={busy} onPress={() => void membership(club.id, 'reject', member.user_id)} /></> : <><ProfileButton label={member.role === 'admin' ? 'Demote to member' : 'Promote to admin'} disabled={busy} onPress={() => void membership(club.id, member.role === 'admin' ? 'demote' : 'promote', member.user_id)} /><ProfileButton label="Remove member" disabled={busy} onPress={() => void membership(club.id, 'remove', member.user_id)} /></>}
          </View>)}
          <ProfileButton label="Delete club" danger onPress={() => setConfirmDelete(true)} />
          {confirmDelete && <><ProfileText>Delete this club and cancel its future events? Event discussions will remain.</ProfileText><ProfileButton label="Confirm club deletion" danger disabled={busy} onPress={() => void run(async () => { await communityRpc('delete_club', { p_club: club.id }); setConfirmDelete(false); })} /><ProfileButton label="Keep club" onPress={() => setConfirmDelete(false)} /></>}
        </>}
        {eventDraft && admin && <><EventFormFields draft={eventDraft} busy={busy} change={changes => setEventDraft({ ...eventDraft, ...changes })} /><ProfileButton label="Publish club event" disabled={busy} onPress={() => void run(async () => { const errors = validateEventDraft(eventDraft); if (errors.length) throw new Error(errors.join('\n')); const id = await communityRpc<string>('create_club_event', { p_club: club.id, p_draft: eventRow(eventDraft) }); setEventDraft(null); router.push({ pathname: '/event', params: { id } }); })} /><ProfileButton label="Cancel event draft" onPress={() => setEventDraft(null)} /></>}
        </>}
        <ProfileText title>Upcoming events</ProfileText>{events.map(event => <ProfileLink key={event.id} href={{ pathname: '/event', params: { id: event.id } }} label={event.title} />)}
      </>}
    </View>)}
    {!params.id && <><ProfileButton label="Previous clubs" disabled={page === 0} onPress={() => setPage(v => v - 1)} /><ProfileButton label="Next clubs" disabled={!more} onPress={() => setPage(v => v + 1)} /></>}
  </View></Screen>;
}
