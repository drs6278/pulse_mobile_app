import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useDiscoveryRefresh } from '@/hooks/use-discovery-refresh';

import { buildEventSearch, defaultEventFilters, type EventFilters } from '@/lib/event-filters';
import { EVENTS_PER_PAGE, fetchEvents, type PulseEvent } from '@/lib/event-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './auth-provider';

type Request = { filters: EventFilters; search: ReturnType<typeof buildEventSearch>; page: number };
type Result = { request: Request; userId: string; events: PulseEvent[]; count: number; error: string | null };
type EventsContextValue = {
  filters: EventFilters;
  applyFilters: (filters: EventFilters) => void;
  events: PulseEvent[];
  count: number;
  loading: boolean;
  error: string | null;
  page: number;
  changePage: (page: number) => void;
  refresh: () => void;
};
const EventsContext = createContext<EventsContextValue | null>(null);

export function EventsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [request, setRequest] = useState<Request>(() => ({ filters: defaultEventFilters, search: buildEventSearch(defaultEventFilters), page: 0 }));
  const [result, setResult] = useState<Result | null>(null);
  const userId = session?.user.id;
  // Results belong to one request and user. Old responses can never appear under
  // a new filter or session, even before the previous effect has been cleaned up.
  const current = result?.request === request && result.userId === userId ? result : null;
  const loading = !!userId && !current;

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    let active = true;
    void fetchEvents(supabase, request.search, request.page, controller.signal).then(data => {
      if (active) setResult({ ...data, request, userId, error: null });
    }).catch(() => {
      if (active) setResult({ request, userId, events: [], count: 0, error: 'Unable to load events. Please try again.' });
    });
    return () => { active = false; controller.abort(); };
  }, [request, userId]);

  function applyFilters(filters: EventFilters) {
    setRequest({ filters: { ...filters }, search: buildEventSearch(filters), page: 0 });
  }
  function changePage(page: number) {
    if (loading || page < 0 || page * EVENTS_PER_PAGE >= (current?.count ?? 0)) return;
    // Keep the date bounds fixed while paging through the same search.
    setRequest(previous => ({ ...previous, page }));
  }
  const refresh = useCallback(() => setRequest(previous => ({ ...previous })), []);
  useDiscoveryRefresh(refresh, `feed:${userId}`);
  return <EventsContext.Provider value={{ filters: request.filters, applyFilters, events: current?.events ?? [], count: current?.count ?? 0, loading, error: current?.error ?? null, page: request.page, changePage, refresh }}>{children}</EventsContext.Provider>;
}

export function useEvents() {
  const context = useContext(EventsContext);
  if (!context) throw new Error('useEvents requires EventsProvider');
  return context;
}
