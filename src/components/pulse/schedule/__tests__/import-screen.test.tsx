import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ImportScreen from '../import-screen';
import { CSV_HEADER, parseCSV } from '@/lib/schedule/import/csv';
import type { PickedScheduleFile } from '@/lib/schedule/import/source';
import type { ImportResult, ScheduleSource } from '@/lib/schedule/types';

const mockPick = jest.fn<() => Promise<{ name: string; text: string } | null>>();
const mockCommit = jest.fn<() => Promise<void>>();
const mockReplace = jest.fn();
const mockPrepare = jest.fn<(client: unknown, file: PickedScheduleFile, zone: string, end: string) => Promise<{ source: ScheduleSource; result: ImportResult }>>();
const mockDiscard = jest.fn<() => Promise<void>>();
const mockRemove = jest.fn<() => Promise<void>>();
const mockSchedule = {
  loading: false, error: null, refresh: jest.fn(),
  data: { series: [], exceptions: [], imports: [], preferences: { timezone: 'UTC', day_start: '08:00', day_end: '22:00', minimum_gap: 30, categories: [], version: 0 } },
  mutate: async (operation: (user: string) => Promise<unknown>) => operation('alice'),
};
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/providers/schedule-provider', () => ({ useSchedule: () => mockSchedule }));
jest.mock('@/lib/schedule/import/read-file', () => ({ pickScheduleFile: () => mockPick() }));
jest.mock('@/lib/schedule/import/source', () => ({ prepareScheduleSource: (...args: Parameters<typeof mockPrepare>) => mockPrepare(...args), discardScheduleSource: () => mockDiscard(), removeSourceObject: () => mockRemove() }));
jest.mock('@/providers/rsvp-provider', () => ({ useRSVPs: () => ({ data: [], error: null }) }));
jest.mock('@/lib/schedule/repository', () => ({ commitImport: (...args: unknown[]) => mockCommit(...args as [] ) }));
jest.mock('expo-router', () => ({ router: { replace: (...args: unknown[]) => mockReplace(...args) } }));
// Focus this test on the real import workflow; the app shell has separate routing responsibilities.
jest.mock('../../ui', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>, TitleHeader: () => null, PulseText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> };
});
jest.mock('../../event-date-time-input', () => {
  const { TextInput, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { EventDateTimeInput: ({ label, value, onChange, mode, disabled }: { label: string; value: string; onChange: (value: string) => void; mode?: string; disabled: boolean }) => <View>
    {mode !== 'time' && <TextInput accessibilityLabel={`${label} date`} value={value.slice(0, 10)} editable={!disabled} onChangeText={date => onChange(`${date}T${value.slice(11)}`)} />}
    {mode !== 'date' && <TextInput accessibilityLabel={`${label} time`} value={value.slice(11, 16)} editable={!disabled} onChangeText={time => onChange(`${value.slice(0, 10)}T${time}:00`)} />}
  </View> };
});
beforeEach(() => {
  mockPick.mockReset(); mockCommit.mockReset(); mockReplace.mockReset(); mockPrepare.mockReset();
  mockDiscard.mockReset().mockResolvedValue(undefined); mockRemove.mockReset().mockResolvedValue(undefined);
  mockPrepare.mockImplementation(async (_client, file, zone, end) => ({ source: { id: 'source-1', object_path: 'alice/source-1.csv', label: file.name, format: 'csv' }, result: parseCSV(file.text!, zone, end) }));
});
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

test('invalid times can be corrected before saving and confirmation resets after changes', async () => {
  mockPick.mockResolvedValue({ name: 'bad.csv', text: `${CSV_HEADER}\nCS,class,,MO,25:00,10:00,2026-10-26,2026-12-01,UTC` });
  mockCommit.mockResolvedValue(undefined);
  const screen = render(<ImportScreen />);
  fireEvent.press(screen.getByLabelText('Choose ICS or CSV file'));
  await waitFor(() => expect(screen.getByLabelText('Correct entry: CS')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Correct entry: CS'));
  fireEvent.changeText(screen.getByLabelText('Start time'), '09:00');
  expect(screen.queryByLabelText('Invalid — skipped')).toBeNull();
  fireEvent.press(screen.getByLabelText('Confirm timezone, selections and updates'));
  expect(screen.getByLabelText('Save 1 selected entries')).toBeEnabled();
  fireEvent.changeText(screen.getByLabelText('Title'), 'CS corrected');
  expect(screen.getByLabelText('Save 1 selected entries')).toBeDisabled();
  expect(mockCommit).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Confirm timezone, selections and updates'));
  fireEvent.press(screen.getByLabelText('Save 1 selected entries'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/calendar'));
  const decisions = (mockCommit.mock.calls[0] as unknown[])[3] as { candidate: { draft: { title: string; start_local: string } } }[];
  expect(decisions[0].candidate.draft).toMatchObject({ title: 'CS corrected', start_local: '2026-10-26T09:00:00' });
});

test('cleanup failure never turns a confirmed import into a failed save', async () => {
  mockPick.mockResolvedValue({ name: 'fall.csv', text: `${CSV_HEADER}\nCS,class,,MO,09:00,10:00,2026-10-26,2026-12-01,UTC` });
  mockCommit.mockResolvedValue(undefined); mockRemove.mockRejectedValue(new Error('Storage unavailable'));
  const screen = render(<ImportScreen />);
  fireEvent.press(screen.getByLabelText('Choose ICS or CSV file'));
  await waitFor(() => expect(screen.getByText('CS')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Confirm timezone, selections and updates'));
  fireEvent.press(screen.getByLabelText('Save 1 selected entries'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/calendar'));
  expect(mockCommit).toHaveBeenCalledTimes(1);
});

test('discard removes the private source and permits a fresh file', async () => {
  mockPick.mockResolvedValue({ name: 'fall.csv', text: `${CSV_HEADER}\nCS,class,,MO,09:00,10:00,2026-10-26,2026-12-01,UTC` });
  const screen = render(<ImportScreen />);
  fireEvent.press(screen.getByLabelText('Choose ICS or CSV file'));
  await waitFor(() => expect(screen.getByText('CS')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Discard preview'));
  await waitFor(() => expect(screen.getByLabelText('Choose ICS or CSV file')).toBeEnabled());
  expect(mockDiscard).toHaveBeenCalledTimes(1);
  expect(mockCommit).not.toHaveBeenCalled();
});
