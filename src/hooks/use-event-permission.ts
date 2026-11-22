import { useEffect, useState } from 'react';
import { communityRpc } from '@/lib/community';
import { canEditEvent } from '@/lib/event-edit';
import type { PulseEvent } from '@/lib/event-query';

export function useEventPermission(event: PulseEvent | null | undefined, user?: string, action: 'edit' | 'delete' = 'edit') {
  const [permission, setPermission] = useState<{ key: string; allowed: boolean } | null>(null);
  const key = `${action}:${user}:${event?.id}:${event?.pulse_revision}`;
  useEffect(() => {
    let active = true;
    if (event?.club_id) void communityRpc<boolean>(action === 'delete' ? 'community_can_delete_event' : 'community_can_edit_event', { p_event: event.id }).then(allowed => { if (active) setPermission({ key, allowed }); }).catch(() => { if (active) setPermission({ key, allowed: false }); });
    return () => { active = false; };
  }, [action, event?.club_id, event?.id, key]);
  return event?.club_id ? permission?.key === key && permission.allowed : !!event && (action === 'delete' ? !!user && event.created_by === user : canEditEvent(event, user));
}
