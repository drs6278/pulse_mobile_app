import { View } from 'react-native';

import { PulseColors as C, PulseRadius, PulseSpacing } from '@/constants/pulse-theme';
import { Button } from './ui/button';
import { EventPhoto } from './ui/event-photo';
import { InlineMessage } from './ui/feedback';
import { PulseIcon } from './ui/icon';
import { PulseText } from './ui/text';

export function EventPhotoField({ uri, path, busy = false, error, onChoose, onRemove }: {
  uri?: string;
  path?: string | null;
  busy?: boolean;
  error?: string | null;
  onChoose: () => void;
  onRemove: () => void;
}) {
  const hasPhoto = !!uri || !!path;
  return <View style={{ gap: PulseSpacing.sm }}>
    <PulseText variant="label">Photo</PulseText>
    {hasPhoto
      ? <EventPhoto uri={uri} path={path} style={{ height: 180, borderRadius: PulseRadius.lg }} />
      : <View style={{ height: 120, borderRadius: PulseRadius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, alignItems: 'center', justifyContent: 'center', gap: PulseSpacing.xs }}>
        <PulseIcon name="add" />
        <PulseText variant="label" tone="muted">No photo yet</PulseText>
      </View>}
    <View style={{ flexDirection: 'row', gap: PulseSpacing.sm }}>
      <View style={{ flex: 1 }}><Button label={hasPhoto ? 'Change photo' : 'Add photo'} onPress={onChoose} loading={busy} /></View>
      {hasPhoto && <View style={{ flex: 1 }}><Button label="Remove photo" variant="danger" onPress={onRemove} disabled={busy} /></View>}
    </View>
    <PulseText variant="caption" tone="muted">Shown behind your event in the feed. Location data is removed from the photo when it uploads.</PulseText>
    <InlineMessage text={error} error />
  </View>;
}
