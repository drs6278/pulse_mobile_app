import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { PulseText } from '@/components/pulse/ui';
import { PulseColors as C, PulseFonts } from '@/constants/pulse-theme';
import { useAuth } from '@/providers/auth-provider';

type Mode = 'signIn' | 'signUp';

export default function LoginScreen() {
  const params = useLocalSearchParams<{ returnTo?: string; notice?: string }>();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignUp = mode === 'signUp';

  const switchMode = () => {
    setMode(isSignUp ? 'signIn' : 'signUp');
    setError(null);
    setNotice(null);
  };

  // On success there's nothing to navigate: the session changes and the
  // root layout swaps this screen for the account boundary, which requires
  // profile setup before allowing access to the app.
  const submit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return setError('Enter your email.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');

    setSubmitting(true);
    setError(null);
    setNotice(null);
    if (isSignUp) {
      const result = await signUp(trimmedEmail, password);
      setError(result.error);
      if (result.needsConfirmation) setNotice('Check your email to confirm your account, then sign in.');
    } else {
      const result = await signIn(trimmedEmail, password);
      setError(result.error);
      if (!result.error && params.returnTo === 'delete-account') router.replace('/delete-account');
    }
    setSubmitting(false);
  };

  return <SafeAreaView style={styles.screen}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PulseText font="black" size={48} lineHeight={56} color={C.pink}>Pulse</PulseText>
        <PulseText size={20} lineHeight={28} color={C.muted} style={styles.subtitle}>
          {isSignUp ? 'Create an account' : 'Sign in to find events near you'}
        </PulseText>

        <View style={styles.form}>
          {params.notice === 'deletion-requested' && <PulseText size={14} color={C.text}>Your account is locked and deletion has been requested. Deletion normally completes within 24 hours.</PulseText>}
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="email"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="next"
            editable={!submitting}
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="password"
            placeholderTextColor={C.muted}
            secureTextEntry
            autoCapitalize="none"
            textContentType={isSignUp ? 'newPassword' : 'password'}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            returnKeyType="go"
            onSubmitEditing={submit}
            editable={!submitting}
          />

          {error && <PulseText size={14} lineHeight={20} color={C.pink}>{error}</PulseText>}
          {notice && <PulseText size={14} lineHeight={20} color={C.text}>{notice}</PulseText>}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: submitting }}
            disabled={submitting}
            onPress={submit}
            style={({ pressed }) => [styles.button, (pressed || submitting) && styles.buttonDimmed]}>
            {submitting
              ? <ActivityIndicator color={C.white} />
              : <PulseText size={24} color={C.white}>{isSignUp ? 'Create account' : 'Sign in'}</PulseText>}
          </Pressable>

          <Pressable accessibilityRole="button" onPress={switchMode} disabled={submitting} style={styles.switch}>
            <PulseText size={14} color={C.muted}>
              {isSignUp ? 'Already have an account? ' : 'New to Pulse? '}
              <PulseText size={14} color={C.pink}>{isSignUp ? 'Sign in' : 'Create one'}</PulseText>
            </PulseText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  subtitle: { marginTop: 8 },
  form: { marginTop: 40, gap: 16 },
  input: {
    height: 56,
    borderRadius: 28,
    backgroundColor: C.surface,
    paddingHorizontal: 24,
    color: C.text,
    fontFamily: PulseFonts.regular,
    fontSize: 16,
  },
  button: {
    marginTop: 8,
    height: 64,
    borderRadius: 25,
    backgroundColor: C.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDimmed: { opacity: 0.7 },
  switch: { alignSelf: 'center', paddingVertical: 8 },
});
