import type { ReactNode } from 'react';
import { Text, type AccessibilityRole, type StyleProp, type TextStyle } from 'react-native';

import { PulseColors as C, PulseFonts, PulseType, type PulseTextVariant } from '@/constants/pulse-theme';

const tones = {
  default: C.text,
  muted: C.textMuted,
  accent: C.accent,
  danger: C.danger,
  onAccent: C.onAccent,
} as const;

export type PulseTextTone = keyof typeof tones;

export function PulseText({ children, variant, tone = 'default', size, font, color, lineHeight, numberOfLines, accessibilityRole, style }: {
  children: ReactNode;
  variant?: PulseTextVariant;
  tone?: PulseTextTone;
  /** Legacy sizing, removed once every call site uses `variant`. */
  size?: number;
  font?: keyof typeof PulseFonts;
  color?: string;
  lineHeight?: number;
  numberOfLines?: number;
  accessibilityRole?: AccessibilityRole;
  style?: StyleProp<TextStyle>;
}) {
  const type = variant
    ? PulseType[variant]
    : { fontFamily: PulseFonts[font ?? 'semibold'], fontSize: size ?? 16, lineHeight: lineHeight ?? (size ?? 16) * 1.25 };
  return <Text accessibilityRole={accessibilityRole} numberOfLines={numberOfLines} style={[type, { color: color ?? tones[tone] }, style]}>{children}</Text>;
}
