import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ImportScreen from '../import-screen';
import { CSV_HEADER } from '@/lib/schedule/import/csv';

const mockPick = jest.fn<() => Promise<{ name: string; text: string } | null>>();
const mockCommit = jest.fn<() => Promise<void>>();
const mockReplace = jest.fn();
const mockSchedule = {
  loading: false, error: null, refresh: jest.fn(),
  data: { series: [], exceptions: [], imports: [], preferences: { timezone: 'UTC', day_start: '08:00', day_end: '22:00', minimum_gap: 30, categories: [], version: 0 } },
  mutate: async (operation: (user: string) => Promise<unknown>) => operation('alice'),
};
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/providers/schedule-provider', () => ({ useSchedule: () => mockSchedule }));
jest.mock('@/lib/schedule/import/read-file', () => ({ pickScheduleFile: () => mockPick() }));
jest.mock('@/lib/schedule/repository', () => ({ commitImport: (...args: unknown[]) => mockCommit(...args as [] ) }));
jest.mock('expo-router', () => ({ router: { replace: (...args: unknown[]) => mockReplace(...args) } }));
// Focus this test on the real import workflow; the app shell has separate routing responsibilities.
jest.mock('../../ui', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>, TitleHeader: () => null, PulseText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> };
});
beforeEach(() => { mockPick.mockReset(); mockCommit.mockReset(); mockReplace.mockReset(); });
test('preview never saves automatically and retries an uncertain commit with the same key', async () => {
  mockPick.mockResolvedValue({ name: 'fall.csv', text: `${CSV_HEADER}\nCS,class,Library,MO,09:00,10:00,2026-10-26,2026-12-01,UTC` });
  mockCommit.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValueOnce(undefined);
  const screen = render(<ImportScreen />);
  fireEvent.press(screen.getByLabelText('Choose ICS or CSV file'));
  await waitFor(() => expect(screen.getByText('CS')).toBeTruthy());
  expect(mockCommit).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Save 1 selected entries')).toBeDisabled();
  fireEvent.press(screen.getByLabelText('Confirm timezone, selections and updates'));
  fireEvent.press(screen.getByLabelText('Save 1 selected entries'));
  await waitFor(() => expect(screen.getByText('Connection interrupted')).toBeTruthy());
  const first = mockCommit.mock.calls[0];
  fireEvent.press(screen.getByLabelText('Save 1 selected entries'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/calendar'));
  expect(mockCommit.mock.calls[1]).toEqual(first);
});
test('invalid rows are visibly excluded from saving', async () => {
  mockPick.mockResolvedValue({ name: 'bad.csv', text: `${CSV_HEADER}\nCS,class,,MO,25:00,10:00,2026-10-26,2026-12-01,UTC` });
  const screen = render(<ImportScreen />);
  fireEvent.press(screen.getByLabelText('Choose ICS or CSV file'));
  await waitFor(() => expect(screen.getByLabelText('Invalid — skipped')).toBeTruthy());
  expect(screen.getByLabelText('Save 0 selected entries')).toBeDisabled();
  expect(mockCommit).not.toHaveBeenCalled();
});
