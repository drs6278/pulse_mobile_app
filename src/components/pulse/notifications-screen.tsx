import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { useUserResource } from '@/hooks/use-user-resource';
import { notificationChanges, type EventNotification } from '@/lib/notifications';
import { profileSessionClient } from '@/lib/profile/repository';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useNotifications } from '@/providers/notifications-provider';
import { Screen, TitleHeader, PulseText } from './ui';
import { Button, Message } from './schedule/controls';

export default function NotificationsScreen() {
  const [page, setPage] = useState(0), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth();
  const badge = useNotifications();
  const loader = useCallback(async (user: string, signal: AbortSignal) => {
    const { data, count, error } = await supabase.from('event_notifications').select('*', { count: 'exact' }).eq('user_id', user).order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * 20, page * 20 + 19).abortSignal(signal).returns<EventNotification[]>();
    if (error) throw new Error('Unable to load notifications. Please try again.');
    return { rows: data ?? [], count: count ?? 0 };
  }, [page]);
  const resource = useUserResource(loader);
  const { refresh } = resource;
  const { refresh: refreshBadge } = badge;
  useFocusEffect(useCallback(() => { refresh(); refreshBadge(); }, [refresh, refreshBadge]));
  async function read(notification?: EventNotification) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const client = profileSessionClient(session?.access_token);
      await resource.mutate(async user => {
        let query = client.from('event_notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user).is('read_at', null);
        if (notification) query = query.eq('id', notification.id);
        const { error } = await query;
        if (error) throw new Error('Unable to mark notifications as read. Please try again.');
      });
      badge.refresh();
      if (notification) router.push({ pathname: '/event', params: { id: notification.event_id } });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to open notification.'); }
    finally { setBusy(false); }
  }
  return <Screen header={<TitleHeader title="Notifications" />}><View style={{ padding: 16, gap: 16 }}>
    <Button label="Mark all as read" disabled={busy || !badge.unread} onPress={() => void read()} />
    <Button label="Refresh" disabled={busy} onPress={() => { resource.refresh(); badge.refresh(); }} />
    <Message text={error} error />
    {resource.loading ? <PulseText>Loading notifications…</PulseText> : resource.error ? <><Message text={resource.error} error /><Button label="Try again" onPress={resource.refresh} /></> : <>
      {!resource.data?.rows.length && <PulseText>No notifications yet.</PulseText>}
      {resource.data?.rows.map(notification => <View key={notification.id} style={{ padding: 16, gap: 10, borderWidth: 1, borderColor: notification.read_at ? '#777' : '#ff73ba', borderRadius: 16 }}>
        <PulseText size={20}>{!notification.read_at ? 'Unread · ' : ''}{notification.event_title} was updated</PulseText>
        <PulseText size={14}>{new Date(notification.created_at).toLocaleString()}</PulseText>
        {notificationChanges(notification).map((line, index) => <PulseText key={index} size={14}>{line}</PulseText>)}
        <Button label="Open event" disabled={busy} onPress={() => void read(notification)} />
      </View>)}
      {page > 0 && <Button label="Previous" disabled={busy} onPress={() => setPage(page - 1)} />}
      {(page + 1) * 20 < (resource.data?.count ?? 0) && <Button label="Next" disabled={busy} onPress={() => setPage(page + 1)} />}
    </>}
  </View></Screen>;
}
