import { beforeEach, expect, jest, test } from '@jest/globals';
import { calendarChoices, exportEvent } from '../export';

const mockStore = new Map<string,string>();
let mockPermission = 'granted';
const mockEvent = { id:'native-1',calendarId:'calendar-1',notes:'Pulse event: event-1',update:jest.fn<() => Promise<void>>(),delete:jest.fn<() => Promise<void>>() };
const mockCalendar = { allowsModifications:true,createEvent:jest.fn<() => Promise<typeof mockEvent>>(),listEvents:jest.fn<() => Promise<(typeof mockEvent)[]>>() };
const mockGetSession = jest.fn<() => Promise<{ data: { session: { user: { id: string } } | null } }>>();
jest.mock('@/lib/supabase',()=>({supabase:{auth:{getSession:()=>mockGetSession()}}}));
jest.mock('@react-native-async-storage/async-storage',()=>({__esModule:true,default:{
  getItem:async(key:string)=>mockStore.get(key)??null,
  setItem:async(key:string,value:string)=>{mockStore.set(key,value);},
  removeItem:async(key:string)=>{mockStore.delete(key);},
}}));
jest.mock('expo-calendar',()=>({
  EntityTypes:{EVENT:'event'},
  requestCalendarPermissions:async()=>({status:mockPermission}),
  getCalendarPermissions:async()=>({status:mockPermission}),
  getCalendars:async()=>[{id:'calendar-1',title:'Personal',allowsModifications:true}],
  ExpoCalendar:{get:async()=>mockCalendar},ExpoCalendarEvent:{get:async()=>mockEvent},
}));
const event = { id:'event-1',title:'Concert',category:'Music',location:'Hall',event_date:'2026-10-26',pulse_starts_at:'2026-10-26T14:00Z',pulse_ends_at:'2026-10-26T15:00Z',pulse_timezone:'UTC' };
beforeEach(()=>{
  mockStore.clear();mockPermission='granted';mockCalendar.allowsModifications=true;mockEvent.notes='Pulse event: event-1';
  mockCalendar.createEvent.mockReset().mockResolvedValue(mockEvent);mockCalendar.listEvents.mockReset().mockResolvedValue([]);
  mockEvent.update.mockReset().mockResolvedValue(undefined);mockEvent.delete.mockReset().mockResolvedValue(undefined);
  mockGetSession.mockReset().mockResolvedValue({data:{session:{user:{id:'alice'}}}});
});
test('native repeated export updates mapped event rather than creating duplicates',async()=>{
  await exportEvent(event,'alice','calendar-1');await exportEvent(event,'alice','calendar-1');
  expect(mockCalendar.createEvent).toHaveBeenCalledTimes(1);expect(mockEvent.update).toHaveBeenCalledTimes(1);
  await exportEvent(event,'alice','calendar-1',true);
  expect(mockEvent.delete).toHaveBeenCalledTimes(1);expect(mockStore.size).toBe(0);
});
test('permission denial cannot write or request unrelated calendar data',async()=>{
  mockPermission='denied';
  await expect(calendarChoices()).rejects.toThrow('not granted');
  await expect(exportEvent(event,'alice','calendar-1')).rejects.toThrow('revoked');
  expect(mockCalendar.createEvent).not.toHaveBeenCalled();expect(mockCalendar.listEvents).not.toHaveBeenCalled();
});
test('lost mapping is recovered by a matching marker; unrelated entries are not updated',async()=>{
  mockCalendar.listEvents.mockResolvedValue([mockEvent]);
  await exportEvent(event,'alice','calendar-1');expect(mockCalendar.createEvent).not.toHaveBeenCalled();
  mockEvent.notes='An unrelated personal appointment';
  await expect(exportEvent(event,'alice','calendar-1')).rejects.toThrow('no longer matches');
  expect(mockEvent.update).toHaveBeenCalledTimes(1);
});
test('account switch and cancellation cannot create new device entries',async()=>{
  mockGetSession.mockResolvedValue({data:{session:{user:{id:'bob'}}}});
  await expect(exportEvent(event,'alice','calendar-1')).rejects.toThrow('Account changed');
  mockGetSession.mockResolvedValue({data:{session:{user:{id:'alice'}}}});
  await expect(exportEvent({...event,pulse_cancelled:true},'alice','calendar-1')).rejects.toThrow('canceled');
  expect(mockCalendar.createEvent).not.toHaveBeenCalled();
});
