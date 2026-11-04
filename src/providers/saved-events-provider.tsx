import { createContext, useContext, useRef, useState, type PropsWithChildren } from 'react';
import { useUserResource } from '@/hooks/use-user-resource';
import { loadSavedEvents, setEventSaved } from '@/lib/saved-events';
import { profileSessionClient } from '@/lib/profile/repository';
import { supabase } from '@/lib/supabase';
import { useAuth } from './auth-provider';

const load = (user: string, signal: AbortSignal) => loadSavedEvents(supabase, user, signal);
const Context = createContext<ReturnType<typeof useSavedResource> | null>(null);
function useSavedResource() {
  const resource = useUserResource(load);
  const { session } = useAuth();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  async function setSaved(eventId: string, saved: boolean) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const client = profileSessionClient(session?.access_token);
      await resource.mutate(user => setEventSaved(client, user, eventId, saved));
    } finally { lock.current = false; setBusy(false); }
  }
  return { ...resource, busy, setSaved };
}
export function SavedEventsProvider({ children }: PropsWithChildren) {
  const value = useSavedResource();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSavedEvents() {
  const value = useContext(Context);
  if (!value) throw new Error('useSavedEvents requires SavedEventsProvider');
  return value;
}
