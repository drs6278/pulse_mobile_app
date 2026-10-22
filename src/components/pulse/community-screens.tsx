import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { DateTime } from 'luxon';
import { useUserResource } from '@/hooks/use-user-resource';
import { useEvents } from '@/providers/events-provider';
import { supabase } from '@/lib/supabase';
import { communityError, eventDraft, loadCommunity, managedColumns, rpc, type Club, type EventForm, type ManagedEvent } from '@/lib/community';
import { PulseText, Screen, TitleHeader } from './ui';
import { Button, Field, Loading, Message } from './schedule/controls';
import { CapacityEditor } from './attendance';

function Panel({ children }: { children: ReactNode }) { return <View style={{ padding: 16, gap: 16 }}>{children}</View>; }
function useAction() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const lock = useRef(false);
  async function run(work: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(null);
    try { await work(); } catch (error) { setMessage(communityError(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  return { busy, message, run };
}
export function ClubsScreen() {
  const resource = useUserResource(loadCommunity);
  const action = useAction();
  const { refresh: refreshEvents } = useEvents();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [name, setName] = useState(''), [description, setDescription] = useState('');
  const club = resource.data?.clubs.find(c => c.id === id);
  const role = resource.data?.memberships.find(m => m.club_id === id && m.user_id === resource.userId)?.role;
  function changeMember(user: string, next: string | null) {
    void action.run(async () => { await resource.mutate(() => rpc('set_club_member', { p_club: id, p_user: user, p_role: next })); refreshEvents(); });
  }
  return <Screen header={<TitleHeader title={club?.name ?? 'Clubs'} />}><Panel>
    <Button label="Create / manage events" onPress={() => router.navigate('/create')} />
    <Message text={resource.error ? communityError({ message: resource.error }) : action.message} error />
    <Button label="Refresh" disabled={action.busy} onPress={resource.refresh} />
    {resource.loading ? <Loading /> : id ? club ? <>
      <PulseText>{club.description || 'No description yet.'}</PulseText><PulseText>Your role: {role ?? 'Not a member'}</PulseText>
      <Button label={role ? 'Leave club' : 'Join club'} disabled={action.busy} onPress={() => changeMember(resource.userId!, role ? null : 'member')} />
      {role === 'admin' && <ClubEditor key={`${club.id}:${club.version}`} club={club} busy={action.busy} save={(n, d) => { void action.run(() => resource.mutate(() => rpc('save_club', { p_club: club.id, p_version: club.version, p_name: n, p_description: d }))); }} />}
      {role && <><PulseText size={22}>Members</PulseText>{resource.data?.memberships.filter(m => m.club_id === id).map(m => <View key={m.user_id} style={{ gap: 8 }}>
        <PulseText size={13}>{m.user_id}{m.user_id === resource.userId ? ' (you)' : ''} / {m.role}</PulseText>
        {role === 'admin' && <View style={{ gap: 6 }}>{(['member','officer','admin'] as const).filter(r => r !== m.role).map(r => <Button key={r} label={`Make ${r}`} disabled={action.busy} onPress={() => changeMember(m.user_id, r)} />)}<Button label="Remove member" danger disabled={action.busy} onPress={() => changeMember(m.user_id, null)} /></View>}
      </View>)}</>}
    </> : <Message text="Club unavailable." /> : <>
      <PulseText size={22}>Create a club</PulseText><Field label="Club name" value={name} onChange={setName} editable={!action.busy} /><Field label="Club description" value={description} onChange={setDescription} editable={!action.busy} />
      <Button label="Create club" disabled={action.busy || !name.trim()} onPress={() => { void action.run(async () => { let newId = ''; await resource.mutate(async () => { newId = await rpc<string>('create_club', { p_name: name, p_description: description }); }); setName(''); setDescription(''); router.push({ pathname: '/clubs', params: { id: newId } }); }); }} />
      <PulseText size={22}>Discover clubs</PulseText>{resource.data?.clubs.length === 0 && <Message text="No clubs yet. Create the first one." />}
      {resource.data?.clubs.map(c => <Button key={c.id} label={c.name} onPress={() => router.push({ pathname: '/clubs', params: { id: c.id } })} />)}
    </>}
  </Panel></Screen>;
}
function ClubEditor({ club, busy, save }: { club: Club; busy: boolean; save: (name: string, description: string) => void }) {
  const [name, setName] = useState(club.name), [description, setDescription] = useState(club.description);
  return <><Field label="Club name" value={name} onChange={setName} editable={!busy} /><Field label="Club description" value={description} onChange={setDescription} editable={!busy} /><Button label="Save club profile" disabled={busy || !name.trim()} onPress={() => save(name, description)} /></>;
}
export function EventWorkspaceScreen() {
  const resource = useUserResource(loadCommunity);
  return <Screen header={<TitleHeader title="Events & clubs" />} bottomBar activeTab="create"><Panel>
    <Button label="Create event" onPress={() => router.push('/edit-event')} /><Button label="Browse / manage clubs" onPress={() => router.push('/clubs')} />
    <PulseText size={14}>Your Pulse user ID (share it to receive a private invitation)</PulseText><Text selectable style={{ color: '#ffffff' }}>{resource.userId}</Text>
    <PulseText size={22}>Events you manage</PulseText><Message text={resource.error} error /><Button label="Refresh" onPress={resource.refresh} />
    {resource.loading ? <Loading /> : <>{resource.data?.events.length === 0 && <Message text="Your personal events and events for clubs you manage appear here." />}{resource.data?.events.map(e => <Button key={e.id} label={`${e.title} / ${e.pulse_status} / ${e.pulse_visibility}`} onPress={() => router.push({ pathname: '/edit-event', params: { id: e.id } })} />)}</>}
  </Panel></Screen>;
}
export function EventEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const loader = useCallback(async (user: string, signal: AbortSignal) => {
    try {
      const community = await loadCommunity(user, signal);
      if (!id) return { community, event: null };
      const { data, error } = await supabase.from('events').select(managedColumns).eq('id', id).abortSignal(signal).maybeSingle();
      if (error) throw error;
      const event = data as ManagedEvent | null;
      if (!event || !await rpc<boolean>('can_manage_event', { p_owner: event.pulse_owner_id, p_club: event.pulse_club_id })) throw new Error('Event unavailable or management permission denied.');
      return { community, event };
    } catch (error) { throw new Error(communityError(error)); }
  }, [id]);
  const resource = useUserResource(loader);
  return <Screen header={<TitleHeader title={id ? 'Manage event' : 'Create event'} />}><Panel>
    <Message text={resource.error} error /><Button label="Reload saved event" onPress={resource.refresh} />
    {resource.loading ? <Loading /> : resource.data && <EventEditor key={`${id ?? 'new'}:${resource.data.event?.pulse_revision ?? 0}`} event={resource.data.event} clubs={resource.data.community.clubs.filter(c => resource.data?.community.memberships.some(m => m.club_id === c.id && m.user_id === resource.userId && m.role !== 'member'))} mutate={resource.mutate} reload={resource.refresh} />}
  </Panel></Screen>;
}
function EventEditor({ event, clubs, mutate, reload }: { reload: () => void; event: ManagedEvent | null; clubs: Club[]; mutate: (operation: (user: string) => Promise<unknown>) => Promise<void> }) {
  const [requestKey] = useState(() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
  const zone = event?.pulse_timezone ?? DateTime.local().zoneName;
  const local = (iso?: string | null) => iso ? DateTime.fromISO(iso, { zone }).toFormat("yyyy-MM-dd'T'HH:mm") : '';
  const [form, setForm] = useState<EventForm>({ title: event?.title ?? '', location: event?.location ?? '', category: event?.category ?? 'Social', description: event?.pulse_description ?? '', start: local(event?.pulse_starts_at), end: local(event?.pulse_ends_at), timezone: zone, club: event?.pulse_club_id ?? '', visibility: event?.pulse_visibility ?? 'public' });
  const [confirmCancel, setConfirmCancel] = useState(false);
  const action = useAction();
  const { refresh } = useEvents();
  function save(status: ManagedEvent['pulse_status']) {
    void action.run(async () => {
      const draft = eventDraft(form, status);
      let savedId = '';
      await mutate(async () => { savedId = await rpc<string>('save_event', { p_id: event?.id ?? null, p_revision: event?.pulse_revision ?? 0, p_draft: draft, p_request_key: requestKey }); });
      refresh(); router.replace({ pathname: '/edit-event', params: { id: savedId } });
    });
  }
  const update = (key: keyof EventForm, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  return <>
    <Message text={action.message} error /><PulseText>{event ? `${event.pulse_status} / Revision ${event.pulse_revision}` : 'Public by default. Save a draft or publish when ready.'}</PulseText>
    {(['title','description','location','category','timezone','start','end'] as const).map(key => <Field key={key} label={key === 'start' || key === 'end' ? `${key === 'start' ? 'Start' : 'End'} (YYYY-MM-DDTHH:mm)` : key[0].toUpperCase() + key.slice(1)} value={form[key]} onChange={value => update(key, value)} editable={!action.busy && event?.pulse_status !== 'cancelled'} />)}
    <PulseText>Organizer: {form.club ? clubs.find(c => c.id === form.club)?.name ?? 'Club' : 'You'}</PulseText>
    {!event && <><Button label={form.club ? 'Host personally' : 'Selected: Host personally'} disabled={action.busy} onPress={() => { update('club', ''); if (form.visibility === 'club_only') update('visibility', 'public'); }} />{clubs.map(c => <Button key={c.id} label={`${form.club === c.id ? 'Selected: ' : ''}Host as ${c.name}`} disabled={action.busy} onPress={() => update('club', c.id)} />)}</>}
    <PulseText>Visibility: {form.visibility}</PulseText>{(['public','private','club_only'] as const).map(visibility => <Button key={visibility} label={`${form.visibility === visibility ? 'Selected: ' : ''}${visibility === 'club_only' ? 'Club members only' : visibility}`} disabled={action.busy || event?.pulse_status === 'cancelled' || (visibility === 'club_only' && !form.club)} onPress={() => update('visibility', visibility)} />)}
    <Message text={form.visibility === 'private' ? 'Only organizers and explicitly invited users can access this event after publishing. Save first, then add invitations using their Pulse user ID.' : form.visibility === 'club_only' ? 'Access ends when someone leaves the organizing club.' : 'Published events are visible to signed-in Pulse users.'} />
    {event?.pulse_status !== 'cancelled' && <>
      {(!event || event.pulse_status === 'draft') && <Button label="Save draft" disabled={action.busy} onPress={() => save('draft')} />}
      <Button label={event?.pulse_status === 'published' ? 'Save changes' : 'Publish event'} disabled={action.busy} onPress={() => save('published')} />
      {event && <Button label={confirmCancel ? 'Confirm cancellation' : 'Cancel event'} danger disabled={action.busy} onPress={() => { if (confirmCancel) save('cancelled'); else setConfirmCancel(true); }} />}
    </>}
    {event && <><Button label="View event" onPress={() => router.push({ pathname: '/event', params: { id: event.id } })} />
      <CapacityEditor eventId={event.id} capacity={event.pulse_capacity ?? null} onSaved={() => { refresh(); reload(); }} />
      <InvitationManager eventId={event.id} />
    </>}
  </>;
}
function InvitationManager({ eventId }: { eventId: string }) {
  const loader = useCallback(async (_user: string, signal: AbortSignal) => {
    const { data, error } = await supabase.from('event_invitations').select('user_id').eq('event_id', eventId).order('user_id').limit(1000).abortSignal(signal);
    if (error) throw new Error(communityError(error));
    return data as { user_id: string }[];
  }, [eventId]);
  const resource = useUserResource(loader), action = useAction();
  const { refresh } = useEvents();
  const [invitee, setInvitee] = useState('');
  function invite(user: string, invited: boolean) {
    void action.run(async () => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user)) throw new Error('Enter a valid Pulse user ID.');
      await resource.mutate(() => rpc('set_event_invitation', { p_event: eventId, p_user: user, p_invited: invited }));
      setInvitee(''); refresh();
    });
  }
  return <View style={{ gap: 12 }}><PulseText size={20}>Invitations</PulseText>
    <Message text={action.message ?? resource.error} error />
    <Field label="Invitee Pulse user ID" value={invitee} onChange={setInvitee} editable={!action.busy} />
    <Button label="Invite user" disabled={action.busy || !invitee.trim()} onPress={() => invite(invitee.trim(), true)} />
    <Button label="Refresh invitations" disabled={action.busy} onPress={resource.refresh} />
    {resource.loading ? <Loading /> : resource.data?.length === 0 ? <Message text="No invitations yet." /> : resource.data?.map(i => <Button key={i.user_id} label={`Revoke invitation: ${i.user_id}`} disabled={action.busy} onPress={() => invite(i.user_id, false)} />)}
    {resource.data?.length === 1000 && <Message text="Showing the first 1,000 invitations. Use a user ID to revoke another invitation." />}
    <Button label="Revoke invitation by user ID" disabled={action.busy || !invitee.trim()} onPress={() => invite(invitee.trim(), false)} />
  </View>;
}
