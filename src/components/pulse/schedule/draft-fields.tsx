import { DateTime } from 'luxon';
import { View } from 'react-native';
import type { ScheduleDraft } from '@/lib/schedule/types';
import { setAllDay, setLocalPart } from '@/lib/schedule/import/review';
import { Button, Field, Message } from './controls';

export function DraftFields({ draft, onChange, disabled = false, occurrence = false }: { draft: ScheduleDraft; onChange: (patch: Partial<ScheduleDraft>) => void; disabled?: boolean; occurrence?: boolean }) {
  return <View style={{ gap: 12 }}>
    {!occurrence && <>
      <Field label="Title" value={draft.title} onChange={title => onChange({ title })} editable={!disabled} />
      <Field label="Location" value={draft.location} onChange={location => onChange({ location })} editable={!disabled} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(['class', 'commitment'] as const).map(kind => <Button key={kind} label={`${draft.kind === kind ? '✓ ' : ''}${kind === 'class' ? 'Class' : 'Commitment'}`} disabled={disabled} onPress={() => onChange({ kind })} />)}</View>
      <Field label="Timezone" value={draft.timezone} onChange={timezone => onChange({ timezone: timezone.trim() })} editable={!disabled} placeholder="America/New_York" />
    </>}
    <Message text={`Times in ${draft.timezone || 'your chosen timezone'}. Use YYYY-MM-DD dates and 24-hour times. All-day end dates are exclusive.`} />
    {(['start_local', 'end_local'] as const).map(field => <View key={field} style={{ gap: 12 }}>
      <Field label={`${field === 'start_local' ? 'Start' : 'End'} date (YYYY-MM-DD)`} value={draft[field].split('T')[0]} editable={!disabled} onChange={value => onChange({ [field]: setLocalPart(draft[field], 'date', value) })} />
      {!draft.all_day && <Field label={`${field === 'start_local' ? 'Start' : 'End'} time (HH:mm)`} value={(draft[field].split('T')[1] ?? '').replace(/:00$/, '')} editable={!disabled} onChange={value => onChange({ [field]: setLocalPart(draft[field], 'time', value) })} />}
    </View>)}
    {!occurrence && <>
      <Button label={draft.all_day ? '✓ All day' : 'Set all day'} disabled={disabled} onPress={() => onChange(setAllDay(draft, !draft.all_day))} />
      <Button label={draft.busy ? '✓ Blocks availability' : 'Does not block availability'} disabled={disabled} onPress={() => onChange({ busy: !draft.busy })} />
      <Button label={draft.recurrence ? '✓ Repeats weekly' : 'Repeat weekly'} disabled={disabled} onPress={() => onChange({ recurrence: draft.recurrence ? null : { days: [DateTime.fromISO(draft.start_local, { zone: 'UTC' }).weekday || 1], interval: 1, weekStart: 1, count: null, until: null }, term_end: DateTime.fromISO(draft.start_local, { zone: 'UTC' }).plus({ months: 4 }).toISODate() ?? draft.term_end })} />
      {draft.recurrence && <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day, index) => <Button key={day} label={`${draft.recurrence!.days.includes(index + 1) ? '✓ ' : ''}${day}`} disabled={disabled} onPress={() => { const days = draft.recurrence!.days; onChange({ recurrence: { ...draft.recurrence!, days: days.includes(index + 1) ? days.filter(item => item !== index + 1) : [...days, index + 1].sort() } }); }} />)}</View>
        <Field label="Every N weeks" numeric value={String(draft.recurrence.interval)} onChange={value => onChange({ recurrence: { ...draft.recurrence!, interval: Number(value) } })} editable={!disabled} />
        <Field label="Semester end (YYYY-MM-DD)" value={draft.term_end} onChange={term_end => onChange({ term_end })} editable={!disabled} />
        {(draft.recurrence.count !== null || draft.recurrence.until) && <Message text={`Imported recurrence limit: ${draft.recurrence.count !== null ? `${draft.recurrence.count} occurrences` : draft.recurrence.until}. This limit is preserved; turn weekly repeat off and on to replace it.`} />}
      </>}
      {!draft.recurrence && !!draft.rdates.length && <Field label="Semester end (YYYY-MM-DD)" value={draft.term_end} onChange={term_end => onChange({ term_end })} editable={!disabled} />}
      {!!(draft.rdates.length || draft.exdates.length) && <Message text={`${draft.rdates.length} additional and ${draft.exdates.length} excluded imported dates are preserved.`} />}
    </>}
  </View>;
}
