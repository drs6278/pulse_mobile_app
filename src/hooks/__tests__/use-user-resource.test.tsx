import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useUserResource } from '../use-user-resource';

let mockUser: string | null = 'alice';
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: mockUser ? { user: { id: mockUser } } : null }) }));
beforeEach(() => { mockUser = 'alice'; });
describe('user resource isolation', () => {
  test('ignores late responses after an account switch', async () => {
    let finishAlice!: (value: string) => void;
    const loader = jest.fn((user: string) => user === 'alice' ? new Promise<string>(resolve => { finishAlice = resolve; }) : Promise.resolve('Bob private data'));
    const { result, rerender } = renderHook(() => useUserResource(loader));
    expect(result.current.loading).toBe(true);
    mockUser = 'bob'; rerender({});
    await waitFor(() => expect(result.current.data).toBe('Bob private data'));
    await act(async () => finishAlice('Alice private data'));
    expect(result.current.data).toBe('Bob private data');
  });
  test('does not invalidate another session after a delayed mutation', async () => {
    const loader = jest.fn(async (user: string) => `${user} data`);
    const { result, rerender } = renderHook(() => useUserResource(loader));
    await waitFor(() => expect(result.current.data).toBe('alice data'));
    let finish!: () => void;
    const operation = new Promise<void>(resolve => { finish = resolve; });
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.mutate(() => operation); });
    const assertion = expect(pending).rejects.toThrow('Account changed');
    mockUser = 'bob'; rerender({});
    await waitFor(() => expect(result.current.data).toBe('bob data'));
    await act(async () => finish()); await assertion;
    expect(loader).toHaveBeenCalledTimes(2);
  });
  test('a refresh failure cannot leave availability backed by old data', async () => {
    const loader = jest.fn<() => Promise<string>>().mockResolvedValueOnce('complete').mockRejectedValueOnce(new Error('Offline'));
    const { result } = renderHook(() => useUserResource(loader));
    await waitFor(() => expect(result.current.data).toBe('complete'));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).toBe('Offline'));
    expect(result.current.data).toBeNull();
  });
});
