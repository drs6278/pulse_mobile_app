import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useRSVPs } from '@/providers/rsvp-provider';
import { setRSVP } from '@/lib/rsvp-repository';
import { supabase } from '@/lib/supabase';
import { PulseText, Screen, TitleHeader } from '@/components/pulse/ui';
import { Button, Loading, Message } from '@/components/pulse/schedule/controls';

export default function RSVPsScreen() {
  const resource = useRSVPs();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const active = resource.data?.filter(r => r.status !== 'cancelled') ?? [];
  async function cancel(id: string) {
    setBusy(true); setError(null);
    try { await resource.mutate(user => setRSVP(supabase, user, id, 'cancelled')); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  return <Screen header={<TitleHeader title="My RSVPs & waitlists" />}><View style={{ padding: 16, gap: 16 }}>
    <Button label="Refresh" onPress={resource.refresh} disabled={busy} /><Message text={resource.error ?? error} error />
    {resource.loading ? <Loading /> : <>{!active.length && <Message text="No active RSVPs or waitlists. Discover an event to get started." />}{active.map(r => <View key={r.event_id} style={{ gap: 8 }}>
      <PulseText size={22}>{r.event?.title ?? 'Event no longer accessible'}</PulseText><PulseText>{r.status === 'going' ? 'Confirmed' : 'Waitlisted — a seat is not yet reserved'}</PulseText>
      {r.event && <Button label="View event" onPress={() => router.push({ pathname: '/event', params: { id: r.event_id } })} />}
      <Button label={r.status === 'going' ? 'Cancel RSVP' : 'Leave waitlist'} disabled={busy} onPress={() => void cancel(r.event_id)} />
    </View>)}</>}
  </View></Screen>;
}
