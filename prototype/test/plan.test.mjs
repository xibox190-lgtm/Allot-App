import test from 'node:test';
import assert from 'node:assert/strict';
import { sample, cents, monthAt, parseMarkdown, demoAdjust, validate } from '../public/plan.mjs';

test('parse relative months across a year boundary and preserve asset amounts', () => {
  const { plan, warnings } = parseMarkdown(sample, '2026-10');
  assert.equal(plan.months.length, 6);
  assert.equal(plan.months.at(-1).month, '2027-03');
  assert.deepEqual(plan.months[0].amounts, [250000, 280000, 170000, 0, 300000]);
  assert.equal(warnings.length, 0);
});
test('currency is exact to cents and invalid amounts cannot become zero', () => {
  assert.equal(cents('1,200.01'), 120001);
  for (const invalid of ['', '-1', 'NaN', '1.234', '3e2']) assert.throws(() => cents(invalid));
});
test('table mismatch is surfaced, explicit month is retained, totals row is excluded', () => {
  const { plan, warnings } = parseMarkdown('| 月份 | 黄金 | 合计 |\n| --- | --- | --- |\n| 2026年11月 | **1,200.01** | 999 |\n| 合计 | 1200 | 999 |', '2026-10');
  assert.equal(plan.months[0].month, '2026-11');
  assert.equal(plan.months[0].amounts[0], 120001);
  assert.equal(plan.months.length, 1);
  assert.equal(warnings.length, 1);
});
test('ambiguous dates, missing cells and duplicate assets do not produce usable plans', () => {
  assert.throws(() => parseMarkdown('| 月份 | 黄金 |\n| 以后 | 100 |', '2026-10'));
  assert.throws(() => parseMarkdown('| 月份 | 黄金 | 纳指 |\n| 现在 | 100 |', '2026-10'));
  assert.throws(() => parseMarkdown('| 月份 | 黄金 | 黄金 |\n| 现在 | 100 | 200 |', '2026-10'));
  assert.throws(() => monthAt('2026-13', 0));
});
test('demo adjustment changes only requested asset in the first month', () => {
  const { plan } = parseMarkdown(sample, '2026-10');
  const next = demoAdjust('黄金这个月改成 2000', plan);
  assert.equal(next.months[0].amounts[4], 200000);
  assert.equal(plan.months[0].amounts[4], 300000);
  assert.deepEqual(next.months.slice(1), plan.months.slice(1));
  assert.equal(demoAdjust('前两个月不投纳指', plan), null);
  assert.throws(() => demoAdjust('不存在这个月改成 2000', plan));
});
test('stored plans require valid months and nonnegative safe integer amounts', () => {
  assert.throws(() => validate({ assets: ['黄金'], months: [{ month: '2026-10', amounts: [-1] }] }));
  assert.throws(() => validate({ assets: ['黄金'], months: [{ month: '2026-10', amounts: [1] }, { month: '2026-10', amounts: [2] }] }));
});
