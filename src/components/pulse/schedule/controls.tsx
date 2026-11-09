import { useState, type ReactNode, type Ref } from 'react';
import { TextInput, View } from 'react-native';
import { PulseSpacing } from '@/constants/pulse-theme';
import { Button as BaseButton } from '../ui/button';
import { InlineMessage, LoadingState } from '../ui/feedback';
import { TextField } from '../ui/text-field';

export function Button({ label, onPress, disabled = false, danger = false, selected, primary = false, expanded, buttonRef }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean; selected?: boolean; primary?: boolean; expanded?: boolean; buttonRef?: Ref<View> }) {
  return <BaseButton label={label} onPress={onPress} disabled={disabled} selected={selected} expanded={expanded} buttonRef={buttonRef} variant={primary ? 'primary' : danger ? 'danger' : 'secondary'} />;
}
export function Field({ label, value, onChange, editable = true, placeholder, numeric = false, inputRef, onBlur }: { label: string; value: string; onChange: (value: string) => void; editable?: boolean; placeholder?: string; numeric?: boolean; inputRef?: Ref<TextInput>; onBlur?: () => void }) {
  return <TextField label={label} inputRef={inputRef} onBlur={onBlur} value={value} onChangeText={onChange} editable={editable} placeholder={placeholder} autoCorrect={false} autoCapitalize="none" keyboardType={numeric ? 'number-pad' : 'default'} />;
}
export function Disclosure({ label, children, summary, initiallyOpen = false, forceOpen = false }: { label: string; children: ReactNode; summary?: string; initiallyOpen?: boolean; forceOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <View style={{ gap: PulseSpacing.md }}><Button label={label} expanded={open || forceOpen} onPress={() => setOpen(!open)} />{!open && !forceOpen && summary && <Message text={summary} />}{(open || forceOpen) && children}</View>;
}
export function Message({ text, error = false }: { text: string | null; error?: boolean }) {
  return <InlineMessage text={text} error={error} />;
}
export function Loading() { return <LoadingState label="Loading schedule" />; }
