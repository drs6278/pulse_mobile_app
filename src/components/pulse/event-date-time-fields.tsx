import { DateTime } from 'luxon';
import { View } from 'react-native';

import type { EventDraft } from '@/lib/event-create';
import { moveEventStart } from '@/lib/event-create';
import { wallTime } from '@/lib/schedule/time';
import { EventDateTimeInput } from './event-date-time-input';
import { PulseText } from './ui/text';

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return [hours && `${hours} hr`, rest && `${rest} min`].filter(Boolean).join(' ');
}

// Start / End rows of date and time pills, then the duration (or what's wrong) underneath.
export function EventDateTimeFields({ draft, disabled, onChange }: { draft: EventDraft; disabled: boolean; onChange: (values: Partial<EventDraft>) => void }) {
  const start = wallTime(draft.start_local, draft.timezone), end = wallTime(draft.end_local, draft.timezone);
  const duration = start && end ? end.diff(start, 'minutes').minutes : 0;
  const error = !start || !end ? 'This time is unavailable because of daylight saving. Choose another time.'
    : duration <= 0 ? 'Choose an end time after the start.' : duration > 7 * 24 * 60 ? 'Events can last up to seven days.' : null;
  const zone = DateTime.fromISO(draft.start_local, { zone: draft.timezone }).offsetNameShort;
  return <View style={{ gap: 8 }}>
    <EventDateTimeInput compact label="Start" value={draft.start_local} timezone={draft.timezone} disabled={disabled} onChange={value => onChange(moveEventStart(draft, value))} />
    <EventDateTimeInput compact label="End" value={draft.end_local} timezone={draft.timezone} disabled={disabled} onChange={end_local => onChange({ end_local })} />
    {/* Indented past the Start/End labels so it lines up under the inputs. */}
    <View accessibilityLiveRegion="polite" style={{ marginLeft: 52 }}>
      <PulseText variant="caption" tone={error ? 'danger' : 'muted'}>{error ?? [durationLabel(duration), zone].filter(Boolean).join(' · ')}</PulseText>
    </View>
  </View>;
}
