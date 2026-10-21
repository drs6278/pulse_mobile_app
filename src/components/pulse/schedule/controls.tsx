import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { PulseColors as C } from '@/constants/pulse-theme';
import { PulseText } from '../ui';

export function Button({ label, onPress, disabled = false, danger = false }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 44, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: danger ? C.pink : C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', opacity: disabled || pressed ? 0.5 : 1 })}>
    <PulseText size={15} color={danger ? C.pink : C.text}>{label}</PulseText>
  </Pressable>;
}
export function Field({ label, value, onChange, editable = true, placeholder, numeric = false }: { label: string; value: string; onChange: (value: string) => void; editable?: boolean; placeholder?: string; numeric?: boolean }) {
  return <View style={{ gap: 6 }}><PulseText size={14}>{label}</PulseText><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={editable} placeholder={placeholder} placeholderTextColor={C.muted} autoCorrect={false} autoCapitalize="none" keyboardType={numeric ? 'number-pad' : 'default'} style={{ minHeight: 48, padding: 12, color: C.text, borderWidth: 1, borderColor: C.muted, borderRadius: 10, fontSize: 16 }} /></View>;
}
export function Message({ text, error = false }: { text: string | null; error?: boolean }) {
  if (!text) return null;
  return <View accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite"><PulseText size={14} color={error ? C.pink : C.muted}>{text}</PulseText></View>;
}
export function Loading() { return <ActivityIndicator color={C.pink} accessibilityLabel="Loading schedule" style={{ padding: 20 }} />; }
