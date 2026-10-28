import { describe, expect, jest, test } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { profileInitials, validateProfile } from '../types';
import { invokeProfileFunction, saveProfile } from '../repository';

describe('profile validation and atomic saves', () => {
  test('missing photo service gives an actionable error instead of hiding the cause', async () => {
    const client = { functions: { invoke: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ message: 'Requested function was not found' }), { status: 404 }) } }) } } as unknown as SupabaseClient;
    await expect(invokeProfileFunction(client, 'profile-avatar', new ArrayBuffer(4), 'image/png')).rejects.toThrow('save without the new photo');
  });
  test('photo validation errors from the server remain visible', async () => {
    const client = { functions: { invoke: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ data: null, error: { context: { status: 400, json: async () => ({ error: 'Choose a photo with no more than 4 million pixels.' }) } } }) } } as unknown as SupabaseClient;
    await expect(invokeProfileFunction(client, 'profile-avatar', new ArrayBuffer(4), 'image/png')).rejects.toThrow('4 million pixels');
  });
  test('validates Unicode length, blank names, control characters, and age bands', () => {
    expect(validateProfile({ display_name: '  ', bio: '', age_band: 'unknown' })).toHaveProperty('display_name');
    expect(validateProfile({ display_name: 'Alice\nAdmin', bio: '', age_band: 'unknown' })).toHaveProperty('display_name');
    expect(validateProfile({ display_name: 'Alice', bio: '', age_band: null })).toHaveProperty('age_band');
    expect(validateProfile({ display_name: '😀'.repeat(60), bio: '😀'.repeat(280), age_band: '21_plus' })).toEqual({});
    expect(validateProfile({ display_name: 'A', bio: '😀'.repeat(281), age_band: '21_plus' })).toHaveProperty('bio');
    expect(profileInitials('  Jane  Doe ')).toBe('JD');
  });
  test('saves private age, public text, and a staged avatar in one versioned transaction', async () => {
    const rpc = jest.fn<(...args: unknown[]) => Promise<{ error: null }>>().mockResolvedValue({ error: null });
    const client = { rpc } as unknown as SupabaseClient;
    await saveProfile(client, { display_name: ' Alice ', bio: ' Hello ', age_band: '18_to_20' }, 7, 'alice/photo.jpg');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('save_profile', { p_name: 'Alice', p_bio: 'Hello', p_age: '18_to_20', p_version: 7, p_avatar: 'alice/photo.jpg', p_change_avatar: true });
    await saveProfile(client, { display_name: 'Alice', bio: '', age_band: 'unknown' }, 8);
    expect(rpc).toHaveBeenLastCalledWith('save_profile', expect.objectContaining({ p_change_avatar: false }));
    await saveProfile(client, { display_name: 'Alice', bio: '', age_band: 'unknown' }, 8, null);
    expect(rpc).toHaveBeenLastCalledWith('save_profile', expect.objectContaining({ p_change_avatar: true, p_avatar: null }));
  });
});
