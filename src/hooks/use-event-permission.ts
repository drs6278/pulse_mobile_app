import { useEffect, useState } from 'react';
import { communityRpc } from '@/lib/community';
import { canEditEvent } from '@/lib/event-edit';
import type { PulseEvent } from '@/lib/event-query';

export function useEventPermission(event: PulseEvent | null | undefined, user?: string) {
  const [permission, setPermission] = useState<{ key: string; allowed: boolean } | null>(null);
  const key = `${user}:${event?.id}:${event?.pulse_revision}`;
  useEffect(() => {
    let active = true;
    if (event?.club_id) void communityRpc<boolean>('community_can_edit_event', { p_event: event.id }).then(allowed => { if (active) setPermission({ key, allowed }); }).catch(() => { if (active) setPermission({ key, allowed: false }); });
    return () => { active = false; };
  }, [event?.club_id, event?.id, key]);
  return event?.club_id ? permission?.key === key && permission.allowed : !!event && canEditEvent(event, user);
}
