import { Pressable, View } from 'react-native';

import { PulseColors as C, PulseLayout, PulseRadius, PulseSpacing } from '@/constants/pulse-theme';
import { PulseText } from './text';

export function ChipGroup<T extends string | number>({ title, options, selected, onSelect, multiple = false, disabled = false, formatLabel = String, formatAccessibilityLabel }: {
  title: string;
  options: readonly T[];
  selected: readonly T[];
  onSelect: (option: T) => void;
  multiple?: boolean;
  disabled?: boolean;
  formatLabel?: (option: T) => string;
  formatAccessibilityLabel?: (option: T) => string;
}) {
  return <View style={{ gap: PulseSpacing.md }}>
    <PulseText variant="label">{title}</PulseText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: PulseSpacing.sm }}>
      {options.map(option => {
        const checked = selected.includes(option);
        return <Pressable
          key={option}
          accessibilityRole={multiple ? 'checkbox' : 'radio'}
          accessibilityLabel={formatAccessibilityLabel?.(option) ?? `${title}: ${formatLabel(option)}`}
          accessibilityState={{ checked, disabled }}
          disabled={disabled}
          onPress={() => onSelect(option)}
          hitSlop={4}
          style={({ pressed }) => ({
            minHeight: PulseLayout.compactControlHeight,
            paddingHorizontal: PulseSpacing.lg,
            borderRadius: PulseRadius.pill,
            borderWidth: 1,
            borderColor: checked ? C.accent : C.border,
            backgroundColor: checked ? C.accent : C.surfaceRaised,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled || pressed ? 0.55 : 1,
          })}>
          <PulseText variant="label" tone={checked ? 'onAccent' : 'default'}>{formatLabel(option)}</PulseText>
        </Pressable>;
      })}
    </View>
  </View>;
}
