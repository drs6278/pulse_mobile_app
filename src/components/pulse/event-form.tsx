import { DateTime } from 'luxon';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { PulseColors as C, PulseRadius, PulseSpacing, PulseType } from '@/constants/pulse-theme';
import type { EventDraft } from '@/lib/event-create';
import { eventCategories } from '@/lib/event-filters';
import { EventDateTimeFields } from './event-date-time-fields';
import { InfoCard, InfoRow } from './ui/info-card';
import { SegmentedControl } from './ui/segmented-control';
import { PulseText } from './ui/text';

const ages = ['0', '18', '21'] as const;

// Laid out like the event page (category, big title, then the info card) so the form previews the result.
export function EventFormFields({ draft, busy, change }: { draft: EventDraft; busy: boolean; change: (values: Partial<EventDraft>) => void }) {
  const zone = DateTime.now().setZone(draft.timezone);
  return <>
    <View style={{ gap: PulseSpacing.sm }}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Category" style={styles.chips}>
        {eventCategories.map(category => {
          const checked = draft.category === category;
          return <Pressable key={category} accessibilityRole="radio" accessibilityLabel={`Category: ${category}`} accessibilityState={{ checked, disabled: busy }}
            disabled={busy} onPress={() => change({ category })} hitSlop={4}
            style={({ pressed }) => [styles.chip, checked && styles.chipChecked, (busy || pressed) && styles.dimmed]}>
            <PulseText size={12} color={checked ? C.pink : C.textMuted}>{category}</PulseText>
          </Pressable>;
        })}
      </View>
      <TextInput accessibilityLabel="Title" placeholder="Event title" placeholderTextColor={C.textMuted} value={draft.title} onChangeText={title => change({ title })}
        editable={!busy} multiline scrollEnabled={false} submitBehavior="blurAndSubmit" returnKeyType="done" maxLength={200} style={[styles.title, busy && styles.dimmed]} />
    </View>
    <InfoCard>
      <InfoRow icon="date"><EventDateTimeFields draft={draft} disabled={busy} onChange={change} /></InfoRow>
      <InfoRow icon="pin"><InlineField label="Location" placeholder="Add a location" value={draft.location} onChangeText={location => change({ location })} editable={!busy} maxLength={300} /></InfoRow>
      <InfoRow icon="globe">
        <InlineField label="Timezone" placeholder="America/New_York" value={draft.timezone} onChangeText={timezone => change({ timezone })} editable={!busy} autoCorrect={false} autoCapitalize="none" />
        {zone.isValid && <PulseText variant="caption" tone="muted">{zone.offsetNameLong} · {zone.offsetNameShort}</PulseText>}
      </InfoRow>
      <InfoRow icon="info">
        <View style={{ alignSelf: 'flex-start', opacity: busy ? 0.55 : 1 }} pointerEvents={busy ? 'none' : 'auto'}>
          <SegmentedControl label="Age eligibility" options={ages} value={String(draft.age_min ?? 0) as typeof ages[number]}
            formatLabel={age => age === '0' ? 'All ages' : `${age}+`} onChange={age => change({ age_min: Number(age) as 0 | 18 | 21 })} />
        </View>
        <PulseText variant="caption" tone="muted">Age eligibility is self-reported, not verified identification.</PulseText>
      </InfoRow>
    </InfoCard>
  </>;
}

// A borderless input that reads like the event page's row text until you tap it.
function InlineField({ label, ...props }: TextInputProps & { label: string }) {
  return <TextInput accessibilityLabel={label} placeholderTextColor={C.textMuted} {...props}
    style={[styles.inline, props.editable === false && styles.dimmed]} />;
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: PulseSpacing.sm },
  chip: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 12, borderRadius: PulseRadius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, backgroundColor: C.surfaceRaised },
  // Same pink badge as the category on the feed card.
  chipChecked: { backgroundColor: 'rgba(255, 77, 141, 0.14)', borderColor: 'rgba(255, 77, 141, 0.38)' },
  title: { ...PulseType.display, color: C.text, padding: 0, minHeight: PulseType.display.lineHeight },
  inline: { ...PulseType.body, color: C.text, minHeight: 40, paddingVertical: PulseSpacing.sm, paddingHorizontal: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  dimmed: { opacity: 0.55 },
});
