import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { OwnProfile } from '@/lib/profile/types';
import { MyProfileScreen } from '../my-profile-screen';
import { ProfileEditor } from '../edit-profile-screen';
import { ChangePasswordScreen, DeleteAccountScreen } from '../security-screens';

const mockReplace = jest.fn(), mockRefresh = jest.fn(), mockPreventRemove = jest.fn();
const mockSave = jest.fn<(...args: unknown[]) => Promise<void>>(), mockInvoke = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockLoad = jest.fn<(...args: unknown[]) => Promise<OwnProfile>>();
const mockUpdatePassword = jest.fn<(...args: unknown[]) => Promise<{ error: null | { message: string; code: string } }>>();
const mockReauth = jest.fn<() => Promise<{ error: null }>>();
const initial: OwnProfile = { public: { user_id: 'alice', display_name: 'Alice', bio: 'Hello campus', avatar_path: null, version: 7, updated_at: '2026-01-01' }, private: { user_id: 'alice', age_band: '21_plus', account_state: 'active', profile_hidden: false, created_at: '2026-01-01' } };
const mockResource = { userId: 'alice', loading: false, error: null as string | null, data: initial, refresh: mockRefresh, mutate: async (fn: (user: string) => Promise<unknown>) => fn('alice') };
const mockSignOut = jest.fn<() => Promise<{ error: null }>>();
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: 'alice', email: 'private@example.invalid' }, access_token: 'original-token' }, signOut: mockSignOut }) }));
jest.mock('@/providers/profile-provider', () => ({ useProfile: () => mockResource }));
jest.mock('@/providers/events-provider', () => ({ useEvents: () => ({ refresh: mockRefresh }) }));
jest.mock('@/providers/rsvp-provider', () => ({ useRSVPs: () => ({ refresh: mockRefresh }) }));
jest.mock('@/hooks/use-user-resource', () => ({ useUserResource: () => ({ loading: false, error: null, data: { hosted_events: 2, schedule_entries: 3 }, refresh: mockRefresh }) }));
jest.mock('@/lib/profile/pick-avatar', () => ({ pickAvatar: async () => null }));
jest.mock('@/lib/profile/repository', () => ({ saveProfile: (...args: unknown[]) => mockSave(...args), loadOwnProfile: (...args: unknown[]) => mockLoad(...args), invokeProfileFunction: (...args: unknown[]) => mockInvoke(...args), profileSessionClient: () => ({ original: true }), profileError: (value: { message: string }) => value.message }));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { updateUser: (...args: unknown[]) => mockUpdatePassword(...args), reauthenticate: () => mockReauth(), signOut: () => mockSignOut() } } }));
jest.mock('expo-router', () => ({ router: { replace: (...args: unknown[]) => mockReplace(...args) }, useNavigation: () => ({ dispatch: jest.fn() }), useFocusEffect: () => {} }));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: (...args: unknown[]) => mockPreventRemove(...args) }));
jest.mock('../../ui', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>, TitleHeader: () => null, PulseText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> };
});
jest.mock('../controls', () => {
  const { View, Text, Pressable, TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    profileStyles: {}, ProfileText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>, ProfileAvatar: () => null,
    ProfileButton: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) => <Pressable accessibilityLabel={label} disabled={disabled} onPress={onPress}><Text>{label}</Text></Pressable>,
    ProfileLink: ({ label }: { label: string }) => <Text>{label}</Text>,
    ProfileField: ({ label, error, ...props }: { label: string; error?: string }) => <View><TextInput accessibilityLabel={label} {...props} />{error && <Text>{error}</Text>}</View>,
    ProfileLoading: () => <Text>Loading</Text>, ProfileMessage: ({ text }: { text: string }) => text ? <Text>{text}</Text> : null,
  };
});
beforeEach(() => {
  mockReplace.mockReset(); mockPreventRemove.mockReset(); mockRefresh.mockReset(); mockSave.mockReset().mockResolvedValue(undefined);
  mockInvoke.mockReset().mockResolvedValue({ accepted: true }); mockSignOut.mockReset().mockResolvedValue({ error: null });
  mockLoad.mockReset().mockResolvedValue({ ...initial, public: { ...initial.public!, display_name: 'Latest Alice', version: 8 } });
  mockUpdatePassword.mockReset().mockResolvedValue({ error: null }); mockReauth.mockReset().mockResolvedValue({ error: null });
  mockResource.error = null;
});
test('private hub shows private email and age without putting them in the public profile link', () => {
  const screen = render(<MyProfileScreen />);
  expect(screen.getByText('private@example.invalid')).toBeTruthy();
  expect(screen.getByText(/Age eligibility: 21 or older/)).toBeTruthy();
  expect(screen.getByText('View student profile')).toBeTruthy();
});
test('invalid name is not saved and successful edits preserve the baseline version', async () => {
  const screen = render(<ProfileEditor initial={initial} />);
  fireEvent.changeText(screen.getByLabelText('Display name'), '   ');
  fireEvent.press(screen.getByLabelText('Save profile'));
  expect(mockSave).not.toHaveBeenCalled();
  expect(screen.getByText(/Use 1–60/)).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Display name'), 'Updated Alice');
  // A foreground refresh must not silently overwrite a concurrent server version.
  screen.rerender(<ProfileEditor initial={{ ...initial, public: { ...initial.public!, version: 8 } }} />);
  fireEvent.press(screen.getByLabelText('Save profile'));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ display_name: 'Updated Alice' }), 7, undefined));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/profile'));
});
test('save failures retain the draft and show an actionable error', async () => {
  mockSave.mockRejectedValueOnce(new Error('Profile changed. Reload before saving.'));
  const screen = render(<ProfileEditor initial={initial} />);
  fireEvent.changeText(screen.getByLabelText('Bio (optional)'), 'My unsaved bio');
  fireEvent.press(screen.getByLabelText('Save profile'));
  await waitFor(() => expect(screen.getByText(/Profile changed/)).toBeTruthy());
  expect(screen.getByLabelText('Bio (optional)').props.value).toBe('My unsaved bio');
  expect(mockReplace).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Discard changes and reload'));
  await waitFor(() => expect(screen.getByLabelText('Display name').props.value).toBe('Latest Alice'));
  fireEvent.changeText(screen.getByLabelText('Bio (optional)'), 'Updated against latest');
  fireEvent.press(screen.getByLabelText('Save profile'));
  await waitFor(() => expect(mockSave).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ bio: 'Updated against latest' }), 8, undefined));
});
test('password changes handle secure-change verification codes and clear passwords on success', async () => {
  mockUpdatePassword.mockResolvedValueOnce({ error: { code: 'reauthentication_needed', message: 'Verify your identity.' } });
  const screen = render(<ChangePasswordScreen />);
  fireEvent.changeText(screen.getByLabelText('Current password'), 'original password');
  fireEvent.changeText(screen.getByLabelText('New password'), 'long unique password');
  fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'long unique password');
  fireEvent.press(screen.getByLabelText('Save new password'));
  await waitFor(() => expect(screen.getByLabelText('Send verification code')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Send verification code'));
  await waitFor(() => expect(mockReauth).toHaveBeenCalled());
  fireEvent.changeText(screen.getByLabelText('Email verification code'), '123456');
  fireEvent.press(screen.getByLabelText('Save new password'));
  await waitFor(() => expect(screen.getByText('Password changed')).toBeTruthy());
  expect(mockUpdatePassword).toHaveBeenLastCalledWith({ password: 'long unique password', current_password: 'original password', nonce: '123456' });
  expect(screen.queryByLabelText('New password')).toBeNull();
});
test('deletion requires explicit confirmation and current password before invoking the server', async () => {
  const screen = render(<DeleteAccountScreen />);
  fireEvent.press(screen.getByLabelText('Continue to account deletion'));
  expect(mockInvoke).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Permanently delete my account'));
  expect(mockInvoke).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Current password'), 'current password');
  fireEvent.press(screen.getByLabelText('Permanently delete my account'));
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith(expect.anything(), 'profile-account', { password: 'current password' }));
  await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
});
