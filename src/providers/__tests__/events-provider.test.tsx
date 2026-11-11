import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { useEffect, type ReactNode } from 'react';

import { defaultEventFilters } from '@/lib/event-filters';
import { EventsProvider, useEvents } from '../events-provider';

const mockFetch = jest.fn<(...args: unknown[]) => Promise<{ events: never[]; count: number }>>();
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: 'alice' } } }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/event-query', () => ({ EVENTS_PER_PAGE: 20, fetchEvents: (...args: unknown[]) => mockFetch(...args) }));

const wrapper = ({ children }: { children: ReactNode }) => <EventsProvider>{children}</EventsProvider>;
beforeEach(() => { mockFetch.mockReset().mockResolvedValue({ events: [], count: 0 }); });

// Mirrors EventFeed: refresh whenever the callback identity changes, as useFocusEffect does.
function RefreshOnFocus() {
  const { refresh } = useEvents();
  useEffect(() => { refresh(); }, [refresh]);
  return null;
}

test('refreshing from a focus effect settles instead of looping', async () => {
  await render(<RefreshOnFocus />, { wrapper });
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(2);
});

test('refresh keeps its identity and the latest filters', async () => {
  const { result } = await renderHook(() => useEvents(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  const refresh = result.current.refresh;
  await act(() => result.current.applyFilters({ ...defaultEventFilters, categories: ['Music'] }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => refresh());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.refresh).toBe(refresh);
  expect(result.current.filters.categories).toEqual(['Music']);
  expect(mockFetch).toHaveBeenCalledTimes(3);
});
