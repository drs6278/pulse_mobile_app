import { canEditEvent } from '@/lib/event-edit';
import type { PulseEvent } from '@/lib/event-query';

// Owner-only for now: club admins are not granted access here.
export function useEventPermission(event: PulseEvent | null | undefined, user?: string) {
  return !!event && canEditEvent(event, user);
}
