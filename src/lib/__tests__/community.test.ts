import { describe, expect, test, jest } from '@jest/globals';
import { eventDraft, type EventForm } from '../community';
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
const form: EventForm = { title: ' Chess ', location: ' Library ', category: 'Social', description: 'Play', start: '2026-11-01T17:00', end: '2026-11-01T18:00', timezone: 'America/New_York', club: '', visibility: 'public' };
describe('event form time and visibility validation', () => {
 test('stores instants in the selected timezone, with explicit lifecycle and trimmed inputs', () => {
  expect(eventDraft(form,'draft')).toMatchObject({ title:'Chess',location:'Library',pulse_starts_at:'2026-11-01T17:00:00.000-05:00',pulse_status:'draft',pulse_visibility:'public',pulse_club_id:null });
 });
 test('rejects backwards times, malformed dates and unknown zones', () => {
  expect(()=>eventDraft({...form,end:form.start},'published')).toThrow(/end must be after/i);
  expect(()=>eventDraft({...form,start:'11/01/2026'},'draft')).toThrow(/valid start/i);
  expect(()=>eventDraft({...form,timezone:'No/SuchZone'},'draft')).toThrow(/valid start/i);
 });
 test('rejects daylight-saving gaps and ambiguous times rather than shifting them silently', () => {
  expect(()=>eventDraft({...form,start:'2026-03-08T02:30',end:'2026-03-08T04:00'},'draft')).toThrow(/does not exist/i);
  expect(()=>eventDraft({...form,start:'2026-11-01T01:30',end:'2026-11-01T04:00'},'draft')).toThrow(/occurs twice/i);
 });
 test('requires club organizer for club-only visibility and required fields for all states', () => {
  expect(()=>eventDraft({...form,visibility:'club_only'},'published')).toThrow(/Choose a club/i);
  expect(()=>eventDraft({...form,title:' '},'draft')).toThrow(/required/i);
 });
});
