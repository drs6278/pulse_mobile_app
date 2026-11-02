import { DateTime } from 'luxon';
import { useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';
import { PulseColors as C } from '@/constants/pulse-theme';
import { useCalendarEntries } from '@/hooks/use-calendar-entries';
import { PulseText } from '../ui';
import { Button } from './controls';

export function CalendarNavigation({ selected, zone, onSelect }: { selected: string; zone: string; onSelect: (date: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [month, setMonth] = useState(selected);
  const day = DateTime.fromISO(selected, { zone });
  const cursor = expanded ? DateTime.fromISO(month, { zone }) : day;
  const first = expanded ? cursor.startOf('month').startOf('week') : day.startOf('week');
  const end = expanded ? cursor.endOf('month').endOf('week').plus({ milliseconds: 1 }) : first.plus({ days: 7 });
  const calendar = useCalendarEntries({ start: first.toMillis(), end: end.toMillis() });
  const today = DateTime.now().setZone(zone).toISODate();
  const move = (amount: number) => expanded ? setMonth(cursor.plus({ months: amount }).toISODate()!) : onSelect(day.plus({ weeks: amount }).toISODate()!);
  const gesture = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !expanded && Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 45) move(g.dx < 0 ? 1 : -1); },
  });
  const days = Math.round(end.diff(first, 'days').days);
  return <View style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6, borderBottomWidth: 1, borderColor: C.border }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
      <Button label={cursor.toFormat('MMMM yyyy') + (expanded ? ' ?' : ' ?')} expanded={expanded} onPress={() => { setMonth(selected); setExpanded(!expanded); }} />
      <Button label="Today" onPress={() => { onSelect(today!); setExpanded(false); }} />
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Button label={expanded ? 'Previous month' : 'Previous week'} onPress={() => move(-1)} />
      <Button label={expanded ? 'Next month' : 'Next week'} onPress={() => move(1)} />
    </View>
    <View {...gesture.panHandlers}>
      {Array.from({ length: days / 7 }, (_, row) => <View key={row} style={{ flexDirection: 'row' }}>
        {Array.from({ length: 7 }, (_, col) => {
          const date = first.plus({ days: row * 7 + col }), iso = date.toISODate()!;
          const active = iso === selected, isToday = iso === today;
          const hasEntries = [...calendar.occurrences, ...calendar.events].some(item => item.start < date.plus({ days: 1 }).toMillis() && date.toMillis() < item.end);
          return <Pressable key={iso} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={date.toFormat('cccc, MMMM d, yyyy') + (isToday ? ', today' : '') + (!calendar.complete ? ', entries unavailable' : hasEntries ? ', has entries' : ', no entries')} onPress={() => { onSelect(iso); setExpanded(false); }} style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: isToday ? C.pink : 'transparent', backgroundColor: active ? C.pink : 'transparent', paddingVertical: 3 }}>
            {row === 0 && <PulseText size={11}>{date.toFormat('ccc')}</PulseText>}
            <PulseText size={16} color={expanded && date.month !== cursor.month && !active ? C.muted : C.text}>{date.day}</PulseText>
            <View style={{ height: 4, width: 4, borderRadius: 2, backgroundColor: calendar.complete && hasEntries ? C.text : 'transparent' }} />
          </Pressable>;
        })}
      </View>)}
    </View>
  </View>;
}
