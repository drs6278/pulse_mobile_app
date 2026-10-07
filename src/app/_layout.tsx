import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PulseColors } from '@/constants/pulse-theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'Montserrat-Regular': require('@/assets/fonts/Montserrat-Regular.ttf'),
    'Montserrat-SemiBold': require('@/assets/fonts/Montserrat-SemiBold.ttf'),
    'Montserrat-Black': require('@/assets/fonts/Montserrat-Black.ttf'),
  });
  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);
  if (!loaded && !error) return <View style={{ flex: 1, backgroundColor: PulseColors.background }} />;
  return <SafeAreaProvider>
    <StatusBar style="light" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: PulseColors.background }, animation: 'none' }} />
  </SafeAreaProvider>;
}
