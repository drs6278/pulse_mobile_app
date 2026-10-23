import { View } from 'react-native';
import { PulseColors as C } from '@/constants/pulse-theme';
import { PulseText } from './ui';
import type { EventDateTimeInputProps } from './event-date-time-input';

export function EventDateTimeInput({ label, value, disabled, onChange }: EventDateTimeInputProps) {
  return <View style={{ gap: 8 }}>
    {(['date', 'time'] as const).map(mode => <label key={mode} style={{ display: 'grid', gap: 6 }}>
      <PulseText size={14}>{label} {mode}</PulseText>
      <input type={mode} aria-label={`${label} ${mode}`} disabled={disabled}
        value={mode === 'date' ? value.slice(0, 10) : value.slice(11, 16)}
        onChange={event => {
          if (!event.target.value || !event.target.validity.valid) return;
          onChange(mode === 'date' ? `${event.target.value}T${value.slice(11)}` : `${value.slice(0, 10)}T${event.target.value}:00`);
        }}
        style={{ minHeight: 48, boxSizing: 'border-box', width: '100%', minWidth: 0, padding: 12, borderRadius: 10, border: `1px solid ${C.muted}`, background: C.surface, color: C.text, colorScheme: 'dark', font: 'inherit', fontSize: 16 }} />
    </label>)}
  </View>;
}
