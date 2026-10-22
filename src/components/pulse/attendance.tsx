import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useUserResource } from '@/hooks/use-user-resource';
import { useDiscoveryRefresh } from '@/hooks/use-discovery-refresh';
import { loadAttendance, type Attendance } from '@/lib/rsvp-repository';
import { supabase } from '@/lib/supabase';
import { Button, Field, Message } from './schedule/controls';
import { PulseText } from './ui';

export function attendanceLabel(value: Attendance) {
  return `${value.going} going${value.capacity === null ? ' · No capacity limit' : ` / ${value.capacity} seats`} · ${value.waitlisted} waitlisted`;
}

export function CapacityEditor({ eventId, capacity, onSaved }: { eventId: string; capacity: number | null; onSaved: () => void }) {
  const [value, setValue] = useState(capacity === null ? '' : String(capacity));
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function save() {
    setError(null); setMessage(null);
    if (value.trim() && (!/^\d+$/.test(value.trim()) || Number(value) < 1 || Number(value) > 2147483647)) { setError('Enter a positive whole number, or leave blank for unlimited.'); return; }
    setBusy(true);
    try {
      const { error: failure } = await supabase.rpc('set_event_capacity', { p_event: eventId, p_capacity: value.trim() ? Number(value) : null });
      if (failure) throw failure;
      setMessage('Capacity saved. Eligible waitlisted users receive available seats automatically.');
      onSaved();
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  return <View style={{ gap: 12 }}><Field label="Attendance capacity (blank = unlimited)" value={value} onChange={setValue} editable={!busy} /><Button label="Save capacity" disabled={busy} onPress={() => void save()} /><Message text={message} /><Message text={error} error /></View>;
}

export function EventAttendance({ eventId }: { eventId: string }) {
  const loader = useCallback((_user: string, signal: AbortSignal) => loadAttendance(supabase, [eventId], signal), [eventId]);
  const resource = useUserResource(loader);
  useDiscoveryRefresh(resource.refresh, `attendance:${eventId}`);
  return <View style={{ gap: 8 }}><PulseText>{resource.data?.[0] ? attendanceLabel(resource.data[0]) : 'Attendance unavailable'}</PulseText><Message text={resource.error} error /><Button label="Refresh attendance" disabled={resource.loading} onPress={resource.refresh} /></View>;
}
