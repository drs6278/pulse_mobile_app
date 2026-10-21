import { createContext, useContext, type PropsWithChildren } from 'react';
import { useUserResource } from '@/hooks/use-user-resource';
import { loadSchedule } from '@/lib/schedule/repository';
import { supabase } from '@/lib/supabase';

const load = (userId: string, signal: AbortSignal) => loadSchedule(supabase, userId, signal);
const ScheduleContext = createContext<ReturnType<typeof useScheduleResource> | null>(null);
function useScheduleResource() { return useUserResource(load); }
export function ScheduleProvider({ children }: PropsWithChildren) {
  const value = useScheduleResource();
  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}
export function useSchedule() {
  const value = useContext(ScheduleContext);
  if (!value) throw new Error('useSchedule requires ScheduleProvider');
  return value;
}
