import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { View } from 'react-native';

import { PulseColors as C } from '@/constants/pulse-theme';

// The only place expo-symbols is used: the library is still in beta.
const symbols = {
  account: ['person.crop.circle', 'account_circle'],
  add: ['plus.circle', 'add_circle'],
  back: ['chevron.left', 'arrow_back'],
  bell: ['bell', 'notifications'],
  bookmark: ['bookmark', 'bookmark'],
  bookmarkFilled: ['bookmark.fill', 'bookmark'],
  chevronDown: ['chevron.down', 'keyboard_arrow_down'],
  chevronUp: ['chevron.up', 'keyboard_arrow_up'],
  clear: ['xmark.circle.fill', 'cancel'],
  close: ['xmark', 'close'],
  date: ['calendar', 'calendar_today'],
  filter: ['line.3.horizontal.decrease', 'filter_list'],
  home: ['house', 'home'],
  map: ['map', 'map'],
  more: ['ellipsis', 'more_horiz'],
  next: ['chevron.right', 'chevron_right'],
  pin: ['mappin.and.ellipse', 'location_on'],
  pinPink: ['mappin.and.ellipse', 'location_on'],
  refresh: ['arrow.clockwise', 'refresh'],
  search: ['magnifyingglass', 'search'],
  categoryArts: ['paintpalette', 'palette'],
  categoryFood: ['fork.knife', 'restaurant'],
  categoryMusic: ['music.note', 'music_note'],
  categoryOther: ['sparkles', 'category'],
  categoryOutdoors: ['leaf', 'park'],
  categorySports: ['sportscourt', 'sports_basketball'],
} as const satisfies Record<string, readonly [SFSymbol, AndroidSymbol]>;

export type PulseIconName = keyof typeof symbols;

export function PulseIcon({ name, size = 24, color = C.textMuted }: { name: PulseIconName; size?: number; color?: string }) {
  const [ios, material] = symbols[name];
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <SymbolView name={{ ios, android: material, web: material }} size={size} tintColor={color} />
  </View>;
}
