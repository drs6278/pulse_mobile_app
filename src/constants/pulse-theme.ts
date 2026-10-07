export const PulseColors = {
  background: '#0E1116',
  surface: '#20242D',
  search: '#181C23',
  pink: '#FF4D8D',
  text: '#F5F7FA',
  white: '#FFFFFF',
  muted: '#7B8291',
  border: '#2B303A',
} as const;

export const PulseFonts = {
  regular: 'Montserrat-Regular',
  semibold: 'Montserrat-SemiBold',
  black: 'Montserrat-Black',
} as const;

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
