import { DateTime } from 'luxon';
import { View } from 'react-native';

import type { EventDraft } from '@/lib/event-create';
import { moveEventStart } from '@/lib/event-create';
import { wallTime } from '@/lib/schedule/time';
import { EventDateTimeInput } from './event-date-time-input';
import { Message } from './schedule/controls';
import { PulseText } from './ui';

export function EventDateTimeFields({ draft, disabled, onChange }: { draft: EventDraft; disabled: boolean; onChange: (values: Partial<EventDraft>) => void }) {
  const start = wallTime(draft.start_local, draft.timezone), end = wallTime(draft.end_local, draft.timezone);
  const duration = start && end ? end.diff(start, 'minutes').minutes : 0;
  const error = !start || !end ? 'This time is unavailable because of daylight saving. Choose another time.'
    : duration <= 0 ? 'Choose an end time after the start.' : duration > 7 * 24 * 60 ? 'Events can last up to seven days.' : null;
  const zone = DateTime.fromISO(draft.start_local, { zone: draft.timezone });
  return <View style={{ gap: 14 }}>
    <PulseText size={18}>Date & time</PulseText>
    <Message text={`Times in ${draft.timezone.replace(/_/g, ' ')} (${zone.offsetNameShort}).`} />
    <PulseText size={14}>Starts</PulseText>
    <EventDateTimeInput label="Start" value={draft.start_local} timezone={draft.timezone} disabled={disabled} onChange={value => onChange(moveEventStart(draft, value))} />
    <PulseText size={14}>Ends</PulseText>
    <EventDateTimeInput label="End" value={draft.end_local} timezone={draft.timezone} disabled={disabled} onChange={end_local => onChange({ end_local })} />
    <Message error={!!error} text={error ?? `Duration: ${Math.floor(duration / 60) ? `${Math.floor(duration / 60)} hr ` : ''}${duration % 60 ? `${duration % 60} min` : ''}`} />
  </View>;
}
