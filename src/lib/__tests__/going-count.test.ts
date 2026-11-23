import { expect, jest, test } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { goingCount } from '../rsvp-repository';

const client = (result: { data: unknown; error: { code: string; message: string } | null }) => {
  const rpc = jest.fn((_name: string, _args: object) => Promise.resolve(result));
  return { client: { rpc } as unknown as SupabaseClient, rpc };
};

test('returns the going total for the event', async () => {
  const { client: c, rpc } = client({ data: '12', error: null });
  await expect(goingCount(c, 'event-1')).resolves.toBe(12);
  expect(rpc).toHaveBeenCalledWith('event_going_count', { p_event: 'event-1' });
});

test('returns null before the database function is installed', async () => {
  const { client: c } = client({ data: null, error: { code: 'PGRST202', message: 'missing' } });
  await expect(goingCount(c, 'event-1')).resolves.toBeNull();
});

test('other errors are reported', async () => {
  const { client: c } = client({ data: null, error: { code: '42501', message: 'denied' } });
  await expect(goingCount(c, 'event-1')).rejects.toMatchObject({ message: 'denied' });
});
