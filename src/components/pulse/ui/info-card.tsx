import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PulseColors as C, PulseRadius, PulseSpacing } from '@/constants/pulse-theme';
import { PulseIcon, type PulseIconName } from './icon';
import { PreviewLink } from './layout';
import { PulseText, type PulseTextTone } from './text';

// The grouped card of icon rows used by the event page and the event create/edit form.
export function InfoCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

/** A read-only row (title + detail lines), or, with `children`, a row that holds form controls. */
export function InfoRow({ icon, title, detail, extra, href, children }: {
  icon: PulseIconName;
  title?: string;
  detail?: string | null;
  extra?: { text: string; tone: PulseTextTone } | null;
  href?: Href;
  children?: ReactNode;
}) {
  const content = <>
    <View style={styles.tile}><PulseIcon name={icon} size={18} color={C.accent} /></View>
    <View style={[styles.text, children ? styles.formText : null]}>
      {!!title && <PulseText variant="body">{title}</PulseText>}
      {!!detail && <PulseText variant="label" tone="muted">{detail}</PulseText>}
      {extra && <PulseText variant="label" tone={extra.tone}>{extra.text}</PulseText>}
      {children}
    </View>
    {href && <PulseIcon name="next" size={18} />}
  </>;
  const style = [styles.row, children ? styles.formRow : null];
  if (href) return <PreviewLink href={href} label={title ?? ''} style={StyleSheet.flatten(style)}>{content}</PreviewLink>;
  return <View style={style}>{content}</View>;
}

const styles = StyleSheet.create({
  card: { padding: PulseSpacing.md, gap: PulseSpacing.xs, borderRadius: PulseRadius.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  row: { minHeight: 48, paddingVertical: PulseSpacing.xs, flexDirection: 'row', alignItems: 'center', gap: PulseSpacing.md },
  // Controls can wrap to several lines, so the icon stays level with the first one.
  formRow: { alignItems: 'flex-start', paddingVertical: PulseSpacing.sm },
  tile: { width: 36, height: 36, borderRadius: PulseRadius.md, backgroundColor: C.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  formText: { gap: PulseSpacing.sm },
});
