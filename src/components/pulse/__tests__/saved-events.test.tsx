import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SaveEventButton } from '../save-event-button';
import SavedEventsScreen from '../saved-events-screen';
import type { SavedEvent } from '@/lib/saved-events';

const mockSetSaved = jest.fn<(id: string, saved: boolean) => Promise<void>>();
const mockRefresh = jest.fn();
let mockData: SavedEvent[] = [];
let mockLoading = false;
jest.mock('@/providers/saved-events-provider', () => ({ useSavedEvents: () => ({ data: mockData, loading: mockLoading, busy: false, error: null, refresh: mockRefresh, setSaved: mockSetSaved }) }));
jest.mock('expo-router', () => ({ useFocusEffect: () => {} }));
jest.mock('../ui', () => {
  const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    TitleHeader: () => null,
    PulseText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    PulseIcon: () => null,
    PreviewLink: ({ children, href }: { children: React.ReactNode; href: unknown }) => <View accessibilityLabel={JSON.stringify(href)}>{children}</View>,
  };
});
const row: SavedEvent = { event_id: '9007199254740993', created_at: '2026-11-02', event: { id: '9007199254740993', title: 'Concert', category: 'Music', event_date: '2026-11-03', location: 'Hall' } };
beforeEach(() => { jest.clearAllMocks(); mockData = []; mockLoading = false; mockSetSaved.mockResolvedValue(undefined); });
test('bookmark saves the exact string ID without an RSVP', async () => {
  const screen = await render(<SaveEventButton id={row.event_id} title="Concert" />);
  await fireEvent.press(screen.getByLabelText('Save Concert'));
  await waitFor(() => expect(mockSetSaved).toHaveBeenCalledWith(row.event_id, true));
});
test('saved bookmark removes the event and reports write failures', async () => {
  mockData = [row];
  mockSetSaved.mockRejectedValue(new Error('Connection failed. Try again.'));
  const screen = await render(<SaveEventButton id={row.event_id} title="Concert" />);
  await fireEvent.press(screen.getByLabelText('Unsave Concert'));
  await waitFor(() => expect(screen.getByText('Connection failed. Try again.')).toBeTruthy());
  expect(mockSetSaved).toHaveBeenCalledWith(row.event_id, false);
  expect(screen.getByText('Saved')).toBeTruthy();
});
test('save is disabled until the account bookmarks have loaded', async () => {
  mockLoading = true;
  const screen = await render(<SaveEventButton id={row.event_id} title="Concert" />);
  await fireEvent.press(screen.getByLabelText('Save Concert'));
  expect(mockSetSaved).not.toHaveBeenCalled();
});
test('saved list shows real event details and a link using its ID', async () => {
  mockData = [row];
  const screen = await render(<SavedEventsScreen />);
  expect(screen.getByText('Concert')).toBeTruthy();
  expect(screen.getByText('Hall')).toBeTruthy();
  expect(screen.getByLabelText(JSON.stringify({ pathname: '/event', params: { id: row.event_id } }))).toBeTruthy();
});
test('unavailable bookmarks remain removable', async () => {
  mockData = [{ ...row, event: null }];
  const screen = await render(<SavedEventsScreen />);
  await fireEvent.press(screen.getByText('Remove unavailable event'));
  await waitFor(() => expect(mockSetSaved).toHaveBeenCalledWith(row.event_id, false));
});
test('empty list explains how to save events', async () => {
  expect((await render(<SavedEventsScreen />)).getByText('No saved events yet.')).toBeTruthy();
});
