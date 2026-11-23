import { expect, jest, test } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchEvents } from '../event-query';

// The count query is a chain of builder calls; ranked sorts then call one RPC.
function client() {
  const builder: Record<string, unknown> = {};
  for (const method of ['gte', 'order', 'in', 'lte', 'ilike', 'range', 'abortSignal', 'eq']) builder[method] = () => builder;
  builder.returns = () => Promise.resolve({ data: [{ id: 'by-date' }], error: null, count: 3 });
  const rpc = jest.fn((_name: string, _args: object) => ({ abortSignal: () => Promise.resolve({ data: [{ id: 'ranked' }], error: null }) }));
  return { client: { from: () => ({ select: () => builder }), rpc } as unknown as SupabaseClient, rpc };
}

const search = { categories: ['Music'], start: '2026-11-22', end: null, title: 'jazz' };
const signal = new AbortController().signal;

test('the Most going sort ranks with list_most_attended_events and the same filters', async () => {
  const { client: c, rpc } = client();
  await expect(fetchEvents(c, search, 1, signal, 'going')).resolves.toEqual({ events: [{ id: 'ranked' }], count: 3 });
  expect(rpc).toHaveBeenCalledWith('list_most_attended_events', { p_start: '2026-11-22', p_end: null, p_categories: ['Music'], p_title: 'jazz', p_offset: 20 });
});

test('Top voted still uses list_top_events, and Soonest skips the RPC', async () => {
  const { client: c, rpc } = client();
  await fetchEvents(c, search, 0, signal, 'top');
  expect(rpc).toHaveBeenLastCalledWith('list_top_events', expect.anything());
  await expect(fetchEvents(c, search, 0, signal, 'date')).resolves.toEqual({ events: [{ id: 'by-date' }], count: 3 });
  expect(rpc).toHaveBeenCalledTimes(1);
});
