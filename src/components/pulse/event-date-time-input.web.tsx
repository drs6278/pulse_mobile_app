import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { PulseColors as C, PulseLayout, PulseRadius, PulseType } from '@/constants/pulse-theme';
import { PulseText } from './ui';
import type { EventDateTimeInputProps } from './event-date-time-input';

export function EventDateTimeInput({ label, value, disabled, onChange, mode: inputMode, focusRequest, compact = false }: EventDateTimeInputProps) {
  const dateRef = useRef<HTMLInputElement>(null), timeRef = useRef<HTMLInputElement>(null);
  const focusId = focusRequest?.id, focusMode = focusRequest?.mode;
  useEffect(() => { if (focusId) (focusMode === 'date' ? dateRef : timeRef).current?.focus(); }, [focusId, focusMode]);
  // Compact: one row of label, date, time. The inputs shrink to share the row instead of wrapping.
  return <View style={compact ? { flexDirection: 'row', alignItems: 'center', gap: 8 } : { gap: 8 }}>
    {compact && <View style={{ width: 44 }}><PulseText variant="label" tone="muted">{label}</PulseText></View>}
    {(['date', 'time'] as const).filter(mode => !inputMode || mode === inputMode).map(mode => <label key={mode} style={compact ? { display: 'flex', flex: mode === 'date' ? '1.4 1 0' : '1 1 0', minWidth: 0 } : { display: 'grid', gap: 6 }}>
      {!compact && <PulseText size={14}>{label} {mode}</PulseText>}
      <input ref={mode === 'date' ? dateRef : timeRef} type={mode} aria-label={`${label} ${mode}`} disabled={disabled}
        value={mode === 'date' ? value.slice(0, 10) : value.slice(11, 16)}
        onChange={event => {
          if (!event.target.value || !event.target.validity.valid) return;
          onChange(mode === 'date' ? `${event.target.value}T${value.slice(11)}` : `${value.slice(0, 10)}T${event.target.value}:00`);
        }}
        style={compact
          ? { height: PulseLayout.compactControlHeight, boxSizing: 'border-box', width: '100%', minWidth: 0, padding: '0 10px', borderRadius: PulseRadius.md, border: `1px solid ${C.border}`, background: C.surfaceRaised, color: C.text, colorScheme: 'dark', fontFamily: PulseType.label.fontFamily, fontSize: 14 }
          : { minHeight: 48, boxSizing: 'border-box', width: '100%', minWidth: 0, padding: 12, borderRadius: 10, border: `1px solid ${C.muted}`, background: C.surface, color: C.text, colorScheme: 'dark', font: 'inherit', fontSize: 16 }} />
    </label>)}
  </View>;
}
