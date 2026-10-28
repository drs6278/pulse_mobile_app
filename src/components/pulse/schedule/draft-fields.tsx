import { DateTime } from 'luxon';
import { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import type { ScheduleDraft } from '@/lib/schedule/types';
import { inclusiveEnd, moveScheduleStart, setInclusiveEnd } from '@/lib/schedule/editor';
import { setAllDay } from '@/lib/schedule/import/review';
import { EventDateTimeInput } from '../event-date-time-input';
import { PulseText } from '../ui';
import { Button, Disclosure, Field, Message } from './controls';

export function DraftFields({ draft, onChange, disabled = false, occurrence = false, errors = [], onBlur, focusError }: { draft: ScheduleDraft; onChange: (patch: Partial<ScheduleDraft>) => void; disabled?: boolean; occurrence?: boolean; errors?: string[]; onBlur?: () => void; focusError?: { error: string; id: number } }) {
  const [more, setMore] = useState(false);
  const titleRef = useRef<TextInput>(null), locationRef = useRef<TextInput>(null), zoneRef = useRef<TextInput>(null), intervalRef = useRef<TextInput>(null), weekdayRef = useRef<View>(null);
  useEffect(() => {
    if (!focusError) return;
    const error = focusError.error;
    if (/Title/.test(error)) titleRef.current?.focus();
    else if (/Location/.test(error)) locationRef.current?.focus();
    else if (/timezone/.test(error)) zoneRef.current?.focus();
    else if (/interval/.test(error)) intervalRef.current?.focus();
    else if (/weekday|first class/.test(error)) weekdayRef.current?.focus();
  }, [focusError]);
  const pickerFocus = (pattern: RegExp, mode: 'date' | 'time') => focusError && pattern.test(focusError.error) ? { id: focusError.id, mode } : undefined;
  const timed = useRef({ start_local: draft.start_local, end_local: draft.end_local });
  const fieldErrors = (pattern: RegExp) => errors.filter(error => pattern.test(error)).map(error => <Message key={error} text={error} error />);
  return <View style={{ gap: 14 }}>
    {!occurrence && <>
      <Field label="Title" value={draft.title} onChange={title => onChange({ title })} editable={!disabled} inputRef={titleRef} onBlur={onBlur} placeholder="What are you planning?" />
      {fieldErrors(/Title/)}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(['class', 'commitment'] as const).map(kind => <Button key={kind} label={kind === 'class' ? 'Class' : 'Commitment'} selected={draft.kind === kind} disabled={disabled} onPress={() => onChange({ kind })} />)}</View>
    </>}
    <PulseText size={18}>Date & time</PulseText>
    <Message text={`Times in ${draft.timezone.replace(/_/g, ' ')}.`} />
    {!occurrence && <Button label="All day" selected={draft.all_day} disabled={disabled} onPress={() => {
      if (!draft.all_day) { timed.current = { start_local: draft.start_local, end_local: draft.end_local }; onChange(setAllDay(draft, true)); }
      else {
        const start = `${draft.start_local.slice(0, 10)}T${timed.current.start_local.slice(11)}`;
        const lastDay = inclusiveEnd(draft).slice(0, 10);
        let end = `${lastDay}T${timed.current.end_local.slice(11)}`;
        if (end <= start) end = DateTime.fromISO(start, { zone: 'UTC' }).plus({ hours: 1 }).toFormat("yyyy-MM-dd'T'HH:mm:ss");
        onChange({ all_day: false, start_local: start, end_local: end });
      }
    }} />}
    <EventDateTimeInput focusRequest={pickerFocus(/local dates|All-day/, 'date')} label="Start" value={draft.start_local} timezone={draft.timezone} mode={draft.all_day ? 'date' : undefined} disabled={disabled} onChange={value => onChange(moveScheduleStart(draft, value))} />
    <EventDateTimeInput focusRequest={pickerFocus(/End must/, draft.all_day ? 'date' : 'time')} label={draft.all_day ? 'Last day' : 'End'} value={inclusiveEnd(draft)} timezone={draft.timezone} mode={draft.all_day ? 'date' : undefined} disabled={disabled} onChange={value => onChange({ end_local: setInclusiveEnd(value, draft.all_day) })} />
    {fieldErrors(/local dates|End must|All-day/)}
    {!occurrence && <>
      <Button label="Repeat weekly" selected={!!draft.recurrence} disabled={disabled} onPress={() => onChange({ recurrence: draft.recurrence ? null : { days: [DateTime.fromISO(draft.start_local, { zone: 'UTC' }).weekday || 1], interval: 1, weekStart: 1, count: null, until: null }, term_end: DateTime.fromISO(draft.start_local, { zone: 'UTC' }).plus({ months: 4 }).toISODate() ?? draft.term_end })} />
      {draft.recurrence && <>
        <PulseText size={14}>Repeats on</PulseText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => <Button buttonRef={index === 0 ? weekdayRef : undefined} key={day} label={day} selected={draft.recurrence!.days.includes(index + 1)} disabled={disabled} onPress={() => { const days = draft.recurrence!.days; onChange({ recurrence: { ...draft.recurrence!, days: days.includes(index + 1) ? days.filter(item => item !== index + 1) : [...days, index + 1].sort() } }); }} />)}</View>
        {fieldErrors(/weekday|first class/)}
        <EventDateTimeInput focusRequest={pickerFocus(/Semester/, 'date')} label="Repeat until" mode="date" value={`${draft.term_end}T00:00:00`} timezone="UTC" disabled={disabled} onChange={value => onChange({ term_end: value.slice(0, 10) })} />
        {fieldErrors(/Semester/)}
        <Disclosure label="Repeat options" forceOpen={errors.some(error => /interval|week start/.test(error))} summary={`Every ${draft.recurrence.interval === 1 ? 'week' : `${draft.recurrence.interval} weeks`}`}>
          <Field inputRef={intervalRef} label="Every N weeks" numeric value={String(draft.recurrence.interval)} onChange={value => onChange({ recurrence: { ...draft.recurrence!, interval: Number(value) } })} editable={!disabled} onBlur={onBlur} />
          {fieldErrors(/interval|week start/)}
        </Disclosure>
        {(draft.recurrence.count !== null || draft.recurrence.until) && <Message text={`Imported limit preserved: ${draft.recurrence.count !== null ? `${draft.recurrence.count} occurrences` : draft.recurrence.until}. Turn repeat off and on to replace it.`} />}
      </>}
      {!draft.recurrence && !!draft.rdates.length && <EventDateTimeInput label="Schedule through" mode="date" value={`${draft.term_end}T00:00:00`} timezone="UTC" disabled={disabled} onChange={value => onChange({ term_end: value.slice(0, 10) })} />}
      <Button label="More options" expanded={more} onPress={() => setMore(!more)} />
      {!more && <Message text={`${draft.location || 'No location'} · ${draft.timezone.replace(/_/g, ' ')} · ${draft.busy ? 'Blocks availability' : 'Does not block availability'}`} />}
      {(more || errors.some(error => /timezone|Location/.test(error))) && <>
        <Field inputRef={locationRef} label="Location" value={draft.location} onChange={location => onChange({ location })} editable={!disabled} onBlur={onBlur} />
        {fieldErrors(/Location/)}
        <Field inputRef={zoneRef} label="Timezone" value={draft.timezone} onChange={timezone => onChange({ timezone: timezone.trim() })} editable={!disabled} placeholder="America/New_York" onBlur={onBlur} />
        {fieldErrors(/timezone/)}
        <Button label="Blocks availability" selected={draft.busy} disabled={disabled} onPress={() => onChange({ busy: !draft.busy })} />
        <Message text="Repeated daylight-saving times use the earlier offset. Times in a skipped hour cannot be saved." />
      </>}
      {!!(draft.rdates.length || draft.exdates.length) && <Message text={`${draft.rdates.length} additional and ${draft.exdates.length} excluded imported dates are preserved.`} />}
    </>}
  </View>;
}
