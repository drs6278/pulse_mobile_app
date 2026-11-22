import { expect, jest, test } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { EventFormFields } from '../event-form';
import { EventPhotoField } from '../event-photo-field';
import type { EventDraft } from '@/lib/event-create';

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { __esModule: true, default: View };
});
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: null }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const draft: EventDraft = { title: 'Pick up', location: 'Gym', category: 'Sports', timezone: 'America/New_York', start_local: '2099-03-02T19:00:00', end_local: '2099-03-02T21:00:00', age_min: 0 };

test('the form edits title, category, location and age in place', async () => {
  const change = jest.fn();
  const screen = await render(<EventFormFields draft={draft} busy={false} change={change} />);
  await fireEvent.changeText(screen.getByLabelText('Title'), 'Pick up basketball');
  expect(change).toHaveBeenLastCalledWith({ title: 'Pick up basketball' });
  expect(screen.getByRole('radio', { name: 'Category: Sports' }).props.accessibilityState.checked).toBe(true);
  await fireEvent.press(screen.getByRole('radio', { name: 'Category: Music' }));
  expect(change).toHaveBeenLastCalledWith({ category: 'Music' });
  await fireEvent.changeText(screen.getByLabelText('Location'), 'Junker');
  expect(change).toHaveBeenLastCalledWith({ location: 'Junker' });
  await fireEvent.press(screen.getByRole('radio', { name: 'Age eligibility: 21+' }));
  expect(change).toHaveBeenLastCalledWith({ age_min: 21 });
});

test('the date row shows pills for start and end plus the duration', async () => {
  const screen = await render(<EventFormFields draft={draft} busy={false} change={jest.fn()} />);
  expect(screen.getByLabelText(/^Start date:/)).toBeTruthy();
  expect(screen.getByLabelText(/^End time:/)).toBeTruthy();
  expect(screen.getByText('2 hr · EST')).toBeTruthy();
});

test('the photo slot adds a photo when empty and offers change and remove once set', async () => {
  const choose = jest.fn(), remove = jest.fn();
  const screen = await render(<EventPhotoField onChoose={choose} onRemove={remove} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Add photo' }));
  expect(choose).toHaveBeenCalledTimes(1);
  await screen.rerender(<EventPhotoField uri="file://photo.jpg" onChoose={choose} onRemove={remove} />);
  expect(screen.queryByRole('button', { name: 'Add photo' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Remove photo' }));
  expect(remove).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Change photo' }));
  expect(choose).toHaveBeenCalledTimes(2);
});
