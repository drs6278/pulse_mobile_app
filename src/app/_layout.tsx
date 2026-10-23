import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PulseColors } from '@/constants/pulse-theme';
import { AuthProvider, useAuth } from '@/providers/auth-provider';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'Montserrat-Regular': require('@/assets/fonts/Montserrat-Regular.ttf'),
    'Montserrat-SemiBold': require('@/assets/fonts/Montserrat-SemiBold.ttf'),
    'Montserrat-Black': require('@/assets/fonts/Montserrat-Black.ttf'),
  });
  return <AuthProvider>
    <SafeAreaProvider>
      <StatusBar style="light" />
      <RootNavigator fontsReady={loaded || !!error} />
    </SafeAreaProvider>
  </AuthProvider>;
}

// Lives inside AuthProvider so it can read the session. Keeps the splash up
// until both fonts and the stored session have loaded, so signed-in users
// never see a flash of the login screen.
function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { session, isLoading } = useAuth();
  const ready = fontsReady && !isLoading;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: PulseColors.background }} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: PulseColors.background }, animation: 'none' }}>
    <Stack.Screen name="account-deletion" />
    <Stack.Protected guard={!!session}>
      <Stack.Screen name="(app)" />
    </Stack.Protected>
    <Stack.Protected guard={!session}>
      <Stack.Screen name="login" />
    </Stack.Protected>
  </Stack>;
}
