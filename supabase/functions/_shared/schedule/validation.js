// Generated from src/lib/schedule/validation.ts; regenerate with prepare-delivery.mjs.
import { DateTime } from 'luxon';
import { localDate, validZone, wallTime } from './time.js';
export function validateSchedule(draft) {
    const errors = [];
    if (!draft.title.trim() || draft.title.length > 200)
        errors.push('Title must contain 1–200 characters.');
    if (draft.location.length > 500)
        errors.push('Location must be at most 500 characters.');
    if (!validZone(draft.timezone))
        errors.push('Choose a valid IANA timezone, such as America/New_York.');
    const start = wallTime(draft.start_local, draft.timezone), end = wallTime(draft.end_local, draft.timezone);
    if (!start || !end)
        errors.push('Enter valid local dates and times. Times skipped by daylight saving are invalid.');
    if (start && end && (end <= start || end.diff(start, 'days').days > 7))
        errors.push('End must follow start and be within seven days.');
    if (draft.all_day && (!draft.start_local.endsWith('T00:00:00') || !draft.end_local.endsWith('T00:00:00')))
        errors.push('All-day boundaries must be midnight; the end date is exclusive.');
    const term = DateTime.fromISO(draft.term_end, { zone: 'UTC' });
    const anchor = DateTime.fromISO(draft.start_local.slice(0, 10), { zone: 'UTC' });
    if (!localDate(draft.term_end) || term < anchor || term.diff(anchor, 'days').days > 366)
        errors.push('Semester end must be on or after start, within one year.');
    const rule = draft.recurrence;
    if (rule) {
        if (!rule.days.length || rule.days.some(day => !Number.isInteger(day) || day < 1 || day > 7))
            errors.push('Select at least one valid weekday.');
        if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 52)
            errors.push('Week interval must be 1–52.');
        if (start && !rule.days.includes(start.weekday))
            errors.push('The first class date must match a selected weekday.');
        if (!Number.isInteger(rule.weekStart) || rule.weekStart < 1 || rule.weekStart > 7)
            errors.push('Invalid recurrence week start.');
        if (rule.count !== null && (!Number.isInteger(rule.count) || rule.count < 1 || rule.count > 2000))
            errors.push('Recurrence count must be 1–2000.');
        if (rule.until && !DateTime.fromISO(rule.until, { setZone: true }).isValid)
            errors.push('Invalid recurrence end.');
        if (rule.until && start && DateTime.fromISO(rule.until, { setZone: true }) < start)
            errors.push('Recurrence end cannot precede the first class.');
    }
    if (draft.rdates.length + draft.exdates.length > 2000)
        errors.push('Too many occurrence dates.');
    for (const value of [...draft.rdates, ...draft.exdates]) {
        if (!wallTime(value, draft.timezone) || value.slice(0, 10) < draft.start_local.slice(0, 10) || value.slice(0, 10) > draft.term_end) {
            errors.push('Additional and excluded dates must be valid and inside the semester.');
            break;
        }
    }
    return errors;
}
