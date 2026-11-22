import DateTimePicker from '@react-native-community/datetimepicker';
import { DateTime } from 'luxon';
import { useEffect, useRef, useState } from 'react';
import { Platform, View, type ViewInstance } from 'react-native';

import { PulseColors as C } from '@/constants/pulse-theme';
import { validZone } from '@/lib/schedule/time';
import { Button } from './schedule/controls';
import { Button as PillButton } from './ui/button';
import { PulseText } from './ui/text';

export type EventDateTimeInputProps = {
  label: string;
  value: string;
  timezone: string;
  disabled: boolean;
  onChange: (value: string) => void;
  mode?: 'date' | 'time';
  focusRequest?: { id: number; mode: 'date' | 'time' };
  /** Date and time as small side-by-side pills showing only the value, for the event form. */
  compact?: boolean;
};

export function EventDateTimeInput({ label, value, timezone, disabled, onChange, mode: inputMode, focusRequest, compact = false }: EventDateTimeInputProps) {
  const [mode, setMode] = useState<'date' | 'time' | null>(null);
  const dateRef = useRef<ViewInstance>(null), timeRef = useRef<ViewInstance>(null);
  const focusId = focusRequest?.id, focusMode = focusRequest?.mode;
  useEffect(() => { if (focusId) (focusMode === 'date' ? dateRef : timeRef).current?.focus(); }, [focusId, focusMode]);
  const parsed = DateTime.fromISO(value, { zone: timezone });
  const fallback = DateTime.fromISO(value.slice(0, 10), { zone: validZone(timezone) ? timezone : 'UTC' });
  const date = parsed.isValid ? parsed : fallback.isValid ? fallback : DateTime.now().setZone('UTC');
  const dateText = date.toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY), timeText = date.toLocaleString(DateTime.TIME_SIMPLE);
  return <View style={{ gap: 8 }}>
    {compact ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 44 }}><PulseText variant="label" tone="muted">{label}</PulseText></View>
      {inputMode !== 'time' && <View style={{ flex: 1.4, minWidth: 0 }}><PillButton compact buttonRef={dateRef} label={date.toLocaleString({ weekday: 'short', month: 'short', day: 'numeric' })} accessibilityLabel={`${label} date: ${dateText}`} expanded={mode === 'date'} disabled={disabled} onPress={() => setMode(mode === 'date' ? null : 'date')} /></View>}
      {inputMode !== 'date' && <View style={{ flex: 1, minWidth: 0 }}><PillButton compact buttonRef={timeRef} label={timeText} accessibilityLabel={`${label} time: ${timeText}`} expanded={mode === 'time'} disabled={disabled} onPress={() => setMode(mode === 'time' ? null : 'time')} /></View>}
    </View> : <>
      {inputMode !== 'time' && <Button buttonRef={dateRef} label={`${label} date: ${dateText}`} disabled={disabled} onPress={() => setMode('date')} />}
      {inputMode !== 'date' && <Button buttonRef={timeRef} label={`${label} time: ${timeText}`} disabled={disabled} onPress={() => setMode('time')} />}
    </>}
    {mode && !disabled && <>
      <DateTimePicker testID={`${label} ${mode} picker`} value={date.toJSDate()} mode={mode} timeZoneName={validZone(timezone) ? timezone : 'UTC'}
        display={Platform.OS === 'ios' ? 'spinner' : 'default'} themeVariant="dark" accentColor={C.pink}
        onChange={(event, selected) => {
          if (Platform.OS !== 'ios') setMode(null);
          if (event.type !== 'set' || !selected) return;
          const picked = DateTime.fromJSDate(selected, { zone: timezone });
          const next = mode === 'date' ? date.set({ year: picked.year, month: picked.month, day: picked.day }) : date.set({ hour: picked.hour, minute: picked.minute, second: 0 });
          onChange(next.toFormat("yyyy-MM-dd'T'HH:mm:ss"));
        }} />
      {Platform.OS === 'ios' && <Button label="Done" onPress={() => setMode(null)} />}
    </>}
  </View>;
}
