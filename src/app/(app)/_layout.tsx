import { Stack } from 'expo-router';

import { PulseColors } from '@/constants/pulse-theme';
import { EventsProvider } from '@/providers/events-provider';

// Every screen in this group is only reachable while signed in
// (see the Stack.Protected guard in the root layout).
export default function AppLayout() {
  return <EventsProvider><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: PulseColors.background }, animation: 'none' }} /></EventsProvider>;
}
