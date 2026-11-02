import React, { useState } from 'react';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { VoteButtons } from '../community';
import { vote, type Engagement } from '@/lib/community';

jest.mock('@/lib/community', () => ({ vote: jest.fn() }));
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: 'alice' } } }) }));
jest.mock('../profile/controls', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ProfileText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>, ProfileMessage: ({ text }: { text: string }) => text ? <Text>{text}</Text> : null };
});
function Harness() {
  const [value, setValue] = useState<Engagement>({ id: 'event', score: 0, my_vote: 0, comment_count: 0 });
  return <VoteButtons kind="event" value={value} onChange={setValue} />;
}
beforeEach(() => { jest.resetAllMocks(); });
test('upvotes, switches direction, and removes the selected vote', async () => {
  const cast = jest.mocked(vote);
  cast.mockResolvedValueOnce([{ id: 'event', score: 1, my_vote: 1, comment_count: 0 }]).mockResolvedValueOnce([{ id: 'event', score: -1, my_vote: -1, comment_count: 0 }]).mockResolvedValueOnce([{ id: 'event', score: 0, my_vote: 0, comment_count: 0 }]);
  const screen = render(<Harness />);
  fireEvent.press(screen.getByLabelText('Upvote'));
  await waitFor(() => expect(screen.getByLabelText('Upvote')).not.toBeDisabled());
  expect(cast).toHaveBeenLastCalledWith('event', 'event', 1);
  fireEvent.press(screen.getByLabelText('Downvote'));
  await waitFor(() => expect(screen.getByLabelText('Downvote')).not.toBeDisabled());
  expect(cast).toHaveBeenLastCalledWith('event', 'event', -1);
  fireEvent.press(screen.getByLabelText('Downvote'));
  await waitFor(() => expect(cast).toHaveBeenLastCalledWith('event', 'event', 0));
});
test('rolls back optimistic votes after a network failure', async () => {
  jest.mocked(vote).mockRejectedValueOnce(new Error('Connection failed'));
  const screen = render(<Harness />);
  fireEvent.press(screen.getByLabelText('Upvote'));
  await waitFor(() => expect(screen.getByText('Connection failed')).toBeTruthy());
  expect(screen.getByText('0 points')).toBeTruthy();
});
