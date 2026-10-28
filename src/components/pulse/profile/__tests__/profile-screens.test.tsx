import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { OwnProfile } from '@/lib/profile/types';
import { MyProfileScreen } from '../my-profile-screen';
import { ProfileEditor } from '../edit-profile-screen';
import { ProfileForm } from '../profile-form';
import { AccountBoundary } from '../account-boundary';
import { ChangePasswordScreen, DeleteAccountScreen } from '../security-screens';

const mockReplace = jest.fn(), mockRefresh = jest.fn(), mockPreventRemove = jest.fn();
const mockSave = jest.fn<(...args: unknown[]) => Promise<void>>(), mockInvoke = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockLoad = jest.fn<(...args: unknown[]) => Promise<OwnProfile>>();
const mockPickAvatar = jest.fn<() => Promise<import('@/lib/profile/types').PickedAvatar | null>>();
const mockUpdatePassword = jest.fn<(...args: unknown[]) => Promise<{ error: null | { message: string; code: string } }>>();
const mockReauth = jest.fn<() => Promise<{ error: null }>>();
const initial: OwnProfile = { public: { user_id: 'alice', display_name: 'Alice', bio: 'Hello campus', avatar_path: null, version: 7, updated_at: '2026-01-01' }, private: { user_id: 'alice', age_band: '21_plus', account_state: 'active', profile_hidden: false, profile_setup_completed_at: '2026-01-01', created_at: '2026-01-01' } };
const unfinished: OwnProfile = { public: { ...initial.public!, display_name: '', bio: '', version: 1 }, private: { ...initial.private, age_band: 'unknown', profile_setup_completed_at: null } };
const mockMutate = jest.fn<(fn: (user: string) => Promise<unknown>, options?: { completeSetup: boolean }) => Promise<unknown>>();
const mockResource = { userId: 'alice', loading: false, error: null as string | null, data: initial as OwnProfile | null, refresh: mockRefresh, mutate: mockMutate };
let mockPathname = '/';
const mockSignOut = jest.fn<() => Promise<{ error: null }>>();
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: 'alice', email: 'private@example.invalid' }, access_token: 'original-token' }, signOut: mockSignOut }) }));
jest.mock('@/providers/profile-provider', () => ({ useProfile: () => mockResource }));
jest.mock('@/providers/events-provider', () => ({ useEvents: () => ({ refresh: mockRefresh }) }));
jest.mock('@/providers/rsvp-provider', () => ({ useRSVPs: () => ({ refresh: mockRefresh }) }));
jest.mock('@/hooks/use-user-resource', () => ({ useUserResource: () => ({ loading: false, error: null, data: { hosted_events: 2, schedule_entries: 3 }, refresh: mockRefresh }) }));
jest.mock('@/lib/profile/pick-avatar', () => ({ pickAvatar: () => mockPickAvatar() }));
jest.mock('@/lib/profile/repository', () => ({ saveProfile: (...args: unknown[]) => mockSave(...args), loadOwnProfile: (...args: unknown[]) => mockLoad(...args), invokeProfileFunction: (...args: unknown[]) => mockInvoke(...args), profileSessionClient: () => ({ original: true }), profileError: (value: { message: string }) => value.message }));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { updateUser: (...args: unknown[]) => mockUpdatePassword(...args), reauthenticate: () => mockReauth(), signOut: () => mockSignOut() } } }));
jest.mock('expo-router', () => ({ router: { replace: (...args: unknown[]) => mockReplace(...args) }, useNavigation: () => ({ dispatch: jest.fn() }), useFocusEffect: () => {}, usePathname: () => mockPathname }));
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
  mockPickAvatar.mockReset().mockResolvedValue(null);
  mockReplace.mockReset(); mockPreventRemove.mockReset(); mockRefresh.mockReset(); mockSave.mockReset().mockResolvedValue(undefined);
  mockInvoke.mockReset().mockResolvedValue({ accepted: true }); mockSignOut.mockReset().mockResolvedValue({ error: null });
  mockLoad.mockReset().mockResolvedValue({ ...initial, public: { ...initial.public!, display_name: 'Latest Alice', version: 8 } });
  mockUpdatePassword.mockReset().mockResolvedValue({ error: null }); mockReauth.mockReset().mockResolvedValue({ error: null });
  mockResource.error = null;
  mockResource.data = initial; mockResource.loading = false; mockPathname = '/';
  mockMutate.mockReset().mockImplementation(async fn => fn('alice'));
});

test('setup starts blank and requires an explicit age choice, including prefer not to say', async () => {
  const screen = render(<ProfileForm initial={unfinished} setup />);
  expect(screen.getByLabelText('Display name').props.value).toBe('');
  fireEvent.press(screen.getByLabelText('Finish setup'));
  expect(mockSave).not.toHaveBeenCalled();
  expect(screen.getByText('Choose an age eligibility option.')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Display name'), 'New Alice');
  fireEvent.press(screen.getByLabelText('Finish setup'));
  expect(mockSave).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Prefer not to say'));
  fireEvent.press(screen.getByLabelText('Finish setup'));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith(expect.anything(), { display_name: 'New Alice', bio: '', age_band: 'unknown' }, 1, undefined));
  expect(mockMutate).toHaveBeenCalledWith(expect.any(Function), { completeSetup: true });
  expect(mockPreventRemove).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalledWith('/profile');
});

