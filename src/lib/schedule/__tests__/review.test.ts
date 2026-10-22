import { describe, expect, test } from '@jest/globals';
import { CSV_HEADER, parseCSV } from '../import/csv';
import { correctCandidate, reviewDecisions, setAllDay, setLocalPart } from '../import/review';
import { compareImport, contentKey } from '../import/deduplication';
import { parseScheduleSource } from '../import/process-source';
import { utf8Bytes } from '../import/utf8';
import { scheduleConflicts } from '../conflicts';
import type { ScheduleSeries } from '../types';

const csv = (rows: string) => parseCSV(`${CSV_HEADER}\n${rows}`, 'UTC', '2026-12-01');
const row = 'CS,class,Hall,MO,09:00,10:00,2026-10-26,2026-12-01,UTC';
const candidate = () => csv(row).candidates[0];
const saved = (): ScheduleSeries => ({ ...candidate().draft, id: 'saved', user_id: 'alice', import_id: 'import', version: 1, content_key: contentKey(candidate().draft) });

describe('review corrections', () => {
  test('invalid CSV fields remain visible and become valid after correction', () => {
    const broken = csv(row.replace('09:00','25:00')).candidates[0];
    expect(broken.draft.start_local).toContain('25:00');
    const fixed = correctCandidate(broken, { start_local: '2026-10-26T09:00:00' });
    expect(fixed.issues).toEqual([]);
    expect(compareImport([fixed], [])[0].action).toBe('add');
  });
  test('structural errors cannot be erased by editing a field', () => {
    const broken = { ...candidate(), structuralIssues: ['Too many columns'], issues: ['Too many columns'] };
    expect(correctCandidate(broken, { title: 'Edited' }).issues).toContain('Too many columns');
  });
  test('unknown weekdays can be corrected and one-off end dates stay visible', () => {
    const invalid = csv(row.replace(',MO,',',M,')).candidates[0];
    expect(invalid.draft.recurrence?.days).toEqual([]);
    expect(correctCandidate(invalid,{recurrence:{days:[1],interval:1,weekStart:1,count:null,until:null}}).issues).toEqual([]);
    const overnight = csv('Late study,commitment,,,23:00,01:00,2026-10-26,2026-10-27,UTC').candidates[0];
    expect(overnight.draft.end_local).toBe('2026-10-27T01:00:00');
    expect(correctCandidate(overnight,{end_local:overnight.draft.end_local}).issues).toEqual([]);
  });
  test('corrections recompute all duplicates and changed source consent', () => {
    const a = candidate(), b = { ...candidate(), key: 'second', draft: { ...candidate().draft, title: 'Math' } };
    const previous = compareImport([a,b], []);
    expect(reviewDecisions([a,correctCandidate(b,{title:'CS'})],[],[],previous)[1].reason).toBe('repeated');
    const withUID = { ...a, draft: { ...a.draft, source_uid: 'cs@test', title: 'New CS' } };
    const existing = { ...saved(), source_uid: 'cs@test' };
    const changed = compareImport([withUID],[existing]);
    expect(changed[0]).toMatchObject({reason:'changed',action:'skip'});
    const selected = [{ ...changed[0], action: 'update' as const }];
    expect(reviewDecisions([correctCandidate(withUID,{title:'Corrected CS'})],[existing],[],selected)[0].action).toBe('skip');
  });
  test('an invalid first row does not suppress a later valid duplicate', () => {
    const a = candidate();
    expect(compareImport([{ ...a, issues: ['Invalid field'] },{ ...a,key:'valid' }],[])[1].action).toBe('add');
  });
  test('correcting series times cannot silently orphan imported occurrence changes', () => {
    const a = { ...candidate(), exceptions: [{recurrence_key:'2026-10-26T09:00:00',cancelled:true,start_local:null,end_local:null}] };
    const edited = correctCandidate(a,{start_local:'2026-10-26T09:15:00'});
    expect(edited.issues.join(' ')).toContain('Occurrence changes no longer match');
    expect(correctCandidate(edited,{},true).issues).toEqual([]);
  });
  test('date/time changes preserve seconds and all-day ends are exclusive', () => {
    expect(setLocalPart('2026-10-26T09:00:00','time','09:30')).toBe('2026-10-26T09:30:00');
    expect(setAllDay(candidate().draft,true)).toMatchObject({start_local:'2026-10-26T00:00:00',end_local:'2026-10-27T00:00:00'});
  });
  test('imports validate UTF-8 byte limits rather than character count', () => {
    expect(utf8Bytes('Aé😀')).toEqual(new Uint8Array([65,195,169,240,159,152,128]));
    expect(() => parseScheduleSource('é'.repeat(1048577),'csv','UTC','2026-12-01')).toThrow('2 MiB');
    expect(() => parseScheduleSource('a\0b','csv','UTC','2026-12-01')).toThrow('UTF-8');
    expect(() => parseScheduleSource('text','pdf','UTC','2026-12-01')).toThrow('ICS and CSV');
  });
});

describe('conflict preview', () => {
  test('adjacent events do not conflict; recurring overlap reports names', () => {
    const a = candidate();
    const next = { ...saved(), id: 'next', title: 'Next', start_local: '2026-10-26T10:00:00', end_local: '2026-10-26T11:00:00' };
    expect(scheduleConflicts([a],[next],[],[],true).byKey).toEqual({});
    expect(scheduleConflicts([a],[saved()],[],[],true).byKey[a.key]).toEqual(['CS']);
  });
  test('unknown timing is disclosed and selected candidates conflict with each other', () => {
    const a = candidate(), b = { ...candidate(), key: 'other', draft: { ...candidate().draft, title: 'Math' } };
    const result = scheduleConflicts([a,b],[],[],[],false);
    expect(result.complete).toBe(false);
    expect(result.byKey[a.key]).toEqual(['Math']);
    expect(result.byKey.other).toEqual(['CS']);
  });
  test('edited occurrence excludes only its original saved occurrence', () => {
    const a = { ...candidate(), draft: { ...candidate().draft, recurrence: null, term_end: '2026-10-26' } };
    const excluded = { seriesId: 'saved', recurrenceKey: '2026-10-26T09:00:00' };
    expect(scheduleConflicts([a],[saved()],[],[],true,excluded).byKey).toEqual({});
  });
});
