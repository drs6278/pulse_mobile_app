import { Link, type Href } from 'expo-router';
import type { Ref } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { PulseColors as C, PulseLayout, PulseRadius, PulseSpacing } from '@/constants/pulse-theme';
import { PulseIcon, type PulseIconName } from './icon';
import { PulseText, type PulseTextTone } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const faces: Record<ButtonVariant, { container: ViewStyle; tone: PulseTextTone; color: string }> = {
  primary: { container: { backgroundColor: C.accent, borderColor: C.accent }, tone: 'onAccent', color: C.onAccent },
  secondary: { container: { backgroundColor: C.surfaceRaised, borderColor: C.border }, tone: 'default', color: C.text },
  ghost: { container: { backgroundColor: 'transparent', borderColor: 'transparent' }, tone: 'accent', color: C.accent },
  danger: { container: { backgroundColor: 'transparent', borderColor: C.danger }, tone: 'danger', color: C.danger },
};

export function Button({ label, onPress, href, variant = 'secondary', compact = false, disabled = false, loading = false, selected, expanded, icon, accessibilityLabel, buttonRef }: {
  label: string;
  onPress?: () => void;
  href?: Href;
  variant?: ButtonVariant;
  compact?: boolean;
  disabled?: boolean;
  loading?: boolean;
  selected?: boolean;
  expanded?: boolean;
  icon?: PulseIconName;
  accessibilityLabel?: string;
  buttonRef?: Ref<View>;
}) {
  const face = faces[selected ? 'primary' : variant];
  const inactive = disabled || loading;
  const base = [styles.base, compact && styles.compact, face.container];
  const content = <>
    {loading ? <ActivityIndicator color={face.color} /> : icon && <PulseIcon name={icon} size={20} color={face.color} />}
    <PulseText variant="label" tone={face.tone}>{label}</PulseText>
  </>;
  const a11y = { accessibilityLabel: accessibilityLabel ?? label, accessibilityState: { disabled: inactive, busy: loading, selected, expanded } };
  // Link's asChild slot merges plain style objects, not style callbacks.
  if (href) return <Link href={href} asChild><Pressable accessibilityRole="link" {...a11y} disabled={inactive} style={StyleSheet.flatten([base, inactive && styles.dimmed])}>{content}</Pressable></Link>;
  return <Pressable ref={buttonRef} accessibilityRole="button" {...a11y} disabled={inactive} onPress={onPress} hitSlop={compact ? 4 : undefined} style={({ pressed }) => [base, (inactive || pressed) && styles.dimmed]}>{content}</Pressable>;
}

export function IconButton({ icon, label, onPress, href, color = C.textMuted, badge = 0 }: {
  icon: PulseIconName;
  label: string;
  onPress?: () => void;
  href?: Href;
  color?: string;
  badge?: number;
}) {
  const content = <>
    <PulseIcon name={icon} color={color} />
    {badge > 0 && <View style={styles.badge}><PulseText variant="caption" tone="onAccent">{badge > 99 ? '99+' : badge}</PulseText></View>}
  </>;
  if (href) return <Link href={href} asChild><Pressable accessibilityRole="link" accessibilityLabel={label} style={styles.icon}>{content}</Pressable></Link>;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.icon}>{content}</Pressable>;
}

const styles = StyleSheet.create({
  icon: { width: PulseLayout.controlHeight, height: PulseLayout.controlHeight, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: PulseSpacing.xs, right: 0, minWidth: 18, paddingHorizontal: PulseSpacing.xs, borderRadius: PulseRadius.pill, backgroundColor: C.accent, alignItems: 'center' },
  base: {
    minHeight: PulseLayout.controlHeight,
    paddingHorizontal: PulseSpacing.lg,
    paddingVertical: PulseSpacing.sm,
    borderRadius: PulseRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: PulseSpacing.sm,
  },
  compact: { minHeight: PulseLayout.compactControlHeight, paddingHorizontal: PulseSpacing.md },
  dimmed: { opacity: 0.55 },
});
