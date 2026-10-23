import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { loadOwnProfile, profileError } from '@/lib/profile/repository';
import type { OwnProfile } from '@/lib/profile/types';
import { supabase } from '@/lib/supabase';
import { useAuth } from './auth-provider';

function useProfileResource() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const identity = useRef(userId);
  const request = useRef(0);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ user: string; data: OwnProfile | null; error: string | null } | null>(null);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => { identity.current = userId; return () => { identity.current = null; }; }, [userId]);
  useEffect(() => {
    if (!userId) return;
    const currentRequest = ++request.current;
    const controller = new AbortController(); let active = true;
    void loadOwnProfile(supabase, userId, controller.signal).then(data => {
      if (active && request.current === currentRequest) setResult({ user: userId, data, error: null });
    }).catch(error => {
      if (active && request.current === currentRequest) setResult(previous => ({ user: userId, data: previous?.user === userId ? previous.data : null, error: profileError(error) }));
    });
    return () => { active = false; controller.abort(); };
  }, [userId, revision]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => subscription.remove();
  }, [refresh]);
  const mutate = useCallback(async (operation: (user: string) => Promise<unknown>, options?: { completeSetup: boolean }) => {
    if (!userId || identity.current !== userId) throw new Error('Sign in again before saving.');
    await operation(userId);
    if (identity.current !== userId) throw new Error('Account changed. Reopen this screen.');
    if (options?.completeSetup) {
      // Do not unlock the app until the server confirms this identity's setup.
      // Invalidate older foreground reads so they cannot restore incomplete data.
      const currentRequest = ++request.current;
      const data = await loadOwnProfile(supabase, userId, new AbortController().signal);
      if (identity.current !== userId) throw new Error('Account changed. Reopen this screen.');
      if (!data.private.profile_setup_completed_at) throw new Error('Unable to confirm profile setup. Please try again.');
      if (request.current !== currentRequest) throw new Error('Profile check interrupted. Please try again.');
      setResult({ user: userId, data, error: null });
    } else refresh();
  }, [userId, refresh]);
  const current = result?.user === userId ? result : null;
  // Keep the mounted editor and drafts during foreground refreshes; never reuse another identity's data.
  return { userId, data: current?.data ?? null, error: current?.error ?? null, loading: !!userId && !current, refresh, mutate };
}
const ProfileContext = createContext<ReturnType<typeof useProfileResource> | null>(null);
export function ProfileProvider({ children }: PropsWithChildren) {
  const resource = useProfileResource();
  return <ProfileContext value={resource}>{children}</ProfileContext>;
}
export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error('useProfile requires ProfileProvider');
  return value;
}
