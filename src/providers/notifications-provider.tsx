import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from './auth-provider';

const Context = createContext({ unread: 0, refresh: () => {} });
export function NotificationsProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const user = session?.user.id;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ user: string; count: number } | null>(null);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const controller = new AbortController();
    void (async () => {
      const { count, error } = await supabase.from('event_notifications').select('id', { count: 'exact', head: true }).eq('user_id', user).is('read_at', null).abortSignal(controller.signal);
      if (active && !error) setResult({ user, count: count ?? 0 });
    })();
    return () => { active = false; controller.abort(); };
  }, [user, revision]);
  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 30000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [refresh]);
  return <Context.Provider value={{ unread: result && result.user === user ? result.count : 0, refresh }}>{children}</Context.Provider>;
}
export const useNotifications = () => useContext(Context);
