import { Link, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { PulseColors as C, PulseLayout, PulseRadius, PulseSpacing } from '@/constants/pulse-theme';
import { PulseIcon, type PulseIconName } from './icon';
import { PulseText } from './text';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ padding: PulseSpacing.lg, gap: PulseSpacing.md, borderRadius: PulseRadius.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }, style]}>{children}</View>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <View style={{ gap: PulseSpacing.md }}>
    <PulseText variant="heading" accessibilityRole="header">{title}</PulseText>
    {children}
  </View>;
}

export function ListRow({ label, detail, href, onPress, icon, danger = false }: {
  label: string;
  detail?: string;
  href?: Href;
  onPress?: () => void;
  icon?: PulseIconName;
  danger?: boolean;
}) {
  const content = <>
    {icon && <PulseIcon name={icon} color={danger ? C.danger : C.textMuted} />}
    <View style={{ flex: 1 }}>
      <PulseText variant="body" tone={danger ? 'danger' : 'default'}>{label}</PulseText>
      {!!detail && <PulseText variant="label" tone="muted">{detail}</PulseText>}
    </View>
    <PulseIcon name="next" size={18} />
  </>;
  const accessibilityLabel = detail ? `${label}. ${detail}` : label;
  const style: ViewStyle = { minHeight: PulseLayout.controlHeight + PulseSpacing.sm, paddingVertical: PulseSpacing.sm, flexDirection: 'row', alignItems: 'center', gap: PulseSpacing.md };
  if (href) return <Link href={href} asChild><Pressable accessibilityRole="link" accessibilityLabel={accessibilityLabel} style={style}>{content}</Pressable></Link>;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={style}>{content}</Pressable>;
}
