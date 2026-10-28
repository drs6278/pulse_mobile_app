import DateTimePicker from '@react-native-community/datetimepicker';
import { DateTime } from 'luxon';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { PulseColors as C } from '@/constants/pulse-theme';
import { validZone } from '@/lib/schedule/time';
import { Button } from './schedule/controls';

export type EventDateTimeInputProps = {
  label: string;
  value: string;
  timezone: string;
  disabled: boolean;
  onChange: (value: string) => void;
  mode?: 'date' | 'time';
  focusRequest?: { id: number; mode: 'date' | 'time' };
};

export function EventDateTimeInput({ label, value, timezone, disabled, onChange, mode: inputMode, focusRequest }: EventDateTimeInputProps) {
  const [mode, setMode] = useState<'date' | 'time' | null>(null);
  const dateRef = useRef<View>(null), timeRef = useRef<View>(null);
  const focusId = focusRequest?.id, focusMode = focusRequest?.mode;
  useEffect(() => { if (focusId) (focusMode === 'date' ? dateRef : timeRef).current?.focus(); }, [focusId, focusMode]);
  const parsed = DateTime.fromISO(value, { zone: timezone });
  const fallback = DateTime.fromISO(value.slice(0, 10), { zone: validZone(timezone) ? timezone : 'UTC' });
  const date = parsed.isValid ? parsed : fallback.isValid ? fallback : DateTime.now().setZone('UTC');
  return <View style={{ gap: 8 }}>
    {inputMode !== 'time' && <Button buttonRef={dateRef} label={`${label} date: ${date.toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY)}`} disabled={disabled} onPress={() => setMode('date')} />}
    {inputMode !== 'date' && <Button buttonRef={timeRef} label={`${label} time: ${date.toLocaleString(DateTime.TIME_SIMPLE)}`} disabled={disabled} onPress={() => setMode('time')} />}
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
