import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import EntryScreen from '../entry-screen';
import SettingsScreen from '../settings-screen';
import type { ScheduleException, ScheduleSeries } from '@/lib/schedule/types';

const mockSave = jest.fn<() => Promise<void>>(), mockException = jest.fn<() => Promise<void>>(), mockClear = jest.fn<() => Promise<void>>(), mockDelete = jest.fn<() => Promise<void>>();
const mockReplace = jest.fn();
let mockParams: {id?:string;occurrence?:string;date?:string;section?:string} = {};
const initial: ScheduleSeries = {id:'one',user_id:'alice',import_id:'batch',version:2,content_key:'one',title:'CS',kind:'class',location:'Hall',start_local:'2026-10-26T09:00:00',end_local:'2026-10-26T10:00:00',timezone:'UTC',term_end:'2026-10-26',all_day:false,busy:true,recurrence:null,rdates:[],exdates:[],source_uid:null};
const mockSchedule = {loading:false,error:null,refresh:jest.fn(),data:{series:[initial],exceptions:[] as ScheduleException[],imports:[],preferences:{timezone:'UTC',day_start:'08:00',day_end:'22:00',minimum_gap:30,categories:[] as string[],version:1}},mutate:async(operation:(user:string)=>Promise<unknown>)=>operation('alice')};
jest.mock('@/providers/schedule-provider',()=>({useSchedule:()=>mockSchedule}));
jest.mock('@/providers/rsvp-provider',()=>({useRSVPs:()=>({data:[],error:null})}));
jest.mock('@/lib/supabase',()=>({supabase:{functions:{invoke:async()=>({error:null})}}}));
jest.mock('@/lib/schedule/repository',()=>({saveSchedule:(...args:unknown[])=>mockSave(...args as []),setException:(...args:unknown[])=>mockException(...args as []),clearSchedule:()=>mockClear(),deleteSchedule:()=>mockDelete(),deleteImported:jest.fn(),savePreferences:jest.fn()}));
jest.mock('expo-router',()=>({router:{replace:(...args:unknown[])=>mockReplace(...args)},useLocalSearchParams:()=>mockParams}));
jest.mock('../../ui',()=>{
  const {View,Text,Pressable}=jest.requireActual<typeof import('react-native')>('react-native');
  return {Screen:({children}:{children:React.ReactNode})=><View>{children}</View>,TitleHeader:()=>null,PulseText:({children}:{children:React.ReactNode})=><Text>{children}</Text>,PreviewLink:({children,label}:{children:React.ReactNode;label:string})=><Pressable accessibilityLabel={label}>{children}</Pressable>};
});
jest.mock('../../event-date-time-input', () => {
  const { TextInput, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { EventDateTimeInput: ({ label, value, onChange, mode, disabled }: { label: string; value: string; onChange: (value: string) => void; mode?: string; disabled: boolean }) => <View>
    {mode !== 'time' && <TextInput accessibilityLabel={`${label} date`} value={value.slice(0, 10)} editable={!disabled} onChangeText={date => onChange(`${date}T${value.slice(11)}`)} />}
    {mode !== 'date' && <TextInput accessibilityLabel={`${label} time`} value={value.slice(11, 16)} editable={!disabled} onChangeText={time => onChange(`${value.slice(0, 10)}T${time}:00`)} />}
  </View> };
});
beforeEach(()=>{mockParams={id:'one'};mockSchedule.loading=false;mockSave.mockReset().mockResolvedValue(undefined);mockException.mockReset().mockResolvedValue(undefined);mockClear.mockReset().mockResolvedValue(undefined);mockDelete.mockReset().mockResolvedValue(undefined);mockReplace.mockReset();mockSchedule.data.series=[{...initial}];mockSchedule.data.exceptions=[];});

test('a one-off opens its full editor even when an old calendar link supplies occurrence',async()=>{
  mockParams.occurrence=initial.start_local;
  const screen=render(<EntryScreen/>);
  fireEvent.changeText(screen.getByLabelText('Title'),'Edited CS');
  fireEvent.press(screen.getByLabelText('Save entry'));
  await waitFor(()=>expect(mockReplace).toHaveBeenCalledWith('/calendar'));
  expect(mockSave).toHaveBeenCalled();expect(mockException).not.toHaveBeenCalled();
  const args=mockSave.mock.calls[0] as unknown[];
  expect(args[1]).toMatchObject({title:'Edited CS'});expect(args[2]).toMatchObject({version:2});
});

test('editing an occurrence retains its original identity',async()=>{
  mockParams.occurrence=initial.start_local;
  mockSchedule.data.series=[{...initial,term_end:'2026-12-01',recurrence:{days:[1],interval:1,weekStart:1,count:null,until:null}}];
  const screen=render(<EntryScreen/>);
  expect(screen.queryByLabelText('Title')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Start time'),'09:15');
  fireEvent.press(screen.getByLabelText('Save entry'));
  await waitFor(()=>expect(mockException).toHaveBeenCalled());
  expect((mockException.mock.calls[0] as unknown[]).slice(2)).toEqual([initial.start_local,false,'2026-10-26T09:15:00','2026-10-26T10:15:00']);
  expect(mockSave).not.toHaveBeenCalled();
});

test('whole-series save requires explicit consent to remove occurrence changes',()=>{
  mockSchedule.data.series=[{...initial,term_end:'2026-12-01',recurrence:{days:[1],interval:1,weekStart:1,count:null,until:null}}];
  mockSchedule.data.exceptions=[{user_id:'alice',series_id:'one',recurrence_key:initial.start_local,cancelled:true,start_local:null,end_local:null}];
  const screen=render(<EntryScreen/>);
  expect(screen.getByLabelText('Save entry')).toBeDisabled();
  fireEvent.press(screen.getByLabelText('Allow removal of occurrence changes'));
  expect(screen.getByLabelText('Save entry')).toBeEnabled();
});

test('management finds entries outside the visible week and clear requires confirmation',async()=>{
  const screen=render(<SettingsScreen/>);
  expect(screen.getByLabelText('Edit schedule: CS')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Find a class or commitment'),'Missing');
  expect(screen.getByText('No matching entries.')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Destructive actions'));
  fireEvent.press(screen.getByLabelText('Clear entire schedule'));
  expect(mockClear).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Keep entire schedule'));
  expect(mockClear).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Clear entire schedule'));
  fireEvent.press(screen.getByLabelText('Confirm clear entire schedule'));
  await waitFor(()=>expect(mockClear).toHaveBeenCalledTimes(1));
});

test('a new entry uses the selected day and keeps advanced fields out of the primary form', async () => {
  mockParams = { date: '2027-01-04' };
  const screen = render(<EntryScreen />);
  expect(screen.getByLabelText('Start date').props.value).toBe('2027-01-04');
  expect(screen.getByLabelText('Start time').props.value).toBe('09:00');
  expect(screen.queryByLabelText('Timezone')).toBeNull();
  expect(screen.queryByText('Title must contain 1–200 characters.')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Title'), 'Study');
  fireEvent.press(screen.getByLabelText('Save entry'));
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect((mockSave.mock.calls[0] as unknown[])[1]).toMatchObject({ start_local: '2027-01-04T09:00:00', end_local: '2027-01-04T10:00:00', recurrence: null, kind: 'commitment' });
});

test('a failed save and background refresh retain the draft and original version', async () => {
  mockSave.mockRejectedValueOnce(new Error('Try again'));
  const screen = render(<EntryScreen />);
  fireEvent.changeText(screen.getByLabelText('Title'), 'Unsaved title');
  fireEvent.press(screen.getByLabelText('Save entry'));
  await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy());
  mockSchedule.loading = true;
  screen.rerender(<EntryScreen />);
  expect(screen.getByLabelText('Title').props.value).toBe('Unsaved title');
  mockSchedule.loading = false;
  mockSchedule.data.series = [{ ...initial, version: 3, title: 'Other device' }];
  screen.rerender(<EntryScreen />);
  fireEvent.press(screen.getByLabelText('Save entry'));
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
  expect((mockSave.mock.calls[1] as unknown[])[2]).toMatchObject({ version: 2 });
});

test('all-day editing shows the last included day and saves an exclusive end', async () => {
  const screen = render(<EntryScreen />);
  fireEvent.press(screen.getByLabelText('All day'));
  expect(screen.queryByLabelText('Start time')).toBeNull();
  expect(screen.getByLabelText('Last day date').props.value).toBe('2026-10-26');
  fireEvent.changeText(screen.getByLabelText('Last day date'), '2026-10-28');
  fireEvent.press(screen.getByLabelText('Save entry'));
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect((mockSave.mock.calls[0] as unknown[])[1]).toMatchObject({ all_day: true, end_local: '2026-10-29T00:00:00' });
});

test('invalid entries explain the problem on save without writing', () => {
  mockParams = { date: '2027-01-04' };
  const screen = render(<EntryScreen />);
  expect(screen.queryAllByRole('alert')).toHaveLength(0);
  fireEvent.press(screen.getByLabelText('Save entry'));
  expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  expect(mockSave).not.toHaveBeenCalled();
});
