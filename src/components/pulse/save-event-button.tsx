import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { PulseColors as C } from '@/constants/pulse-theme';
import { useSavedEvents } from '@/providers/saved-events-provider';
import { PulseIcon, PulseText } from './ui';
import { Message } from './schedule/controls';

export function SaveEventButton({ id, title }: { id: string; title: string }) {
  const saved = useSavedEvents();
  const [error, setError] = useState<string | null>(null);
  const selected = !!saved.data?.some(row => row.event_id === id);
  const disabled = saved.busy || saved.loading || !!saved.error;
  async function toggle() {
    setError(null);
    try { await saved.setSaved(id, !selected); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save event.'); }
  }
  return <View style={{ gap: 6 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${selected ? 'Unsave' : 'Save'} ${title}`} accessibilityHint={selected ? 'Remove this event from Saved Events' : 'Keep this event in Saved Events to find it later'} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => void toggle()} style={({ pressed }) => ({ minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.pink, backgroundColor: selected ? C.surface : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}>
      <PulseIcon name={selected ? 'bookmarkFilled' : 'bookmark'} color={C.pink} size={24} />
      <PulseText size={14}>{selected ? 'Saved' : 'Save event'}</PulseText>
    </Pressable>
    <Message text={error || saved.error} error />
    {saved.error && <Pressable accessibilityRole="button" onPress={saved.refresh} style={{ minHeight: 44, justifyContent: 'center' }}><PulseText size={14}>Retry saved events</PulseText></Pressable>}
  </View>;
}
