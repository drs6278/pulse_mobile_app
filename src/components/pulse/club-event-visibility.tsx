import { View } from 'react-native';
import type { EventDraft } from '@/lib/event-create';
import { Button, PulseText } from './ui';

export function ClubEventVisibility({ value = 'public', disabled, onChange }: {
  value?: EventDraft['visibility']; disabled?: boolean; onChange: (value: NonNullable<EventDraft['visibility']>) => void;
}) {
  return <View style={{ gap: 8 }}>
    <PulseText variant="label">Event visibility</PulseText>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button label="Public" selected={value === 'public'} disabled={disabled} onPress={() => onChange('public')} />
      <Button label="Club-only" selected={value === 'club_only'} disabled={disabled} onPress={() => onChange('club_only')} />
    </View>
    <PulseText variant="caption" tone="muted">Club-only events require active membership. Switching to club-only cancels nonmember RSVPs.</PulseText>
  </View>;
}
