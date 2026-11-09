export const PulseColors = {
  background: '#0E1116',
  surface: '#171B22',
  surfaceRaised: '#20242D',
  border: '#2B303A',
  text: '#F5F7FA',
  textMuted: '#AEB6C4',
  accent: '#FF4D8D',
  onAccent: '#0E1116',
  danger: '#FF7A45',
  scrim: 'rgba(14, 17, 22, 0.72)',
  // Legacy names, removed once every call site uses the tokens above.
  search: '#20242D',
  pink: '#FF4D8D',
  white: '#FFFFFF',
  muted: '#AEB6C4',
} as const;

export const PulseGradients = {
  photo: ['rgba(14, 17, 22, 0.15)', 'rgba(14, 17, 22, 0.8)'],
  // Keeps card text readable over any photo: clear at the top, near-solid behind the text.
  card: ['rgba(14, 17, 22, 0.05)', 'rgba(14, 17, 22, 0.45)', 'rgba(14, 17, 22, 0.94)'],
} as const;

export const PulseFonts = {
  regular: 'Montserrat-Regular',
  semibold: 'Montserrat-SemiBold',
  black: 'Montserrat-Black',
} as const;

export const PulseSpacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const PulseRadius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const PulseLayout = {
  gutter: PulseSpacing.lg,
  controlHeight: 48,
  compactControlHeight: 40,
  maxContentWidth: 402,
} as const;

export const PulseType = {
  display: { fontFamily: PulseFonts.black, fontSize: 32, lineHeight: 38 },
  title: { fontFamily: PulseFonts.black, fontSize: 24, lineHeight: 30 },
  heading: { fontFamily: PulseFonts.semibold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: PulseFonts.regular, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: PulseFonts.semibold, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: PulseFonts.regular, fontSize: 12, lineHeight: 16 },
} as const;

export type PulseTextVariant = keyof typeof PulseType;

export const PulseImages = {
  concert: require('@/assets/figma/home-imgCardBackground.png'),
  foodTruck: require('@/assets/figma/home-imgCardBackground1.png'),
  categories: require('@/assets/figma/categories-imgCardBackground.png'),
  search: require('@/assets/figma/search-imgCardBackground.png'),
  saved: require('@/assets/figma/saved-imgCardBackground.png'),
  basketball: require('@/assets/figma/event-imgCardBackground.png'),
  map: require('@/assets/figma/map-imgCardBackground.png'),
  mapGrid: require('@/assets/figma/map-imgImage1.png'),
  mapEvent: require('@/assets/figma/map-imgCardBackground1.png'),
  calendar: require('@/assets/figma/calendar-imgCardBackground.png'),
} as const;
