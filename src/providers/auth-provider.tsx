import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';

import { supabase } from '@/lib/supabase';

type AuthResult = { error: string | null };

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  // `needsConfirmation` is true when the account was created but the user
  // must confirm their email before a session is issued.
  signUp: (email: string, password: string) => Promise<AuthResult & { needsConfirmation: boolean }>;
  signOut: () => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Session state is driven entirely by onAuthStateChange below, so these
// helpers only call Supabase and report errors back to the screen.
async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { error: error?.message ?? null, needsConfirmation: !error && !data.session };
}

async function signOut(): Promise<AuthResult> {
  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fires INITIAL_SESSION immediately with the stored session (or null),
    // then again on every sign in, sign out and token refresh.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext value={{ session, isLoading, signIn, signUp, signOut }}>{children}</AuthContext>
  );
}

export function useAuth() {
  const value = use(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return value;
}
