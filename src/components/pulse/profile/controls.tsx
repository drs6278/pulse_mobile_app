import type { PropsWithChildren } from 'react';
import { StyleSheet, type TextInputProps } from 'react-native';
import type { Href } from 'expo-router';
import { PulseColors as C, PulseRadius, PulseSpacing } from '@/constants/pulse-theme';
import { Avatar } from '../ui/avatar';
import { Button } from '../ui/button';
import { InlineMessage, LoadingState } from '../ui/feedback';
import { ListRow } from '../ui/surfaces';
import { PulseText } from '../ui/text';
import { TextField } from '../ui/text-field';

export const profileStyles = StyleSheet.create({
  content: { padding: PulseSpacing.lg, gap: PulseSpacing.lg, paddingBottom: PulseSpacing.xxl },
  card: { padding: PulseSpacing.lg, borderRadius: PulseRadius.lg, backgroundColor: C.surface, gap: PulseSpacing.md, borderWidth: 1, borderColor: C.border },
});
export function ProfileText({ children, muted = false, title = false, pink = false }: PropsWithChildren<{ muted?: boolean; title?: boolean; pink?: boolean }>) {
  return <PulseText variant={title ? 'title' : 'body'} tone={pink ? 'accent' : muted ? 'muted' : 'default'} accessibilityRole={title ? 'header' : undefined} style={{ flexShrink: 1 }}>{children}</PulseText>;
}
export function ProfileButton({ label, onPress, disabled = false, primary = false, danger = false }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; danger?: boolean }) {
  return <Button label={label} onPress={onPress} disabled={disabled} variant={primary ? 'primary' : danger ? 'danger' : 'secondary'} />;
}
export function ProfileLink({ href, label, detail }: { href: Href; label: string; detail?: string }) {
  return <ListRow href={href} label={label} detail={detail} />;
}
export function ProfileField({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return <TextField label={label} error={error} {...props} />;
}
export function ProfileMessage({ text, error = false }: { text?: string | null; error?: boolean }) {
  return <InlineMessage text={text} error={error} />;
}
export function ProfileLoading({ label = 'Loading profile' }: { label?: string }) {
  return <LoadingState label={label} showLabel />;
}
export function ProfileAvatar({ name, path, preview }: { name: string; path: string | null; preview?: string }) {
  return <Avatar name={name} path={path} preview={preview} />;
}
