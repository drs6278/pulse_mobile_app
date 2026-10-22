// Generated from src/lib/schedule/time.ts; regenerate with prepare-delivery.mjs.
import { DateTime, IANAZone } from 'luxon';
export function validZone(zone) { return zone === 'UTC' || IANAZone.isValidZone(zone); }
export function localDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && DateTime.fromISO(value, { zone: 'UTC' }).isValid;
}
export function localTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
export function wallTime(value, zone) {
    if (!validZone(zone) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value))
        return null;
    const result = DateTime.fromISO(value, { zone });
    // Luxon normalizes nonexistent wall times; reject that normalization explicitly.
    if (!result.isValid || result.toFormat("yyyy-MM-dd'T'HH:mm:ss") !== value)
        return null;
    return result.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis())[0] ?? result;
}
export function toLocal(value) { return value.toFormat("yyyy-MM-dd'T'HH:mm:ss"); }
export function dateRange(date, zone, days = 1) {
    const start = DateTime.fromISO(date, { zone }).startOf('day');
    return { start: start.toMillis(), end: start.plus({ days }).toMillis() };
}
export function defaultPreferences(zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') {
    return { timezone: zone, day_start: '08:00', day_end: '22:00', minimum_gap: 30, categories: [], version: 0 };
}
