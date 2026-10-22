import { createContext, useContext, type PropsWithChildren } from 'react';
import { useUserResource } from '@/hooks/use-user-resource';
import { loadRSVPs } from '@/lib/rsvp-repository';
import { supabase } from '@/lib/supabase';

const load = (userId: string, signal: AbortSignal) => loadRSVPs(supabase, userId, signal);
const RSVPContext = createContext<ReturnType<typeof useRSVPResource> | null>(null);
function useRSVPResource() { return useUserResource(load); }
export function RSVPProvider({ children }: PropsWithChildren) {
  const value = useRSVPResource();
  return <RSVPContext.Provider value={value}>{children}</RSVPContext.Provider>;
}
export function useRSVPs() {
  const value = useContext(RSVPContext);
  if (!value) throw new Error('useRSVPs requires RSVPProvider');
  return value;
}
