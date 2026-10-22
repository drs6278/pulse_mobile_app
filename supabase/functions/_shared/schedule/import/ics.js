// Generated from src/lib/schedule/import/ics.ts; regenerate with prepare-delivery.mjs.
import ICAL from 'ical.js';
import { DateTime } from 'luxon';
import { localDate, toLocal, validZone, wallTime } from '../time.js';
import { MAX_FILE_BYTES, MAX_RECORDS } from '../types.js';
import { validateSchedule } from '../validation.js';
import { weekdays } from './csv.js';
import { utf8Bytes } from './utf8.js';
function local(value) { return value.toString().replace(/Z$/, '') + (value.isDate ? 'T00:00:00' : ''); }
function zoneFor(component, property, fallback) {
    const prop = component.getFirstProperty(property);
    const value = prop?.getFirstValue();
    if (value?.zone?.tzid === 'UTC')
        return 'UTC';
    const zone = prop?.getParameter('tzid');
    if (zone && !validZone(String(zone)))
        throw new Error(`Unsupported timezone ${zone}. Export with an IANA timezone or UTC.`);
    return zone ? String(zone) : fallback;
}
export function parseICS(text, timezone, termEnd) {
    if (utf8Bytes(text).byteLength > MAX_FILE_BYTES)
        throw new Error('File exceeds the 2 MiB limit.');
    if (!localDate(termEnd))
        throw new Error('Enter a valid semester end date.');
    let calendar;
    try {
        calendar = new ICAL.Component(ICAL.parse(text));
    }
    catch {
        throw new Error('This is not a valid ICS calendar.');
    }
    if (calendar.name !== 'vcalendar')
        throw new Error('Expected a VCALENDAR document.');
    const components = calendar.getAllSubcomponents('vevent');
    if (components.length > MAX_RECORDS)
        throw new Error('File exceeds 2,000 calendar records.');
    const errors = [], warnings = new Set(), candidates = [];
    const masters = components.filter(component => !component.hasProperty('recurrence-id'));
    const zoneChecks = new Set();
    for (let index = 0; index < masters.length; index++) {
        const component = masters[index];
        const title = String(component.getFirstPropertyValue('summary') || 'Untitled class');
        try {
            const start = component.getFirstPropertyValue('dtstart');
            if (!start)
                throw new Error('Missing DTSTART.');
            const zone = zoneFor(component, 'dtstart', timezone);
            if (!component.getFirstProperty('dtstart')?.getParameter('tzid') && start.zone.tzid !== 'UTC' && !start.isDate)
                warnings.add(`Floating times use ${timezone}. Confirm this timezone before saving.`);
            let end = component.getFirstPropertyValue('dtend');
            const duration = component.getFirstPropertyValue('duration');
            if (!end && duration) {
                end = start.clone();
                end.addDuration(duration);
            }
            if (!end && start.isDate) {
                end = start.clone();
                end.adjust(1, 0, 0, 0);
            }
            if (!end)
                throw new Error('Missing event end or duration.');
            if (start.isDate !== end.isDate)
                throw new Error('Start and end must both be dates or both be timed values.');
            if (component.hasProperty('dtend') && zoneFor(component, 'dtend', timezone) !== zone)
                throw new Error('Different start/end timezones are not supported.');
            const uid = component.getFirstPropertyValue('uid');
            if (component.getAllProperties('rrule').length > 1)
                throw new Error('Multiple recurrence rules are not supported.');
            const rule = component.getFirstPropertyValue('rrule');
            if (component.hasProperty('exrule'))
                throw new Error('EXRULE exclusions are not supported. Export explicit excluded dates instead.');
            let recurrence = null;
            if (rule) {
                if (rule.count && rule.until)
                    throw new Error('A recurrence cannot contain both COUNT and UNTIL.');
                const raw = rule.toString().split(';').map(part => part.split('='));
                if (rule.freq !== 'WEEKLY' || raw.some(([key]) => !['FREQ', 'INTERVAL', 'BYDAY', 'COUNT', 'UNTIL', 'WKST'].includes(key)))
                    throw new Error('Only weekly recurrence with BYDAY, INTERVAL, COUNT, UNTIL and WKST is supported.');
                const byday = raw.find(([key]) => key === 'BYDAY')?.[1]?.split(',') ?? [weekdays[DateTime.fromISO(local(start), { zone: 'UTC' }).weekday - 1]];
                if (byday.some(day => !weekdays.includes(day)))
                    throw new Error('Positional weekdays are not supported.');
                let until = null;
                if (rule.until) {
                    const limit = rule.until.isDate ? `${rule.until.toString()}T23:59:59` : local(rule.until);
                    until = wallTime(limit, rule.until.zone.tzid === 'UTC' ? 'UTC' : zone)?.toUTC().toISO() ?? null;
                    if (!until)
                        throw new Error('Invalid recurrence end.');
                }
                recurrence = { days: byday.map(day => weekdays.indexOf(day) + 1).sort(), interval: rule.interval || 1, weekStart: rule.wkst ? (rule.wkst === 1 ? 7 : rule.wkst - 1) : 1, count: rule.count || null, until };
            }
            const dates = (name) => component.getAllProperties(name).flatMap(property => property.getValues().map(value => {
                if (!(value instanceof ICAL.Time))
                    throw new Error(`${name.toUpperCase()} periods are not supported.`);
                const valueZone = value.zone?.tzid === 'UTC' ? 'UTC' : String(property.getParameter('tzid') || zone);
                if (valueZone !== zone || value.isDate !== start.isDate)
                    throw new Error(`${name.toUpperCase()} timezone and value type must match the class.`);
                return local(value);
            }));
            const draft = { title, kind: 'class', location: String(component.getFirstPropertyValue('location') || ''), start_local: local(start), end_local: local(end), timezone: zone, term_end: recurrence || component.hasProperty('rdate') ? termEnd : local(start).slice(0, 10), all_day: start.isDate, busy: String(component.getFirstPropertyValue('transp')).toUpperCase() !== 'TRANSPARENT', recurrence, rdates: dates('rdate'), exdates: dates('exdate'), source_uid: uid ? String(uid) : null };
            const exceptions = [];
            for (const detached of components.filter(item => item.hasProperty('recurrence-id') && item.getFirstPropertyValue('uid') === uid)) {
                const prop = detached.getFirstProperty('recurrence-id');
                if (!uid)
                    throw new Error('Detached occurrences require a source UID.');
                if (prop.getParameter('range'))
                    throw new Error('THISANDFUTURE exceptions are not supported.');
                if (zoneFor(detached, 'recurrence-id', zone) !== zone)
                    throw new Error('Occurrence identity timezone must match its series.');
                if (detached.hasProperty('summary') && detached.getFirstPropertyValue('summary') !== component.getFirstPropertyValue('summary'))
                    throw new Error('Per-occurrence titles are not supported. Add this commitment separately.');
                if (detached.hasProperty('location') && detached.getFirstPropertyValue('location') !== component.getFirstPropertyValue('location'))
                    throw new Error('Per-occurrence locations are not supported. Add this commitment separately.');
                const key = local(prop.getFirstValue());
                const cancelled = String(detached.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED';
                const movedStart = detached.getFirstPropertyValue('dtstart'), movedEnd = detached.getFirstPropertyValue('dtend');
                if (!cancelled && (!movedStart || !movedEnd))
                    throw new Error('A moved occurrence needs both start and end.');
                if (!cancelled && (zoneFor(detached, 'dtstart', zone) !== zone || zoneFor(detached, 'dtend', zone) !== zone))
                    throw new Error('Moved occurrence timezone must match its series.');
                exceptions.push({ recurrence_key: key, cancelled, start_local: cancelled ? null : local(movedStart), end_local: cancelled ? null : local(movedEnd) });
            }
            if (String(component.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED')
                throw new Error('Canceled series are not imported. Remove an existing imported series manually.');
            const issues = validateSchedule(draft);
            for (const exception of exceptions) {
                if (!wallTime(exception.recurrence_key, zone))
                    issues.push('An occurrence has an invalid original identity.');
                if (!exception.cancelled) {
                    const movedStart = wallTime(exception.start_local, zone), movedEnd = wallTime(exception.end_local, zone);
                    if (!movedStart || !movedEnd || movedEnd <= movedStart || movedEnd.diff(movedStart, 'days').days > 7)
                        issues.push('An occurrence exception has invalid start/end times.');
                }
            }
            for (const value of [draft.start_local, draft.end_local, ...draft.rdates])
                if (DateTime.fromISO(value, { zone }).getPossibleOffsets().length > 1)
                    warnings.add('Repeated daylight-saving times use the earlier UTC offset. Review these entries before saving.');
            // Embedded custom timezone definitions must agree with the runtime IANA zone.
            const definition = calendar.getAllSubcomponents('vtimezone').find(item => item.getFirstPropertyValue('tzid') === zone);
            if (definition && !issues.length) {
                const importedZone = new ICAL.Timezone({ component: definition, tzid: zone });
                const anchor = DateTime.fromISO(draft.start_local, { zone: 'UTC' });
                for (let sample = anchor; sample.toISODate() <= draft.term_end; sample = sample.plus({ days: 1 })) {
                    const key = toLocal(sample), expected = wallTime(key, zone);
                    const checkKey = `${zone}:${key}`;
                    if (zoneChecks.has(checkKey))
                        continue;
                    if (zoneChecks.size >= 10000)
                        throw new Error('Too many timezone comparisons. Split this calendar into smaller files.');
                    if (!expected)
                        continue;
                    const imported = ICAL.Time.fromString(key, undefined);
                    imported.zone = importedZone;
                    if (imported.toUnixTime() * 1000 !== expected.toMillis())
                        throw new Error('Embedded timezone rules differ from current IANA rules. Re-export this calendar in UTC.');
                    zoneChecks.add(checkKey);
                }
            }
            candidates.push({ key: `ics:${index}`, draft, exceptions, issues });
        }
        catch (error) {
            errors.push(`${title}: ${error instanceof Error ? error.message : 'Invalid calendar entry.'}`);
        }
    }
    if (!masters.length)
        errors.push('No class series or single events found.');
    const masterUIDs = new Set(masters.map(item => item.getFirstPropertyValue('uid')));
    if (components.some(item => item.hasProperty('recurrence-id') && !masterUIDs.has(item.getFirstPropertyValue('uid'))))
        errors.push('Detached occurrences without their original series cannot be imported.');
    return { candidates, errors, warnings: [...warnings] };
}
