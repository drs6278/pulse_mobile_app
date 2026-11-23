import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { communityRpc } from '@/lib/community';
import { useNotifications } from '@/providers/notifications-provider';
import { ProfileButton, ProfileMessage, ProfileText } from './profile/controls';

type OrganizerMessage = {
  sender_id: string;
  request_id: string;
  club_id: string | null;
  event_id: string | null;
  body: string;
  read_at: string | null;
};

export default function OrganizerInbox() {
  const [rows, setRows] = useState<OrganizerMessage[]>([]);
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showMutes, setShowMutes] = useState(false);
  const [mutes, setMutes] = useState<{ club_id: string | null; sender_id: string | null; name: string }[]>([]);
  const { refresh } = useNotifications();
  const load = useCallback(async () => {
    try {
      setRows(await communityRpc('list_organizer_messages', { p_offset: page * 20 }));
      if (showMutes) setMutes(await communityRpc('list_organizer_mutes'));
      setError('');
    } catch (reason) { setError((reason as Error).message); }
  }, [page, showMutes]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function act(operation: () => Promise<unknown>) {
    setBusy(true);
    try { await operation(); await load(); refresh(); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  const mute = (club: string | null, sender: string | null, muted: boolean) =>
    act(() => communityRpc('set_organizer_mute', { p_club: club, p_sender: sender, p_muted: muted }));
  return <View style={{ gap: 8 }}>
    <ProfileText title>Organizer messages</ProfileText>
    <ProfileMessage error text={error} />
    <ProfileButton label="Refresh messages" disabled={busy} onPress={() => void load()} />
    <ProfileButton label={showMutes ? 'Close muted sources' : 'Manage muted sources'} onPress={() => setShowMutes(!showMutes)} />
    {showMutes && mutes.map(row => <ProfileButton key={row.club_id ?? row.sender_id}
      label={'Unmute ' + row.name} disabled={busy} onPress={() => void mute(row.club_id, row.sender_id, false)} />)}
    {!rows.length && <ProfileText>No organizer messages</ProfileText>}
    {rows.map(row => <View key={row.sender_id + row.request_id} style={{ gap: 4 }}>
      <ProfileText>{row.read_at ? '' : 'Unread · '}{row.body}</ProfileText>
      <ProfileButton label={row.event_id ? 'Open event' : 'Open club'} disabled={busy} onPress={() => void act(async () => {
        await communityRpc('read_organizer_messages', { p_sender: row.sender_id, p_request: row.request_id });
        if (row.event_id) router.push({ pathname: '/event', params: { id: row.event_id } });
        else if (row.club_id) router.push({ pathname: '/clubs', params: { id: row.club_id } });
      })} />
      {row.club_id && <ProfileButton label="Mute this club" disabled={busy} onPress={() => void mute(row.club_id, null, true)} />}
      <ProfileButton label="Mute this sender" disabled={busy} onPress={() => void mute(null, row.sender_id, true)} />
    </View>)}
    {page > 0 && <ProfileButton label="Previous messages" onPress={() => setPage(page - 1)} />}
    {rows.length === 20 && <ProfileButton label="More messages" onPress={() => setPage(page + 1)} />}
  </View>;
}