test('setup keeps drafts on write failure and retries only verification after a committed save', async () => {
  mockSave.mockRejectedValueOnce(new Error('Save offline'));
  mockMutate.mockImplementationOnce(async fn => fn('alice'))
    .mockImplementationOnce(async fn => { await fn('alice'); throw new Error('Read offline'); });
  const screen = render(<ProfileForm initial={unfinished} setup />);
  fireEvent.changeText(screen.getByLabelText('Display name'), 'New Alice');
  fireEvent.press(screen.getByLabelText('18–20'));
  fireEvent.press(screen.getByLabelText('Finish setup'));
  await waitFor(() => expect(screen.getByText('Save offline')).toBeTruthy());
  expect(screen.getByLabelText('Display name').props.value).toBe('New Alice');
  fireEvent.press(screen.getByLabelText('Finish setup'));
  await waitFor(() => expect(screen.getByText('Read offline')).toBeTruthy());
  expect(screen.getByLabelText('Display name').props.editable).toBe(false);
  fireEvent.press(screen.getByLabelText('Retry profile check'));
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(3));
  expect(mockSave).toHaveBeenCalledTimes(2);
});

test('incomplete accounts cannot mount app screens through deep links or back navigation', () => {
  mockResource.data = unfinished;
  const child = <ProfileEditor initial={initial} />;
  const screen = render(<AccountBoundary>{child}</AccountBoundary>);
  expect(screen.getByText(/Choose a display name/)).toBeTruthy();
  expect(screen.queryByLabelText('Save profile')).toBeNull();
  expect(screen.getByLabelText('Sign out')).toBeTruthy();
  mockPathname = '/calendar';
  screen.rerender(<AccountBoundary>{child}</AccountBoundary>);
  expect(screen.getByLabelText('Finish setup')).toBeTruthy();
  mockResource.data = initial;
  screen.rerender(<AccountBoundary>{child}</AccountBoundary>);
  expect(screen.getByLabelText('Save profile')).toBeTruthy();
  expect(mockReplace).toHaveBeenCalledWith('/');
});

test('incomplete accounts can delete their account and sign out without completing setup', async () => {
  mockResource.data = unfinished;
  const screen = render(<AccountBoundary>App content</AccountBoundary>);
  fireEvent.press(screen.getByLabelText('Sign out'));
  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  mockPathname = '/delete-account';
  screen.rerender(<AccountBoundary>App content</AccountBoundary>);
  expect(screen.getByText('Permanently leave Pulse?')).toBeTruthy();
  expect(screen.queryByLabelText('Finish setup')).toBeNull();
});

test('profile loading failures, suspension, and deletion cannot expose app screens', () => {
  mockResource.data = null; mockResource.loading = true;
  const screen = render(<AccountBoundary>Private app content</AccountBoundary>);
  expect(screen.queryByText('Private app content')).toBeNull();
  mockResource.loading = false; mockResource.error = 'Offline';
  screen.rerender(<AccountBoundary>Private app content</AccountBoundary>);
  expect(screen.getByText('Offline')).toBeTruthy();
  for (const state of ['suspended', 'deleting'] as const) {
    mockResource.error = null;
    mockResource.data = { ...unfinished, private: { ...unfinished.private, account_state: state } };
    screen.rerender(<AccountBoundary>Private app content</AccountBoundary>);
    expect(screen.queryByText('Private app content')).toBeNull();
    expect(screen.queryByLabelText('Finish setup')).toBeNull();
  }
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

test('PNG upload failure keeps bio and allows an explicit text save preserving the current photo', async () => {
  mockPickAvatar.mockResolvedValueOnce({ bytes: new Uint8Array([137, 80, 78, 71]), mime: 'image/png', uri: 'blob:photo', dispose: jest.fn() });
  mockInvoke.mockRejectedValueOnce(new Error('Photo uploads are unavailable right now.'));
  const screen = render(<ProfileEditor initial={{ ...initial, public: { ...initial.public!, avatar_path: 'alice/old.jpg' } }} />);
  fireEvent.press(screen.getByLabelText('Choose profile photo'));
  await waitFor(() => expect(screen.getByLabelText('Bio (optional)').props.editable).toBe(true));
  fireEvent.changeText(screen.getByLabelText('Bio (optional)'), 'My new bio');
  fireEvent.press(screen.getByLabelText('Save profile'));
  await waitFor(() => expect(screen.getByLabelText('Save without new photo')).toBeTruthy());
  expect(mockInvoke).toHaveBeenCalledWith(expect.anything(), 'profile-avatar', expect.any(ArrayBuffer), 'image/png');
  expect(mockSave).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Bio (optional)').props.value).toBe('My new bio');
  fireEvent.press(screen.getByLabelText('Save without new photo'));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bio: 'My new bio' }), 7, undefined));
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/profile'));
});

test('PNG and bio save together after a successful photo upload', async () => {
  mockPickAvatar.mockResolvedValueOnce({ bytes: new Uint8Array([137, 80, 78, 71]), mime: 'image/png', uri: 'blob:photo', dispose: jest.fn() });
  mockInvoke.mockResolvedValueOnce({ path: 'alice/new.jpg' });
  const screen = render(<ProfileEditor initial={initial} />);
  fireEvent.press(screen.getByLabelText('Choose profile photo'));
  await waitFor(() => expect(screen.getByLabelText('Bio (optional)').props.editable).toBe(true));
  fireEvent.changeText(screen.getByLabelText('Bio (optional)'), 'With a PNG');
  fireEvent.press(screen.getByLabelText('Save profile'));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bio: 'With a PNG' }), 7, 'alice/new.jpg'));
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
