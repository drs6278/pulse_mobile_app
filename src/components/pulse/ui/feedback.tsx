import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { PulseColors as C, PulseSpacing } from '@/constants/pulse-theme';
import { Button } from './button';
import { PulseText } from './text';

export function InlineMessage({ text, error = false }: { text?: string | null; error?: boolean }) {
  if (!text) return null;
  return <View accessible={error} accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite">
    <PulseText variant="label" tone={error ? 'danger' : 'muted'}>{text}</PulseText>
  </View>;
}

export function LoadingState({ label, showLabel = false }: { label: string; showLabel?: boolean }) {
  return <View style={{ padding: PulseSpacing.xl, gap: PulseSpacing.md, alignItems: 'center' }}>
    <ActivityIndicator accessibilityLabel={label} color={C.accent} />
    {showLabel && <PulseText variant="label" tone="muted">{label}…</PulseText>}
  </View>;
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return <View style={{ paddingVertical: PulseSpacing.xxl, gap: PulseSpacing.sm, alignItems: 'center' }}>
    <PulseText variant="heading" style={{ textAlign: 'center' }}>{title}</PulseText>
    {!!message && <PulseText variant="body" tone="muted" style={{ textAlign: 'center' }}>{message}</PulseText>}
    {action}
  </View>;
}

export function ErrorState({ message, onRetry, retryLabel = 'Try again' }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return <View style={{ gap: PulseSpacing.md }}>
    <InlineMessage text={message} error />
    {onRetry && <Button label={retryLabel} onPress={onRetry} />}
  </View>;
}
