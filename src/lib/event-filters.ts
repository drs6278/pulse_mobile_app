export const eventCategories = ['Food', 'Music', 'Sports', 'Arts', 'Outdoors', 'Other'] as const;
export const dateOptions = ['Upcoming', 'Today', 'Tomorrow', 'This Week', 'This Weekend', 'Pick Date'] as const;
export type EventFilters = {
  categories: typeof eventCategories[number][];
  date: typeof dateOptions[number];
  customDate: string;
};
export const defaultEventFilters: EventFilters = {
  categories: [], date: 'Upcoming', customDate: '',
};

export function parseEventDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function validateEventFilters(filters: EventFilters): string | null {
  if (filters.date === 'Pick Date' && !parseEventDate(filters.customDate)) return 'Enter a valid date as YYYY-MM-DD.';
  return null;
}

export function buildEventSearch(filters: EventFilters, now = new Date()) {
  const error = validateEventFilters(filters);
  if (error) throw new Error(error);
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let days = 1;
  if (filters.date === 'Upcoming') start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filters.date === 'Tomorrow') start.setDate(start.getDate() + 1);
  if (filters.date === 'This Week') {
    start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    days = 7;
  }
  if (filters.date === 'This Weekend') {
    start.setDate(start.getDate() + (start.getDay() === 0 ? -1 : 6 - start.getDay()));
    days = 2;
  }
  if (filters.date === 'Pick Date') start = parseEventDate(filters.customDate)!;
  const end = new Date(start);
  end.setDate(end.getDate() + days - 1);
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    categories: filters.categories,
    start: dateKey(start),
    end: filters.date === 'Upcoming' ? null : dateKey(end),
  };
}
