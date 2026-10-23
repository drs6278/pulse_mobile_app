import { Stack } from 'expo-router';

import { PulseColors } from '@/constants/pulse-theme';
import { EventsProvider } from '@/providers/events-provider';
import { ScheduleProvider } from '@/providers/schedule-provider';
import { RSVPProvider } from '@/providers/rsvp-provider';
import { useAuth } from '@/providers/auth-provider';
import { ProfileProvider } from '@/providers/profile-provider';
import { AccountBoundary } from '@/components/pulse/profile/account-boundary';

// Every screen in this group is only reachable while signed in
// (see the Stack.Protected guard in the root layout).
export default function AppLayout() {
  const { session } = useAuth();
  return <ProfileProvider key={session?.user.id}><AccountBoundary><EventsProvider><ScheduleProvider><RSVPProvider><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: PulseColors.background }, animation: 'none' }} /></RSVPProvider></ScheduleProvider></EventsProvider></AccountBoundary></ProfileProvider>;
}
