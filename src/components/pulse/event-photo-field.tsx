import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { PulseColors as C, PulseLayout, PulseRadius, PulseSpacing } from '@/constants/pulse-theme';
import { EventPhoto } from './ui/event-photo';
import { InlineMessage } from './ui/feedback';
import { PulseIcon, type PulseIconName } from './ui/icon';
import { PulseText } from './ui/text';

// Sits where the photo sits on the event page: tap the empty slot (or the photo) to choose one.
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
    {hasPhoto
      ? <View>
        {/* Screen readers get the labeled overlay button instead of a second "Change photo". */}
        <Pressable accessible={false} importantForAccessibility="no" disabled={busy} onPress={onChoose}>
          <EventPhoto uri={uri} path={path} style={styles.photo} />
        </Pressable>
        <View style={styles.overlayActions}>
          <OverlayButton icon="edit" label="Change photo" disabled={busy} onPress={onChoose} />
          <OverlayButton icon="trash" label="Remove photo" disabled={busy} onPress={onRemove} />
        </View>
        {busy && <View pointerEvents="none" style={styles.busy}><ActivityIndicator accessibilityLabel="Updating photo" color={C.text} /></View>}
      </View>
      : <Pressable accessibilityRole="button" accessibilityLabel="Add photo" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onChoose}
        style={({ pressed }) => [styles.photo, styles.empty, (busy || pressed) && styles.dimmed]}>
        {busy ? <ActivityIndicator color={C.accent} /> : <View style={styles.addTile}><PulseIcon name="add" color={C.accent} /></View>}
        <PulseText variant="label">Add a cover photo</PulseText>
        <PulseText variant="caption" tone="muted">Shown behind your event in the feed</PulseText>
      </Pressable>}
    {hasPhoto && <PulseText variant="caption" tone="muted">Location data is removed from the photo when it uploads.</PulseText>}
    <InlineMessage text={error} error />
  </View>;
}

function OverlayButton({ icon, label, disabled, onPress }: { icon: PulseIconName; label: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={4}
    style={({ pressed }) => [styles.overlayButton, (disabled || pressed) && styles.dimmed]}>
    <PulseIcon name={icon} size={18} color={C.text} />
  </Pressable>;
}

const styles = StyleSheet.create({
  photo: { height: 220, borderRadius: PulseRadius.lg },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: PulseSpacing.xs },
  addTile: { width: 48, height: 48, marginBottom: PulseSpacing.xs, borderRadius: PulseRadius.pill, backgroundColor: C.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  overlayActions: { position: 'absolute', top: PulseSpacing.sm, right: PulseSpacing.sm, flexDirection: 'row', gap: PulseSpacing.sm },
  overlayButton: { width: PulseLayout.compactControlHeight, height: PulseLayout.compactControlHeight, borderRadius: PulseRadius.pill, backgroundColor: 'rgba(14, 17, 22, 0.72)', alignItems: 'center', justifyContent: 'center' },
  busy: { ...StyleSheet.absoluteFill, borderRadius: PulseRadius.lg, backgroundColor: 'rgba(14, 17, 22, 0.45)', alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.55 },
});
