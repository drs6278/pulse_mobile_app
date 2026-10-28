export type EventNotification = {
  id: string; event_id: string; event_title: string; created_at: string; read_at: string | null;
  changes: Record<string, { before: string | number | null; after: string | number | null }>;
};
const labels: Record<string, string> = { title: 'Title', location: 'Location', category: 'Category', pulse_starts_at: 'Start', pulse_ends_at: 'End', pulse_timezone: 'Timezone', pulse_age_min: 'Age restriction', pulse_all_day_start: 'All-day start', pulse_all_day_end: 'All-day end' };
export function notificationChanges(notification: EventNotification) {
  function format(field: string, value: string | number | null) {
    if (value === null) return 'None';
    if (field === 'pulse_age_min') return Number(value) === 0 ? 'All ages' : `${value}+`;
    if (field === 'pulse_starts_at' || field === 'pulse_ends_at') return new Date(String(value)).toLocaleString();
    return String(value);
  }
  return Object.entries(notification.changes).map(([field, change]) => `${labels[field] ?? field}: ${format(field, change.before)} → ${format(field, change.after)}`);
}
