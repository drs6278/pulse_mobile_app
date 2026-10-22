import { useEffect } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';

// Polling covers permission changes that RLS may hide from Realtime.
export function useDiscoveryRefresh(refresh: () => void, key: string) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };
    const channel = supabase.channel(`discovery:${key}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_rsvps' }, invalidate).subscribe();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const poll = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 30000);
    return () => { clearTimeout(timer); clearInterval(poll); subscription.remove(); void supabase.removeChannel(channel); };
  }, [refresh, key]);
}
