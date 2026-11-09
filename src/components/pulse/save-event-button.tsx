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
    <Pressable accessibilityRole="button" accessibilityLabel={`${selected ? 'Unsave' : 'Save'} ${title}`} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => void toggle()} style={{ minHeight: 48, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: disabled ? 0.5 : 1 }}>
      <PulseIcon name={selected ? 'bookmarkFilled' : 'bookmark'} color={C.pink} size={24} />
      <PulseText size={14}>{selected ? 'Saved' : 'Save event'}</PulseText>
    </Pressable>
    <Message text={error || saved.error} error />
    {saved.error && <Pressable accessibilityRole="button" onPress={saved.refresh} style={{ minHeight: 44, justifyContent: 'center' }}><PulseText size={14}>Retry saved events</PulseText></Pressable>}
  </View>;
}
