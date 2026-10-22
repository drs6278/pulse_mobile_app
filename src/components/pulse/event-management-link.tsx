import { useCallback } from 'react';
import { router } from 'expo-router';
import { useUserResource } from '@/hooks/use-user-resource';
import { rpc } from '@/lib/community';
import type { PulseEvent } from '@/lib/event-query';
import { Button } from './schedule/controls';
export function EventManagementLink({ event }: { event: PulseEvent }) {
  const loader = useCallback(async () => {
    if (!event.pulse_owner_id && !event.pulse_club_id) return false;
    return rpc<boolean>('can_manage_event', { p_owner: event.pulse_owner_id ?? null, p_club: event.pulse_club_id ?? null });
  }, [event.pulse_owner_id, event.pulse_club_id]);
  const { data } = useUserResource(loader);
  return data ? <Button label="Manage event" onPress={() => router.push({ pathname: '/edit-event', params: { id: event.id } })} /> : null;
}
