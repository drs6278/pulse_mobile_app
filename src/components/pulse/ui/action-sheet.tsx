import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PulseColors as C, PulseLayout, PulseRadius, PulseSpacing } from '@/constants/pulse-theme';
import { Button } from './button';
import { PulseText } from './text';

export type SheetAction = { label: string; onPress: () => void; danger?: boolean; disabled?: boolean };

export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title?: string; actions: readonly SheetAction[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: C.scrim }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} style={{ flex: 1 }} />
      <View accessibilityViewIsModal style={{ width: '100%', maxWidth: PulseLayout.maxContentWidth, alignSelf: 'center', padding: PulseSpacing.lg, paddingBottom: insets.bottom + PulseSpacing.lg, gap: PulseSpacing.sm, backgroundColor: C.surface, borderTopLeftRadius: PulseRadius.lg, borderTopRightRadius: PulseRadius.lg }}>
        {!!title && <PulseText variant="label" tone="muted" accessibilityRole="header">{title}</PulseText>}
        {actions.map(action => <Button key={action.label} label={action.label} variant={action.danger ? 'danger' : 'secondary'} disabled={action.disabled} onPress={() => { onClose(); action.onPress(); }} />)}
        <Button label="Cancel" variant="ghost" onPress={onClose} />
      </View>
    </View>
  </Modal>;
}
