import DateTimePicker from '@react-native-community/datetimepicker';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { PulseColors as C } from '@/constants/pulse-theme';
import { Button } from './schedule/controls';

export type EventDateTimeInputProps = {
  label: string;
  value: string;
  timezone: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

export function EventDateTimeInput({ label, value, timezone, disabled, onChange }: EventDateTimeInputProps) {
  const [mode, setMode] = useState<'date' | 'time' | null>(null);
  const date = DateTime.fromISO(value, { zone: timezone });
  return <View style={{ gap: 8 }}>
    <Button label={`${label} date: ${date.toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY)}`} disabled={disabled} onPress={() => setMode('date')} />
    <Button label={`${label} time: ${date.toLocaleString(DateTime.TIME_SIMPLE)}`} disabled={disabled} onPress={() => setMode('time')} />
    {mode && !disabled && <>
      <DateTimePicker value={date.toJSDate()} mode={mode} timeZoneName={timezone}
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
