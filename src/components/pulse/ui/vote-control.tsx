import { Pressable, View } from 'react-native';

import { PulseColors as C, PulseLayout, PulseRadius, PulseSpacing } from '@/constants/pulse-theme';
import { PulseIcon } from './icon';
import { PulseText } from './text';

export function VoteControl({ score, myVote, disabled = false, onVote }: { score: number; myVote: number; disabled?: boolean; onVote: (direction: 1 | -1) => void }) {
  const arrow = (direction: 1 | -1) => {
    const active = myVote === direction;
    return <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction === 1 ? 'Upvote' : 'Downvote'}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={() => onVote(direction)}
      hitSlop={4}
      style={{ width: PulseLayout.compactControlHeight, height: PulseLayout.compactControlHeight, alignItems: 'center', justifyContent: 'center' }}>
      <PulseIcon name={direction === 1 ? 'chevronUp' : 'chevronDown'} size={20} color={active ? C.accent : C.textMuted} />
    </Pressable>;
  };
  return <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: PulseSpacing.xs, borderRadius: PulseRadius.pill, backgroundColor: C.surfaceRaised }}>
    {arrow(1)}
    <View accessibilityLiveRegion="polite"><PulseText variant="label">{score} points</PulseText></View>
    {arrow(-1)}
  </View>;
}
