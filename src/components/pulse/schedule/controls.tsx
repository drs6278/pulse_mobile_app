import { useState, type ReactNode, type Ref } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { PulseColors as C } from '@/constants/pulse-theme';
import { PulseText } from '../ui';

export function Button({ label, onPress, disabled = false, danger = false, selected, primary = false, expanded, buttonRef }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean; selected?: boolean; primary?: boolean; expanded?: boolean; buttonRef?: Ref<View> }) {
  return <Pressable ref={buttonRef} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected, expanded }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 44, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: danger || selected || primary ? C.pink : C.border, backgroundColor: primary || selected ? C.pink : C.surface, alignItems: 'center', justifyContent: 'center', opacity: disabled || pressed ? 0.5 : 1 })}>
    <PulseText size={15} color={danger ? C.pink : C.text}>{label}</PulseText>
  </Pressable>;
}
export function Field({ label, value, onChange, editable = true, placeholder, numeric = false, inputRef, onBlur }: { label: string; value: string; onChange: (value: string) => void; editable?: boolean; placeholder?: string; numeric?: boolean; inputRef?: Ref<TextInput>; onBlur?: () => void }) {
  return <View style={{ gap: 6 }}><PulseText size={14}>{label}</PulseText><TextInput ref={inputRef} onBlur={onBlur} accessibilityLabel={label} value={value} onChangeText={onChange} editable={editable} placeholder={placeholder} placeholderTextColor={C.muted} autoCorrect={false} autoCapitalize="none" keyboardType={numeric ? 'number-pad' : 'default'} style={{ minHeight: 48, padding: 12, color: C.text, borderWidth: 1, borderColor: C.muted, borderRadius: 10, fontSize: 16 }} /></View>;
}
export function Disclosure({ label, children, summary, initiallyOpen = false, forceOpen = false }: { label: string; children: ReactNode; summary?: string; initiallyOpen?: boolean; forceOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <View style={{ gap: 10 }}><Button label={label} expanded={open || forceOpen} onPress={() => setOpen(!open)} />{!open && !forceOpen && summary && <Message text={summary} />}{(open || forceOpen) && children}</View>;
}
export function Message({ text, error = false }: { text: string | null; error?: boolean }) {
  if (!text) return null;
  return <View accessible={error} accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite"><PulseText size={14} color={error ? C.pink : C.muted}>{text}</PulseText></View>;
}
export function Loading() { return <ActivityIndicator color={C.pink} accessibilityLabel="Loading schedule" style={{ padding: 20 }} />; }
