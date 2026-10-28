import { expect, jest, test } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { EventDateTimeInput } from '../../event-date-time-input';

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { __esModule: true, default: View };
});
jest.mock('../../ui', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { PulseText: Text };
});

test('date-only inputs hide time controls and keep the existing wall time', () => {
  const change = jest.fn();
  const screen = render(<EventDateTimeInput label="Start" value="2026-10-26T09:15:00" timezone="America/New_York" mode="date" disabled={false} onChange={change} />);
  expect(screen.queryByLabelText(/^Start time:/)).toBeNull();
  fireEvent.press(screen.getByLabelText(/^Start date:/));
  const picker = screen.getByTestId('Start date picker');
  expect(picker.props.timeZoneName).toBe('America/New_York');
  fireEvent(picker, 'onChange', { type: 'set' }, new Date('2026-10-28T13:15:00Z'));
  expect(change).toHaveBeenCalledWith('2026-10-28T09:15:00');
});

test('time-only inputs retain the date and dismissal makes no changes', () => {
  const change = jest.fn();
  const screen = render(<EventDateTimeInput label="Available from" value="2026-01-01T08:00:00" timezone="UTC" mode="time" disabled={false} onChange={change} />);
  expect(screen.queryByLabelText(/^Available from date:/)).toBeNull();
  fireEvent.press(screen.getByLabelText(/^Available from time:/));
  fireEvent(screen.getByTestId('Available from time picker'), 'onChange', { type: 'dismissed' });
  expect(change).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText(/^Available from time:/));
  fireEvent(screen.getByTestId('Available from time picker'), 'onChange', { type: 'set' }, new Date('2026-01-01T10:30:00Z'));
  expect(change).toHaveBeenCalledWith('2026-01-01T10:30:00');
});

test('an invalid imported time can be repaired without losing its valid date', () => {
  const change = jest.fn();
  const screen = render(<EventDateTimeInput label="Start" value="2026-10-26T25:00:00" timezone="UTC" disabled={false} onChange={change} />);
  fireEvent.press(screen.getByLabelText(/^Start time:/));
  fireEvent(screen.getByTestId('Start time picker'), 'onChange', { type: 'set' }, new Date('2026-10-26T09:00:00Z'));
  expect(change).toHaveBeenCalledWith('2026-10-26T09:00:00');
});
