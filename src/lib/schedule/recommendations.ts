import { eventInterval, type PulseEvent } from '../event-query';
import { compatibility } from './availability';
import type { Interval } from './types';

export function rankEvents(events: PulseEvent[], busy: Interval[], complete: boolean, interests: string[], attending: string[], fitsOnly: boolean) {
  const order = { compatible: 0, unknown: 1, conflicting: 2 };
  return events.filter(event => !event.pulse_cancelled && !attending.includes(String(event.id))).map(event => ({ event, compatibility: compatibility(eventInterval(event), busy, complete) }))
    .filter(item => !fitsOnly || item.compatibility === 'compatible')
    .sort((a, b) => order[a.compatibility] - order[b.compatibility] || Number(interests.includes(b.event.category)) - Number(interests.includes(a.event.category)) || (eventInterval(a.event)?.start ?? Infinity) - (eventInterval(b.event)?.start ?? Infinity) || String(a.event.id).localeCompare(String(b.event.id)));
}
