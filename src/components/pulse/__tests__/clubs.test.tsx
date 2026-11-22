import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ClubMember } from '@/lib/community';
import ClubsScreen from '../clubs-screen';

const mockRpc = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRefresh = jest.fn();
const mockData = {
  clubs: [{ id: 'club', name: 'Chess', description: 'Play chess', category: 'Other', approval_required: false, deleted_at: null }],
  values: [], own: null as ClubMember | null,
  members: [] as ClubMember[], count: 12, events: [], moreEvents: false,
};
jest.mock('@/lib/community', () => ({ ...jest.requireActual<object>('@/lib/community'), communityRpc: (...args: unknown[]) => mockRpc(...args) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: 'alice' } } }) }));
jest.mock('@/providers/events-provider', () => ({ useEvents: () => ({ refresh: mockRefresh }) }));
jest.mock('@/providers/rsvp-provider', () => ({ useRSVPs: () => ({ refresh: mockRefresh }) }));
jest.mock('@/providers/saved-events-provider', () => ({ useSavedEvents: () => ({ refresh: mockRefresh }) }));
jest.mock('@/hooks/use-user-resource', () => ({ useUserResource: () => ({ data: mockData, loading: false, error: null, userId: 'alice', refresh: mockRefresh, mutate: async (operation: () => Promise<unknown>) => operation() }) }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'club' }), useFocusEffect: () => {}, router: { push: jest.fn() } }));
jest.mock('../community', () => ({ VoteButtons: () => null }));
jest.mock('../event-form', () => ({ EventFormFields: () => null }));
jest.mock('../ui', () => {
  const { View, Text, Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>, TitleHeader: () => null,
    PulseText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}><Text>{label}</Text></Pressable>,
  };
});
jest.mock('../profile/controls', () => {
  const { View, Text, Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ProfileText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>, ProfileField: () => null,
    ProfileLink: ({ label }: { label: string }) => <Text>{label}</Text>,
    ProfileMessage: ({ text }: { text: string }) => text ? <Text>{text}</Text> : null,
    ProfileButton: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) => <View><Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}><Text>{label}</Text></Pressable></View>,
  };
});
const member = (role: ClubMember['role']): ClubMember => ({ user_id: 'alice', role, status: 'active', display_name: 'Alice' });
beforeEach(() => { mockRpc.mockReset().mockResolvedValue(undefined); mockRefresh.mockReset(); mockData.own = null; mockData.members = []; });

test('outsiders see aggregate count and join, without roster or management actions', async () => {
  const screen = await render(<ClubsScreen />);
  expect(screen.getByText(/12 members/)).toBeTruthy();
  expect(screen.queryByText('Members')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create club event' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Join club' }));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('manage_club_member', { p_club: 'club', p_action: 'join', p_user: 'alice' }));
});
test('officers manage events and view roster but cannot manage membership or delete the club', async () => {
  mockData.own = member('officer'); mockData.members = [member('officer')];
  const screen = await render(<ClubsScreen />);
  expect(screen.getByText('Alice')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Create club event' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Edit club' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete club' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Remove member' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Create club event' }));
  expect(screen.getByRole('button', { name: 'Club-only' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Club-only' }));
  expect(screen.getByText(/Switching to club-only cancels nonmember RSVPs/)).toBeTruthy();
});
test('leaving confirms RSVP consequences before making a write and surfaces server denial', async () => {
  mockData.own = member('admin');
  mockRpc.mockRejectedValue(new Error('Appoint another administrator first.'));
  const screen = await render(<ClubsScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Leave club' }));
  expect(mockRpc).not.toHaveBeenCalled();
  expect(screen.getByText(/Your RSVPs for its club-only events will be cancelled/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm leave club' }));
  await waitFor(() => expect(screen.getByText('Appoint another administrator first.')).toBeTruthy());
});
test('admin role changes require confirmation and use the dedicated role RPC', async () => {
  mockData.own = member('admin'); mockData.members = [{ ...member('member'), user_id: 'bob', display_name: 'Bob' }];
  const screen = await render(<ClubsScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Set role: officer' }));
  expect(mockRpc).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm role change' }));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('set_club_member_role', { p_club: 'club', p_user: 'bob', p_role: 'officer' }));
  expect(mockRefresh).toHaveBeenCalled();
});
