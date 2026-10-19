import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../public/modules/domain.mjs';
import { calendarMonth, calendarDay, shiftCalendarMonth } from '../public/modules/calendar.mjs';

test('calendar aligns Sunday-first weeks, leap days, and six-week months', () => {
  const state = emptyState();
  const october = calendarMonth(state, '2026-10');
  assert.equal(october.length, 42);
  assert.equal(october[0].date, '2026-09-27');
  assert.equal(october[4].date, '2026-10-01');
  assert.equal(october.filter(day => day.inMonth).length, 31);
  assert.equal(calendarMonth(state, '2024-02').filter(day => day.inMonth).at(-1).date, '2024-02-29');
  assert.equal(calendarMonth(state, '2026-02').filter(day => day.inMonth).length, 28);
  assert.equal(calendarMonth(state, '2026-08')[36].date, '2026-08-31');
});

test('daily totals use only saved records, retain distinct purchases, and need no plan', () => {
  const state = emptyState();
  state.records = [
    { id: '1', date: '2026-10-13', assetName: '黄金', amount: 10000 },
    { id: '2', date: '2026-10-13', assetName: '纳指', amount: 20000 },
    { id: '3', date: '2026-10-13', assetName: '黄金', amount: 1 },
    { id: '4', date: '2026-09-13', assetName: '历史标的', amount: 99999 }
  ];
  state.pendingRecords = { entries: [{ date: '2026-10-13', amount: 90000 }] };
  const before = structuredClone(state);
  const month = calendarMonth(state, '2026-10');
  assert.equal(month.find(day => day.date === '2026-10-13').total, 30001);
  assert.equal(month.find(day => day.date === '2026-10-14').total, 0);
  assert.equal(calendarDay(state, '2026-10-13').total, 30001);
  assert.equal(calendarDay(state, '2026-10-13').records.length, 3);
  assert.deepEqual(calendarDay(state, '2026-10-14'), { records: [], total: 0 });
  assert.equal(calendarMonth(state, '2026-09').find(day => day.date === '2026-09-13').total, 99999);
  assert.deepEqual(state, before);
});

test('calendar navigation crosses years and stops at supported record date bounds', () => {
  assert.equal(shiftCalendarMonth('2026-12', 1), '2027-01');
  assert.equal(shiftCalendarMonth('2026-01', -1), '2025-12');
  assert.equal(shiftCalendarMonth('2000-01', -1), '2000-01');
  assert.equal(shiftCalendarMonth('2099-12', 1), '2099-12');
});
