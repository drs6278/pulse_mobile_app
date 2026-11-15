import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { EventCard } from '../event-card';
import { vote, type Engagement } from '@/lib/community';
import type { SavedEvent } from '@/lib/saved-events';
import type { PulseEvent } from '@/lib/event-query';

const mockSetSaved = jest.fn<(id: string, saved: boolean) => Promise<void>>();
let mockData: SavedEvent[] = [];
jest.mock('@/providers/saved-events-provider', () => ({ useSavedEvents: () => ({ data: mockData, loading: false, busy: false, error: null, refresh: jest.fn(), setSaved: mockSetSaved }) }));
jest.mock('@/lib/community', () => ({ vote: jest.fn() }));
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: null }) }));
jest.mock('expo-router', () => ({ Link: ({ children }: { children: ReactNode }) => children }));
jest.mock('../ui/event-photo', () => ({ EventPhoto: () => null }));
jest.mock('../profile/controls', () => ({ ProfileText: () => null, ProfileMessage: () => null }));
jest.mock('@/providers/events-provider', () => ({ useEvents: () => ({}) }));
jest.mock('@/providers/notifications-provider', () => ({ useNotifications: () => ({ unread: 0 }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: ReactNode }) => children }));

const event: PulseEvent = { id: '9007199254740993', title: 'Concert', category: 'Music', event_date: '2026-11-03', location: 'Hall' };
const engagement: Engagement = { id: event.id, score: 3, my_vote: 0, comment_count: 4 };

beforeEach(() => { jest.resetAllMocks(); mockData = []; mockSetSaved.mockResolvedValue(undefined); });

test('opens the event and shows votes and comments inside the card', async () => {
  const screen = await render(<EventCard event={event} engagement={engagement} onEngagementChange={() => {}} />);
  expect(screen.getByRole('link', { name: 'Open Concert' })).toBeTruthy();
  expect(screen.getByRole('link', { name: '4 comments and replies' })).toBeTruthy();
  expect(screen.getByText('3 points')).toBeTruthy();
});

test('upvoting casts an event vote', async () => {
  jest.mocked(vote).mockResolvedValueOnce([{ ...engagement, score: 4, my_vote: 1 }]);
  const onChange = jest.fn();
  const screen = await render(<EventCard event={event} engagement={engagement} onEngagementChange={onChange} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Upvote' }));
  await waitFor(() => expect(vote).toHaveBeenCalledWith('event', event.id, 1));
  expect(onChange).toHaveBeenLastCalledWith({ ...engagement, score: 4, my_vote: 1 });
});

test('bookmark saves the event and reports write failures inside the card', async () => {
  const screen = await render(<EventCard event={event} engagement={engagement} onEngagementChange={() => {}} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Save Concert' }));
  await waitFor(() => expect(mockSetSaved).toHaveBeenCalledWith(event.id, true));
  mockSetSaved.mockRejectedValueOnce(new Error('Connection failed. Try again.'));
  await fireEvent.press(screen.getByRole('button', { name: 'Save Concert' }));
  await waitFor(() => expect(screen.getByText('Connection failed. Try again.')).toBeTruthy());
});

test('saved events show the unsave action', async () => {
  mockData = [{ event_id: event.id, created_at: '2026-11-02', event }];
  const screen = await render(<EventCard event={event} onEngagementChange={() => {}} />);
  expect(screen.getByRole('button', { name: 'Unsave Concert', selected: true })).toBeTruthy();
});

test('without engagement only the bookmark is shown', async () => {
  const screen = await render(<EventCard event={event} onEngagementChange={() => {}} />);
  expect(screen.getByRole('button', { name: 'Save Concert' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Upvote' })).toBeNull();
  expect(screen.queryByLabelText(/comments and replies/)).toBeNull();
});
