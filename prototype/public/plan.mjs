export const sample = `这是我的半年计划，从本月开始。先按表整理，我会再调整。

| 月份 | 低波红利 | 自由现金流 | A500 | 纳指 | 黄金 | 合计 |
| --- | --- | --- | --- | --- | --- | --- |
| 现在 | 2500 | 2800 | 1700 | 0 | 3000 | 10000 |
| 第2月 | 2500 | 3200 | 1500 | 300 | 1500 | 9000 |
| 第3月 | 2500 | 3200 | 1500 | 300 | 1500 | 9000 |
| 第4月 | 2500 | 3200 | 1500 | 300 | 1500 | 9000 |
| 第5月 | 2400 | 3050 | 1350 | 450 | 2000 | 9250 |
| 第6月 | 2400 | 3050 | 1350 | 450 | 2000 | 9250 |`;

export const money = cents => (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
export function cents(text) {
  const raw = String(text).replace(/[,，¥￥\s]/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error('金额需要是非负数字，最多两位小数。');
  const [whole, decimal = ''] = raw.split('.');
  const value = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(value) || value > 100000000000) throw new Error('金额过大，请检查输入。');
  return value;
}
export function monthAt(start, offset) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(start)) throw new Error('请填写有效的开始月份。');
  const [year, month] = start.split('-').map(Number);
  const index = year * 12 + month - 1 + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
}
export function validate(plan) {
  if (!plan || !Array.isArray(plan.assets) || !plan.assets.length || !Array.isArray(plan.months) || !plan.months.length) throw new Error('计划缺少标的或月份。');
  if (plan.assets.length > 30 || plan.months.length > 36) throw new Error('原型最多展示 30 个标的、36 个月。');
  if (new Set(plan.assets).size !== plan.assets.length || plan.assets.some(a => typeof a !== 'string' || !a.trim())) throw new Error('标的名称不能为空或重复。');
  const months = new Set();
  for (const row of plan.months) {
    monthAt(row.month, 0);
    if (months.has(row.month)) throw new Error('月份重复，请检查计划。');
    months.add(row.month);
    if (!Array.isArray(row.amounts) || row.amounts.length !== plan.assets.length || row.amounts.some(v => !Number.isSafeInteger(v) || v < 0 || v > 100000000000)) throw new Error('计划金额不完整或格式不正确。');
  }
  return plan;
}
const clean = s => s.replace(/\*\*|`/g, '').replace(/<br\s*\/?\s*>/gi, ' ').trim();
export function parseMarkdown(text, start) {
  const lines = text.split(/\r?\n/).filter(line => line.includes('|'));
  const table = lines.map(line => line.trim().replace(/^\||\|$/g, '').split('|').map(clean));
  const head = table.findIndex(row => row[0] === '月份');
  if (head < 0) return null;
  const columns = table[head];
  const assetCols = columns.map((name, index) => ({ name, index })).filter(c => c.index > 0 && c.name && !/^(合计|总计)$/.test(c.name));
  const warnings = [];
  const months = [];
  for (const row of table.slice(head + 1)) {
    if (!row[0] || /^:?-+:?$/.test(row[0]) || /合计|总计/.test(row[0])) continue;
    let month;
    const actual = row[0].match(/^(\d{4})[.年/-](\d{1,2})月?$/);
    const relative = row[0].match(/^第\s*(\d+)\s*月$/);
    if (actual) month = `${actual[1]}-${actual[2].padStart(2, '0')}`;
    else if (/^(现在|本月|当月|第1月)$/.test(row[0])) month = start;
    else if (relative && Number(relative[1]) >= 1) month = monthAt(start, Number(relative[1]) - 1);
    else throw new Error(`「${row[0]}」的月份含义不明确，请改为“第2月”或“2026-11”等形式。`);
    const amounts = assetCols.map(col => cents(row[col.index] ?? ''));
    const totalCol = columns.findIndex(col => /^(合计|总计)$/.test(col));
    if (totalCol > -1 && row[totalCol] && cents(row[totalCol]) !== amounts.reduce((a, b) => a + b, 0)) warnings.push(`${month} 原表合计与各项金额不一致，预览按各项金额重新计算。`);
    months.push({ month, amounts });
  }
  return { plan: validate({ assets: assetCols.map(col => col.name), months }), warnings };
}

// Deliberately narrow local demo. Unrecognized language never changes the draft.
export function demoAdjust(text, plan) {
  const match = text.trim().match(/^(.+?)(?:这个月|本月)\s*(?:改成|改为|调整为)\s*([\d,，]+(?:\.\d{1,2})?)\s*[元。！!]?$/);
  if (!match) return null;
  const index = plan.assets.indexOf(match[1].trim());
  if (index < 0) throw new Error(`当前草稿没有「${match[1].trim()}」这个标的。`);
  const next = structuredClone(plan);
  next.months[0].amounts[index] = cents(match[2]);
  return validate(next);
}

// The future API adapter receives the entire current draft, conversation and attachments.
// Provider, model and authentication will be chosen when the user's API is supplied.
export async function requestPlan(_context) {
  throw new Error('尚未接入 AI API。当前仅支持示例、Markdown 表格和指定格式的演示调整。');
}
