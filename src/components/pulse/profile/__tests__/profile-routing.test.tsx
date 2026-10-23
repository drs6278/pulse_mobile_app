import { expect, jest, test } from '@jest/globals';
import { Text } from 'react-native';
import { act, renderRouter, waitFor } from 'expo-router/testing-library';
import { Stack } from 'expo-router';
import type { OwnProfile } from '@/lib/profile/types';
import { AccountBoundary } from '../account-boundary';

let mockSetProfile: (profile: OwnProfile) => void;
const mockInitial: OwnProfile = {
  public: { user_id: 'alice', display_name: '', bio: '', avatar_path: null, version: 1, updated_at: '2026-10-23' },
  private: { user_id: 'alice', age_band: 'unknown', account_state: 'active', profile_hidden: false, profile_setup_completed_at: null, created_at: '2026-10-23' },
};
const mockRefresh = jest.fn();
jest.mock('@/providers/profile-provider', () => ({ useProfile: () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const [data, setData] = React.useState(mockInitial);
  mockSetProfile = setData;
  return { data, loading: false, error: null, refresh: mockRefresh };
} }));
jest.mock('../setup-profile-screen', () => ({ SetupProfileScreen: () => {
  const { Link } = jest.requireActual<typeof import('expo-router')>('expo-router');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return <><Text>Required setup</Text><Link href="/delete-account">Delete account from setup</Link></>;
} }));
jest.mock('../security-screens', () => ({ DeleteAccountScreen: () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return <Text>Delete account without setup</Text>;
} }));
jest.mock('../my-profile-screen', () => ({ SignOutButton: () => null }));
jest.mock('../controls', () => ({ profileStyles: {} }));
jest.mock('../../ui', () => ({ Screen: () => null, TitleHeader: () => null }));

test('real router keeps deep links gated, permits deletion, and opens home after setup', async () => {
  const route = renderRouter({
    _layout: () => <Stack />,
    '(app)/_layout': () => <AccountBoundary><Stack /></AccountBoundary>,
    '(app)/index': () => <Text>Home after setup</Text>,
    '(app)/calendar': () => <Text>Private calendar</Text>,
    '(app)/delete-account': () => <Text>Normal deletion route</Text>,
  }, { initialUrl: '/calendar' });
  expect(route.getByText('Required setup')).toBeTruthy();
  expect(route.queryByText('Private calendar')).toBeNull();
  const { fireEvent } = jest.requireActual<typeof import('@testing-library/react-native')>('@testing-library/react-native');
  fireEvent.press(route.getByText('Delete account from setup'));
  await waitFor(() => expect(route.getPathname()).toBe('/delete-account'));
  expect(route.getByText('Delete account without setup')).toBeTruthy();
  act(() => mockSetProfile({ ...mockInitial, private: { ...mockInitial.private, profile_setup_completed_at: '2026-10-23' } }));
  await waitFor(() => expect(route.getPathname()).toBe('/'));
  expect(route.getByText('Home after setup')).toBeTruthy();
});
