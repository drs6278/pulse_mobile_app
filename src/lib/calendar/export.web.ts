import type { PulseEvent } from '../event-query';
import { serializeEvent } from './ics';

export type CalendarChoice = { id: string; title: string };
export async function calendarChoices(): Promise<CalendarChoice[]> { return [{ id: 'download', title: 'Download ICS file' }]; }
export async function exportEvent(event: PulseEvent, _userId: string, _calendarId: string, remove = false) {
  if (remove) throw new Error('Remove web imports in your calendar app. Pulse cannot access that calendar.');
  const url = URL.createObjectURL(new Blob([serializeEvent(event)], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `pulse-${String(event.id).replace(/[^\w-]/g, '')}.ics`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'ICS downloaded. Import it into your calendar. Your calendar app controls duplicate handling and later updates.';
}
