import { Pressable, View } from 'react-native';

import { PulseColors as C, PulseLayout, PulseRadius, PulseSpacing } from '@/constants/pulse-theme';
import { PulseText } from './text';

export function SegmentedControl<T extends string>({ label, options, value, onChange, formatLabel = String }: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  formatLabel?: (option: T) => string;
}) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', padding: 2, borderRadius: PulseRadius.pill, backgroundColor: C.surfaceRaised }}>
    {options.map(option => {
      const checked = option === value;
      return <Pressable
        key={option}
        accessibilityRole="radio"
        accessibilityLabel={`${label}: ${formatLabel(option)}`}
        accessibilityState={{ checked }}
        onPress={() => onChange(option)}
        hitSlop={4}
        style={{ minHeight: PulseLayout.compactControlHeight - 4, paddingHorizontal: PulseSpacing.md, borderRadius: PulseRadius.pill, backgroundColor: checked ? C.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        <PulseText variant="label" tone={checked ? 'onAccent' : 'muted'}>{formatLabel(option)}</PulseText>
      </Pressable>;
    })}
  </View>;
}
