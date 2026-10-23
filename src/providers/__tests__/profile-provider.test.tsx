import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { OwnProfile } from '@/lib/profile/types';
import { ProfileProvider, useProfile } from '../profile-provider';

let mockUser: string | null = 'alice';
const mockLoad = jest.fn<(...args: unknown[]) => Promise<OwnProfile>>();
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: mockUser ? { user: { id: mockUser } } : null }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/profile/repository', () => ({ loadOwnProfile: (...args: unknown[]) => mockLoad(...args), profileError: (error: Error) => error.message }));

function profile(user = 'alice', complete = false): OwnProfile {
  return {
    public: { user_id: user, display_name: complete ? 'Chosen name' : '', bio: '', avatar_path: null, version: complete ? 2 : 1, updated_at: '2026-10-23' },
    private: { user_id: user, age_band: 'unknown', account_state: 'active', profile_hidden: false, profile_setup_completed_at: complete ? '2026-10-23' : null, created_at: '2026-10-23' },
  };
}
beforeEach(() => { mockUser = 'alice'; mockLoad.mockReset().mockResolvedValue(profile()); });

test('restored sessions retain incomplete status until an authoritative post-save read succeeds', async () => {
  const { result } = renderHook(() => useProfile(), { wrapper: ProfileProvider });
  await waitFor(() => expect(result.current.data).toEqual(profile()));
  let finish!: (value: OwnProfile) => void;
  mockLoad.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const operation = jest.fn<() => Promise<void>>().mockResolvedValue();
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.mutate(operation, { completeSetup: true }); });
  expect(result.current.data?.private.profile_setup_completed_at).toBeNull();
  await act(async () => { finish(profile('alice', true)); await pending; });
  expect(operation).toHaveBeenCalledWith('alice');
  expect(result.current.data?.private.profile_setup_completed_at).toBe('2026-10-23');
});

test('older foreground responses cannot undo confirmed completion', async () => {
  const { result } = renderHook(() => useProfile(), { wrapper: ProfileProvider });
  await waitFor(() => expect(result.current.data).toEqual(profile()));
  let finishOldRead!: (value: OwnProfile) => void;
  mockLoad.mockImplementationOnce(() => new Promise(resolve => { finishOldRead = resolve; }));
  act(() => result.current.refresh());
  await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
  mockLoad.mockResolvedValueOnce(profile('alice', true));
  await act(async () => { await result.current.mutate(async () => {}, { completeSetup: true }); });
  await act(async () => finishOldRead(profile()));
  expect(result.current.data?.private.profile_setup_completed_at).toBe('2026-10-23');
});

test('offline or incomplete post-save reads keep setup locked and support retry', async () => {
  const { result } = renderHook(() => useProfile(), { wrapper: ProfileProvider });
  await waitFor(() => expect(result.current.data).toEqual(profile()));
  mockLoad.mockRejectedValueOnce(new Error('Offline'));
  await act(async () => {
    await expect(result.current.mutate(async () => {}, { completeSetup: true })).rejects.toThrow('Offline');
  });
  expect(result.current.data?.private.profile_setup_completed_at).toBeNull();
  await act(async () => {
    await expect(result.current.mutate(async () => {}, { completeSetup: true })).rejects.toThrow('Unable to confirm');
  });
  mockLoad.mockResolvedValueOnce(profile('alice', true));
  await act(async () => { await result.current.mutate(async () => {}, { completeSetup: true }); });
  expect(result.current.data?.private.profile_setup_completed_at).toBeTruthy();
});

test('a delayed setup confirmation never unlocks another account', async () => {
  const { result, rerender } = renderHook(() => useProfile(), { wrapper: ProfileProvider });
  await waitFor(() => expect(result.current.data).toEqual(profile()));
  let finish!: (value: OwnProfile) => void;
  mockLoad.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.mutate(async () => {}, { completeSetup: true }); });
  const assertion = expect(pending).rejects.toThrow('Account changed');
  mockLoad.mockResolvedValueOnce(profile('bob'));
  mockUser = 'bob'; rerender({});
  await waitFor(() => expect(result.current.data?.private.user_id).toBe('bob'));
  await act(async () => { finish(profile('alice', true)); await assertion; });
  expect(result.current.data).toEqual(profile('bob'));
});
