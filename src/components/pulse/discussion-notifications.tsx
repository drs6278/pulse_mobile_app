import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { communityRpc } from '@/lib/community';
import { supabase } from '@/lib/supabase';
import { useNotifications } from '@/providers/notifications-provider';
import { ProfileButton, ProfileMessage, ProfileText } from './profile/controls';

type Notification = { id: string; event_id: string; comment_id: string; event_title: string; body: string; read_at: string | null };
export default function DiscussionNotifications() {
  const [rows, setRows] = useState<Notification[]>([]), [error, setError] = useState(''), [page, setPage] = useState(0);
  const badge = useNotifications();
  const load = useCallback(async () => { try { setRows(await communityRpc('list_discussion_notifications', { p_offset: page * 20 })); } catch (e) { setError((e as Error).message); } }, [page]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function open(row: Notification) { const { error } = await supabase.from('discussion_notifications').update({ read_at: new Date().toISOString() }).eq('id', row.id); if (error) { setError(error.message); return; } badge.refresh(); router.push({ pathname: '/event', params: { id: row.event_id, comment: row.comment_id } }); }
  return <View style={{ gap: 12 }}><ProfileText title>Discussion notifications</ProfileText><ProfileButton label="Refresh discussion notifications" onPress={() => void load()} /><ProfileMessage error text={error} />{rows.map(row => <View key={row.id}><ProfileText>{row.read_at ? '' : 'New · '}{row.event_title}</ProfileText><ProfileText>{row.body}</ProfileText><ProfileButton label="Open discussion" onPress={() => void open(row)} /></View>)}<ProfileButton label="Previous discussion notifications" disabled={!page} onPress={() => setPage(v => v - 1)} /><ProfileButton label="Next discussion notifications" disabled={rows.length < 20} onPress={() => setPage(v => v + 1)} /></View>;
}
