import { jest, test, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import EditEventScreen from '../edit-event-screen';

const mockReplace = jest.fn(), mockDispatch = jest.fn(), mockRefresh = jest.fn(), mockUpdate = jest.fn<(...args: unknown[]) => Promise<void>>();
let mockPrevent: boolean;
let mockLeave: (options: { data: { action: object } }) => void;
const mockEvent = { id: '1', title: 'Original', location: 'Gym', category: 'Sports', event_date: '2099-01-01', created_by: 'alice', pulse_starts_at: '2099-01-01T14:00:00Z', pulse_ends_at: '2099-01-01T15:00:00Z', pulse_timezone: 'UTC', pulse_revision: 1 };
let mockUser = 'alice';
let mockLoading = false;
jest.mock('expo-router', () => ({ router: { replace: (...args: unknown[]) => mockReplace(...args) }, useLocalSearchParams: () => ({ id: '1' }), useNavigation: () => ({ dispatch: mockDispatch }) }));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: (prevent: boolean, callback: typeof mockLeave) => { mockPrevent = prevent; mockLeave = callback; } }));
jest.mock('@/hooks/use-user-resource', () => ({ useUserResource: () => ({ data: mockLoading ? null : mockEvent, userId: mockUser, loading: mockLoading }) }));
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: mockUser }, access_token: 'token' } }) }));
jest.mock('@/providers/events-provider', () => ({ useEvents: () => ({ refresh: mockRefresh }) }));
jest.mock('@/providers/rsvp-provider', () => ({ useRSVPs: () => ({ refresh: mockRefresh }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/profile/repository', () => ({ profileSessionClient: () => ({}) }));
jest.mock('@/lib/event-edit', () => ({ ...jest.requireActual<typeof import('@/lib/event-edit')>('@/lib/event-edit'), updateEvent: (...args: unknown[]) => mockUpdate(...args) }));
jest.mock('../ui', () => {
  const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>, TitleHeader: () => null, PulseText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> };
});
jest.mock('../screens', () => {
  const { TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
  return { EventFormFields: ({ draft, change, busy }: { draft: { title: string }; change: (values: object) => void; busy: boolean }) => <TextInput accessibilityLabel="Title" value={draft.title} onChangeText={(title: string) => change({ title })} editable={!busy} /> };
});
jest.mock('../schedule/controls', () => {
  const { Text, Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}><Text>{label}</Text></Pressable>, Message: ({ text }: { text?: string }) => text ? <Text>{text}</Text> : null };
});
beforeEach(() => { jest.clearAllMocks(); mockUser = 'alice'; mockLoading = false; mockUpdate.mockResolvedValue(undefined); });
test('only the original poster gets the edit form', () => {
  mockUser = 'bob';
  const screen = render(<EditEventScreen />);
  expect(screen.queryByLabelText('Title')).toBeNull();
  expect(screen.getByText(/unavailable for editing/)).toBeTruthy();
});
test('saving publishes all draft values and refreshes event and RSVP views', async () => {
  const screen = render(<EditEventScreen />);
  expect(mockPrevent).toBe(false);
  fireEvent.changeText(screen.getByLabelText('Title'), 'Updated');
  expect(mockPrevent).toBe(true);
  fireEvent.press(screen.getByText('Save changes'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/event', params: { id: '1' } }));
  expect(mockUpdate).toHaveBeenCalledWith({}, mockEvent, expect.objectContaining({ title: 'Updated', location: 'Gym' }));
  expect(mockRefresh).toHaveBeenCalledTimes(2);
  expect(mockPrevent).toBe(false);
});
test('leaving a dirty form asks before dispatching navigation', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = render(<EditEventScreen />);
  fireEvent.changeText(screen.getByLabelText('Title'), 'Updated');
  const action = { type: 'GO_BACK' };
  act(() => mockLeave({ data: { action } }));
  expect(mockDispatch).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2]!;
  act(() => buttons.find(button => button.text === 'Discard')!.onPress!());
  expect(mockDispatch).toHaveBeenCalledWith(action);
  alert.mockRestore();
});
test('a failed save preserves the draft and discard protection', async () => {
  mockUpdate.mockRejectedValue(new Error('This event changed. Reopen the editor.'));
  const screen = render(<EditEventScreen />);
  fireEvent.changeText(screen.getByLabelText('Title'), 'Updated');
  fireEvent.press(screen.getByText('Save changes'));
  await waitFor(() => expect(screen.getByText(/This event changed/)).toBeTruthy());
  expect(screen.getByLabelText('Title').props.value).toBe('Updated');
  expect(mockPrevent).toBe(true);
  expect(mockReplace).not.toHaveBeenCalled();
});
test('a foreground reload preserves a dirty editor and its discard protection', () => {
  const screen = render(<EditEventScreen />);
  fireEvent.changeText(screen.getByLabelText('Title'), 'Unsaved draft');
  mockLoading = true;
  screen.rerender(<EditEventScreen />);
  expect(screen.getByLabelText('Title').props.value).toBe('Unsaved draft');
  expect(mockPrevent).toBe(true);
});
