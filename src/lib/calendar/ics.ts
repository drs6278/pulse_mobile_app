import ICAL from 'ical.js';
import { eventInterval, type PulseEvent } from '../event-query';

export function serializeEvent(event: PulseEvent) {
  const interval = eventInterval(event);
  if (!interval) throw new Error('This event has no verified start and end time.');
  const calendar = new ICAL.Component(['vcalendar', [], []]);
  calendar.updatePropertyWithValue('version', '2.0');
  calendar.updatePropertyWithValue('prodid', '-//Pulse//Campus Activities//EN');
  const component = new ICAL.Component('vevent');
  component.updatePropertyWithValue('uid', `pulse-event-${event.id}@pulse`);
  component.updatePropertyWithValue('sequence', event.pulse_revision ?? 1);
  component.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(), true));
  component.updatePropertyWithValue('dtstart', event.pulse_all_day_start ? ICAL.Time.fromDateString(event.pulse_all_day_start) : ICAL.Time.fromJSDate(new Date(interval.start), true));
  component.updatePropertyWithValue('dtend', event.pulse_all_day_end ? ICAL.Time.fromDateString(event.pulse_all_day_end) : ICAL.Time.fromJSDate(new Date(interval.end), true));
  component.updatePropertyWithValue('summary', event.title);
  component.updatePropertyWithValue('location', event.location);
  component.updatePropertyWithValue('description', `Pulse event: ${event.id}`);
  component.updatePropertyWithValue('status', event.pulse_cancelled ? 'CANCELLED' : 'CONFIRMED');
  calendar.addSubcomponent(component);
  return calendar.toString() + '\r\n';
}
