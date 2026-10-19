// Export only saved business data; never serialize the surrounding state/config.
const amount = cents => `${Math.floor(cents / 100)}${cents % 100 ? '.' + String(cents % 100).padStart(2, '0').replace(/0$/, '') : ''}`;
function code(index) {
  let result = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
  return result;
}
const mapping = assets => '标的：' + assets.map((asset, index) => `${code(index)}=${JSON.stringify(asset.name)}`).join('；');

export function exportPlan(state) {
  const plan = state.plan;
  if (!plan) throw new Error('没有已保存的计划');
  const reserves = plan.assets.flatMap((asset, index) => asset.kind === 'reserve' ? [code(index)] : []);
  const lines = [
    'Allot计划v1；金额单位：元；仅已保存' + (reserves.length ? `；${reserves.join('、')}为预留，不计已投` : ''),
    mapping(plan.assets),
    '月份:' + plan.assets.map((_, index) => code(index)).join(','),
    ...[...plan.months].sort((a, b) => a.month.localeCompare(b.month)).map(row => row.month + ':' + plan.assets.map(asset => amount(row.targets[asset.id])).join(','))
  ];
  if (plan.notes) lines.push('说明：' + plan.notes);
  return lines.join('\n');
}

export function exportRecords(state) {
  if (!state.records.length) throw new Error('没有已保存的记录');
  const records = [...state.records].sort((a, b) => a.date.localeCompare(b.date));
  const assets = [], codes = new Map();
  // Preserve historical names even when a plan has renamed the same asset ID.
  const key = record => JSON.stringify([record.assetId, record.assetName]);
  for (const record of records) {
    if (!codes.has(key(record))) {
      codes.set(key(record), code(assets.length));
      assets.push({ name: record.assetName });
    }
  }
  return [
    'Allot买入记录v1；金额单位：元；仅已保存；每行一笔',
    mapping(assets), '日期:标的,金额',
    ...records.map(record => record.date + ':' + [codes.get(key(record)), amount(record.amount)].join(','))
  ].join('\n');
}
