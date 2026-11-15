import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { EventDiscussion } from '../community';
import { comments, type DiscussionComment } from '@/lib/community';

jest.mock('@/lib/community', () => ({ comments: jest.fn(), communityRpc: jest.fn(), vote: jest.fn() }));
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: 'alice' } } }) }));
jest.mock('expo-router', () => ({ Link: ({ children }: { children: ReactNode }) => children, useFocusEffect: () => {}, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

const comment = (id: string, author: string, name: string): DiscussionComment => ({ id, author_id: author, display_name: name, body: `Hello from ${name}`, created_at: '2026-11-03T19:02:00Z', edited_at: null, parent_id: null, avatar_path: null, reply_count: 0, score: 0, my_vote: 0, comment_count: 0 });

beforeEach(() => { jest.resetAllMocks(); });

test('comment menus offer edit and delete on your own comments and report on others', async () => {
  jest.mocked(comments).mockResolvedValue([comment('1', 'alice', 'Alice'), comment('2', 'bob', 'Bob')]);
  const screen = await render(<EventDiscussion eventId="event" />);
  await waitFor(() => expect(screen.getByText('Hello from Bob')).toBeTruthy());
  const [mine, theirs] = screen.getAllByRole('button', { name: 'Comment options' });
  await fireEvent.press(mine);
  expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Delete comment' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Report' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  await fireEvent.press(theirs);
  expect(screen.getByRole('button', { name: 'Report' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Delete comment' })).toBeNull();
});

test('an empty thread invites the first comment', async () => {
  jest.mocked(comments).mockResolvedValue([]);
  const screen = await render(<EventDiscussion eventId="event" />);
  await waitFor(() => expect(screen.getByText('No comments yet. Start the conversation.')).toBeTruthy());
});

test('the Top segment reloads comments sorted by score', async () => {
  jest.mocked(comments).mockResolvedValue([]);
  const screen = await render(<EventDiscussion eventId="event" />);
  await waitFor(() => expect(comments).toHaveBeenCalledWith('event', null, false, 0));
  await fireEvent.press(screen.getByRole('radio', { name: 'Sort comments: Top' }));
  await waitFor(() => expect(comments).toHaveBeenLastCalledWith('event', null, true, 0));
});
