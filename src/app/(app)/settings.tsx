import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { PulseText, Screen, TitleHeader, usePulseScale } from '@/components/pulse/ui';
import { PulseColors as C } from '@/constants/pulse-theme';
import { useAuth } from '@/providers/auth-provider';

export default function SettingsScreen() {
  return <Screen header={<TitleHeader title="Settings" />}><SettingsContent /></Screen>;
}

function SettingsContent() {
  const s = usePulseScale();
  const { session, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The root layout's guard sends the user back to login once the session clears.
  const handleSignOut = async () => {
    setSigningOut(true);
    const result = await signOut();
    setError(result.error);
    setSigningOut(false);
  };

  return <View style={{ paddingHorizontal: 20 * s, paddingTop: 24 * s, gap: 24 * s }}>
    <View>
      <PulseText size={14} color={C.muted}>Signed in as</PulseText>
      <PulseText size={18} color={C.white} style={{ marginTop: 4 * s }}>{session?.user.email}</PulseText>
    </View>
    {error && <PulseText size={14} color={C.pink}>{error}</PulseText>}
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: signingOut }}
      disabled={signingOut}
      onPress={handleSignOut}
      style={({ pressed }) => ({ height: 56 * s, borderRadius: 25 * s, borderWidth: 3 * s, borderColor: C.pink, alignItems: 'center', justifyContent: 'center', opacity: pressed || signingOut ? 0.7 : 1 })}>
      {signingOut ? <ActivityIndicator color={C.pink} /> : <PulseText size={20} color={C.pink}>Sign out</PulseText>}
    </Pressable>
  </View>;
}
