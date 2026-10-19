import { currentMonth, localDate, money } from './domain.mjs';

export function shiftCalendarMonth(month, direction) {
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + number - 1 + direction;
  const bounded = Math.max(2000 * 12, Math.min(2100 * 12 - 1, index));
  return `${Math.floor(bounded / 12)}-${String(bounded % 12 + 1).padStart(2, '0')}`;
}

export function calendarMonth(state, month) {
  const [year, number] = month.split('-').map(Number);
  const start = new Date(year, number - 1, 1).getDay();
  const totals = new Map();
  for (const record of state.records) {
    if (record.date.slice(0, 7) === month) totals.set(record.date, (totals.get(record.date) || 0) + record.amount);
  }
  return Array.from({ length: 42 }, (_, index) => {
    const date = localDate(new Date(year, number - 1, index - start + 1));
    return { date, inMonth: date.slice(0, 7) === month, total: totals.get(date) || 0 };
  });
}

export function calendarDay(state, date) {
  const records = state.records.filter(record => record.date === date);
  return { records, total: records.reduce((sum, record) => sum + record.amount, 0) };
}
