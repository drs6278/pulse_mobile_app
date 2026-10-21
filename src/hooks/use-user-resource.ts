import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/providers/auth-provider';
import { scheduleError } from '@/lib/schedule/repository';

// Results and mutation completions are scoped to the authentication identity.
export function useUserResource<T>(loader: (userId: string, signal: AbortSignal) => Promise<T>) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const identity = useRef(userId);
  useEffect(() => { identity.current = userId; return () => { identity.current = null; }; }, [userId]);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ user: string; revision: number; data: T | null; error: string | null } | null>(null);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    let active = true;
    void loader(userId, controller.signal).then(data => { if (active) setResult({ user: userId, revision, data, error: null }); }).catch(error => { if (active) setResult({ user: userId, revision, data: null, error: scheduleError(error) }); });
    return () => { active = false; controller.abort(); };
  }, [userId, revision, loader]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => subscription.remove();
  }, [refresh]);
  const mutate = useCallback(async (operation: (user: string) => Promise<unknown>) => {
    if (!userId || identity.current !== userId) throw new Error('Sign in again before saving.');
    try {
      await operation(userId);
      if (identity.current !== userId) throw new Error('Account changed. Reopen this screen.');
      refresh();
    } catch (error) { throw new Error(scheduleError(error)); }
  }, [userId, refresh]);
  const current = result?.user === userId && result.revision === revision ? result : null;
  return { userId, data: current?.data ?? null, loading: !!userId && !current, error: current?.error ?? null, refresh, mutate };
}
