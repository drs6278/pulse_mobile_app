import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

import { eventPhotoSource, pickEventPhoto, removeEventPhoto, uploadEventPhoto } from '../event-photo';
import { fetchEventById, fetchEvents } from '../event-query';

const mockLaunch = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockResize = jest.fn();
const mockSave = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: (...args: unknown[]) => mockLaunch(...args) }));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: () => ({ resize: (...args: unknown[]) => mockResize(...args), renderAsync: async () => ({ saveAsync: (...args: unknown[]) => mockSave(...args) }) }) },
}));
jest.mock('../event-photo-bytes', () => ({ readPhotoBytes: async () => new Uint8Array([1, 2, 3]) }));

beforeEach(() => {
  mockLaunch.mockReset(); mockResize.mockReset();
  mockSave.mockReset().mockResolvedValue({ uri: 'file:///out.jpg', width: 1600, height: 900 });
});

describe('pickEventPhoto', () => {
  test('returns null when the picker is cancelled', async () => {
    mockLaunch.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickEventPhoto()).resolves.toBeNull();
  });

  test.each([
    [{ width: 4032, height: 3024 }, { width: 1600 }],
    [{ width: 3024, height: 4032 }, { height: 1600 }],
    [{ width: 0, height: 0 }, { width: 1600 }],
  ])('shrinks %j along its longest edge', async (size, resize) => {
    mockLaunch.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///in.heic', ...size }] });
    await pickEventPhoto();
    expect(mockResize).toHaveBeenCalledWith(resize);
    expect(mockSave).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.8 });
  });

  test('leaves small photos at their size', async () => {
    mockLaunch.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///in.jpg', width: 800, height: 600 }] });
    await expect(pickEventPhoto()).resolves.toEqual({ uri: 'file:///out.jpg', width: 1600, height: 900 });
    expect(mockResize).not.toHaveBeenCalled();
  });
});

function functionsClient(result: { data?: unknown; error?: unknown }) {
  const invoke = jest.fn(async () => ({ data: null, error: null, ...result }));
  return { client: { functions: { invoke } } as unknown as SupabaseClient, invoke };
}

describe('uploadEventPhoto', () => {
  const photo = { uri: 'file:///out.jpg', width: 1600, height: 900 };

  test('sends JPEG bytes for the event and returns the stored path', async () => {
    const { client, invoke } = functionsClient({ data: { path: '42/abc.jpg' } });
    await expect(uploadEventPhoto(client, 'a b', photo)).resolves.toBe('42/abc.jpg');
    expect(invoke).toHaveBeenCalledWith('event-photo?event=a%20b', expect.objectContaining({ headers: { 'Content-Type': 'image/jpeg' } }));
  });

  test('explains when the server has not been set up', async () => {
    const { client } = functionsClient({ error: { context: new Response(null, { status: 404 }) } });
    await expect(uploadEventPhoto(client, '42', photo)).rejects.toThrow(/aren’t available on this server/);
  });

  test('passes on the server’s reason', async () => {
    const { client } = functionsClient({ error: { context: new Response(JSON.stringify({ error: 'Only the original poster can add a photo to this event.' }), { status: 403 }) } });
    await expect(uploadEventPhoto(client, '42', photo)).rejects.toThrow('Only the original poster');
  });

  test('rejects a response without a path', async () => {
    const { client } = functionsClient({ data: {} });
    await expect(uploadEventPhoto(client, '42', photo)).rejects.toThrow(/did not finish/);
  });
});

test('removeEventPhoto clears the photo and explains a missing server update', async () => {
  const rpc = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { code: 'PGRST202', message: 'not found' } });
  const client = { rpc } as unknown as SupabaseClient;
  await removeEventPhoto(client, '42');
  expect(rpc).toHaveBeenCalledWith('set_event_photo', { p_id: '42', p_path: null });
  await expect(removeEventPhoto(client, '42')).rejects.toThrow(/aren’t available on this server/);
});

test('eventPhotoSource authenticates and keys the cache per viewer', () => {
  const source = eventPhotoSource('42/a b.jpg', { access_token: 'token', user: { id: 'alice' } } as never);
  expect(source.uri).toMatch(/\/storage\/v1\/object\/authenticated\/event-photos\/42\/a%20b\.jpg$/);
  expect(source.headers.Authorization).toBe('Bearer token');
  expect(source.cacheKey).toBe('alice:42/a b.jpg');
});

// A query builder that records selected columns and answers from a script.
function eventsClient(responses: { error?: { code: string } | null; data?: unknown }[]) {
  const selected: string[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['gte', 'order', 'in', 'lte', 'ilike', 'range', 'abortSignal', 'eq']) builder[method] = () => builder;
  const next = () => Promise.resolve({ data: null, error: null, count: 0, ...responses[selected.length - 1] });
  builder.returns = next;
  builder.maybeSingle = next;
  const client = { from: () => ({ select: (columns: string) => { selected.push(columns); return builder; } }) } as unknown as SupabaseClient;
  return { client, selected };
}

describe('event queries before the photo migration', () => {
  const search = { categories: [], start: '2026-11-08', end: null, title: '' };
  const signal = new AbortController().signal;

  test('the feed falls back when the photo column is missing', async () => {
    const { client, selected } = eventsClient([{ error: { code: '42703' } }, { data: [{ id: '1' }] }]);
    await expect(fetchEvents(client, search, 0, signal)).resolves.toEqual({ events: [{ id: '1' }], count: 0 });
    expect(selected[0]).toContain('pulse_image_path');
    expect(selected[1]).not.toContain('pulse_image_path');
  });

  test('the feed reports other errors', async () => {
    const { client, selected } = eventsClient([{ error: { code: '42501' } }]);
    await expect(fetchEvents(client, search, 0, signal)).rejects.toEqual({ code: '42501' });
    expect(selected).toHaveLength(1);
  });

  test('details fall back step by step, and only read-only screens accept basic columns', async () => {
    const missing = { error: { code: '42703' } };
    const readOnly = eventsClient([missing, missing, { data: { id: '1' } }]);
    await expect(fetchEventById(readOnly.client, '1', signal, { allowBasic: true })).resolves.toEqual({ id: '1' });
    expect(readOnly.selected).toHaveLength(3);
    const editor = eventsClient([missing, missing]);
    await expect(fetchEventById(editor.client, '1', signal)).rejects.toEqual({ code: '42703' });
    expect(editor.selected).toHaveLength(2);
  });
});
