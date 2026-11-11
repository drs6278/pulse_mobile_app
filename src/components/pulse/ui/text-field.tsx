import { useState, type Ref } from 'react';
import { TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { PulseColors as C, PulseLayout, PulseRadius, PulseSpacing, PulseType } from '@/constants/pulse-theme';
import { InlineMessage } from './feedback';
import { PulseText } from './text';

export function TextField({ label, hideLabel = false, error, inputRef, onFocus, onBlur, style, ...props }: TextInputProps & {
  label: string;
  hideLabel?: boolean;
  error?: string | null;
  inputRef?: Ref<TextInputInstance>;
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? C.danger : focused ? C.accent : C.border;
  return <View style={{ gap: PulseSpacing.sm }}>
    {!hideLabel && <PulseText variant="label">{label}</PulseText>}
    <TextInput
      ref={inputRef}
      accessibilityLabel={label}
      placeholderTextColor={C.textMuted}
      {...props}
      onFocus={event => { setFocused(true); onFocus?.(event); }}
      onBlur={event => { setFocused(false); onBlur?.(event); }}
      style={[{
        minHeight: props.multiline ? PulseLayout.controlHeight * 2 : PulseLayout.controlHeight,
        paddingHorizontal: PulseSpacing.lg,
        paddingVertical: PulseSpacing.md,
        borderRadius: PulseRadius.md,
        borderWidth: 1,
        borderColor,
        backgroundColor: C.surfaceRaised,
        color: C.text,
        fontFamily: PulseType.body.fontFamily,
        fontSize: PulseType.body.fontSize,
        textAlignVertical: props.multiline ? 'top' : 'center',
      }, style]}
    />
    <InlineMessage text={error} error />
  </View>;
}
