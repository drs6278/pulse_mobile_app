export type WeeklyRule = { days: number[]; interval: number; weekStart: number; count: number | null; until: string | null };
export type ScheduleDraft = {
  title: string; kind: 'class' | 'commitment'; location: string;
  start_local: string; end_local: string; timezone: string; term_end: string;
  all_day: boolean; busy: boolean; recurrence: WeeklyRule | null;
  rdates: string[]; exdates: string[]; source_uid: string | null;
};
export type ScheduleSeries = ScheduleDraft & { id: string; user_id: string; import_id: string | null; version: number; content_key: string };
export type ScheduleException = {
  id?: string; user_id: string; series_id: string; recurrence_key: string;
  cancelled: boolean; start_local: string | null; end_local: string | null;
};
export type Interval = { start: number; end: number };
export type ScheduleOccurrence = Interval & {
  id: string; seriesId: string; recurrenceKey: string; title: string; location: string;
  kind: 'class' | 'commitment'; allDay: boolean; busy: boolean;
};
export type SchedulePreferences = { timezone: string; day_start: string; day_end: string; minimum_gap: number; categories: string[]; version: number };
export type ScheduleImport = { id: string; label: string; created_at: string };
export type ImportCandidate = { key: string; draft: ScheduleDraft; exceptions: Omit<ScheduleException, 'series_id' | 'user_id'>[]; issues: string[] };
export type ImportResult = { candidates: ImportCandidate[]; errors: string[]; warnings: string[] };
export type ImportDecision = { candidate: ImportCandidate; action: 'add' | 'skip' | 'update'; existing?: ScheduleSeries; reason?: 'changed' | 'duplicate' | 'invalid' | 'repeated' };
export type Compatibility = 'compatible' | 'conflicting' | 'unknown';
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_RECORDS = 2000;
export const MAX_OCCURRENCES = 10000;
