export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export const currentMonth = () => localDate().slice(0, 7);
export function browseMonths(plan, today = currentMonth()) {
  return [...new Set([today, ...(plan?.months || []).map(row => row.month)])].sort();
}
export function adjacentMonth(plan, month, direction, today = currentMonth()) {
  const months = browseMonths(plan, today);
  const index = months.indexOf(month);
  if (index < 0) return today;
  return months[Math.max(0, Math.min(months.length - 1, index + Math.sign(direction)))];
}
export const money = value => (value / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
export function toCents(value) {
  const text = String(value).replace(/[,，\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('请输入有效金额，最多两位小数');
  const [a, b = ''] = text.split('.');
  const cents = Number(a) * 100 + Number(b.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 100000000000) throw new Error('金额超出允许范围');
  return cents;
}
export function assertPlan(plan) {
  if (!plan || !Array.isArray(plan.assets) || !plan.assets.length || plan.assets.length > 40 || !Array.isArray(plan.months) || !plan.months.length || plan.months.length > 36) throw new Error('请提供 1–40 个标的、1–36 个月的计划');
  const ids = new Set(); const names = new Set(); const months = new Set();
  for (const asset of plan.assets) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(asset.id) || typeof asset.name !== 'string' || !asset.name.trim() || asset.name.length > 60 || ids.has(asset.id) || names.has(asset.name.trim()) || !['investment', 'reserve'].includes(asset.kind)) throw new Error('标的 ID、名称或类型无效，不能重复');
    ids.add(asset.id); names.add(asset.name.trim());
  }
  for (const row of plan.months) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(row.month) || months.has(row.month) || !row.targets || typeof row.targets !== 'object' || Array.isArray(row.targets)) throw new Error('月份无效或重复');
    months.add(row.month);
    if (Object.keys(row.targets).length !== ids.size || Object.keys(row.targets).some(id => !ids.has(id))) throw new Error('每个月须明确所有标的金额，未投入请填 0');
    for (const value of Object.values(row.targets)) if (!Number.isSafeInteger(value) || value < 0 || value > 100000000000) throw new Error('计划金额无效');
  }
  if (plan.notes !== undefined && (typeof plan.notes !== 'string' || plan.notes.length > 8000)) throw new Error('计划说明过长');
  return plan;
}
export const emptyState = () => ({ version: 1, plan: null, draft: null, revision: 0, draftRevision: 0, recordsRevision: 0, pendingRecords: null, recordReviews: [], records: [], chat: [] });
function assertRecord(record) {
  const match = typeof record.date === 'string' && record.date.match(/^(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!match || new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getDate() !== Number(match[3]) || typeof record.id !== 'string' || !record.id || !/^[a-zA-Z0-9_-]{1,64}$/.test(record.assetId) || typeof record.assetName !== 'string' || !record.assetName.trim() || record.assetName.length > 60 || !Number.isSafeInteger(record.amount) || record.amount <= 0 || record.amount > 100000000000) throw new Error('买入数据格式无效，请核对日期、标的和金额');
}
export function assertState(state) {
  if (!state || state.version !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Number.isSafeInteger(state.draftRevision) || state.draftRevision < 0 || !Array.isArray(state.records) || !Array.isArray(state.chat)) throw new Error('本地数据格式无效');
  if (state.plan) assertPlan(state.plan);
  if (state.draft) assertPlan(state.draft);
  if (state.recordReviews !== undefined && (!Array.isArray(state.recordReviews) || state.recordReviews.some(review => typeof review.batchId !== 'string' || !Number.isInteger(review.messageIndex) || review.messageIndex < -1 || !Number.isInteger(review.count) || review.count < 0 || !Number.isInteger(review.skipped) || review.skipped < 0 || !['pending', 'updated', 'saved', 'cancelled'].includes(review.status)))) throw new Error('对话记录卡片格式无效');
  if (state.recordsRevision !== undefined && (!Number.isSafeInteger(state.recordsRevision) || state.recordsRevision < 0)) throw new Error('记录版本无效');
  const recordIds = new Set();
  for (const record of state.records) {
    assertRecord(record);
    if (recordIds.has(record.id)) throw new Error('买入记录重复');
    recordIds.add(record.id);
  }
  if (state.pendingRecords) {
    const batch = state.pendingRecords;
    if (typeof batch.id !== 'string' || !Number.isSafeInteger(batch.recordsRevision) || !Number.isSafeInteger(batch.skipped) || batch.skipped < 0 || !Array.isArray(batch.entries) || batch.entries.length > 2000 || new Set(batch.entries.map(r => r.id)).size !== batch.entries.length) throw new Error('待确认记录无效');
    batch.entries.forEach(assertRecord);
  }
  return state;
}
export function setDraft(state, plan) {
  assertPlan(plan);
  for (const asset of plan.assets) {
    const previous = state.plan?.assets.find(a => a.id === asset.id);
    if (previous && previous.kind !== asset.kind) throw new Error('已有标的类型不能直接改变');
    const record = state.records.find(r => r.assetId === asset.id);
    if (record && !previous && record.assetName !== asset.name) throw new Error('该标的 ID 已被历史记录使用');
  }
  if (state.plan) for (const asset of state.plan.assets) {
    if (!plan.assets.some(a => a.id === asset.id) && state.records.some(r => r.assetId === asset.id)) throw new Error('已有买入的标的须保留，可将目标改为 0');
  }
  state.draft = structuredClone(plan);
  state.draftRevision++;
  return state;
}
export function commitDraft(state, expectedDraftRevision, expectedPlanRevision) {
  if (!state.draft || expectedDraftRevision !== state.draftRevision || expectedPlanRevision !== state.revision) throw new Error('计划已变化，请重新核对');
  assertPlan(state.draft);
  state.plan = structuredClone(state.draft);
  state.draft = null;
  state.draftRevision++;
  state.revision++;
  return state;
}
export function addPurchase(state, assetId, amount, expectedPlanRevision, now = new Date(), id = crypto.randomUUID()) {
  if (state.revision !== expectedPlanRevision) throw new Error('计划已变化，请重新确认买入');
  const date = localDate(now);
  const row = state.plan?.months.find(m => m.month === date.slice(0, 7));
  const asset = state.plan?.assets.find(a => a.id === assetId && a.kind === 'investment');
  if (!row || !asset) throw new Error('本月没有该标的的投资计划');
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000000) throw new Error('请输入大于 0 的金额');
  if (state.records.some(r => r.id === id)) return state;
  state.records.push({ id, assetId, assetName: asset.name, date, amount });
  state.recordsRevision = (state.recordsRevision || 0) + 1;
  return state;
}
export function prepareRecords(state, rows, allowDuplicates = false) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 2000 || typeof allowDuplicates !== 'boolean') throw new Error('请提供 1–2000 条记录');
  const known = [...(state.plan?.assets || []), ...(state.draft?.assets || []), ...state.records.map(r => ({ id: r.assetId, name: r.assetName, kind: 'investment' }))];
  const entries = []; let skipped = 0;
  const ids = new Set();
  const signature = r => JSON.stringify([r.date, r.assetId, r.amount]);
  const updatingIds = new Set(rows.map(r => r?.recordId).filter(Boolean));
  const signatures = new Set(state.records.filter(r => !updatingIds.has(r.id)).map(signature));
  for (const row of rows) {
    if (typeof row.recordId !== 'string') throw new Error('新增记录的 recordId 留空，修改记录须先查询原记录');
    const previous = row.recordId ? state.records.find(r => r.id === row.recordId) : null;
    if (row.recordId && !previous) throw new Error('原记录不存在，请重新查询');
    const record = { id: previous?.id || crypto.randomUUID(), assetId: row.assetId, assetName: typeof row.assetName === 'string' ? row.assetName.trim() : '', date: row.date, amount: toCents(row.amount) };
    assertRecord(record);
    const asset = known.find(a => a.id === record.assetId);
    if (asset && (asset.kind !== 'investment' || asset.name !== record.assetName)) throw new Error('请沿用已有投资标的的 ID 与名称，债券预留不能作为买入标的');
    if (known.some(a => a.name === record.assetName && a.id !== record.assetId)) throw new Error('该标的已有 ID，请先查询并沿用');
    if (ids.has(record.id)) throw new Error('同一条记录不能重复修改');
    ids.add(record.id);
    if (!allowDuplicates && signatures.has(signature(record))) { skipped++; continue; }
    signatures.add(signature(record));
    entries.push(record); known.push({ id: record.assetId, name: record.assetName, kind: 'investment' });
  }
  state.pendingRecords = { id: crypto.randomUUID(), entries, skipped, recordsRevision: state.recordsRevision || 0 };
  return state.pendingRecords;
}
export function commitRecords(state, batchId) {
  const batch = state.pendingRecords;
  if (!batch || batch.id !== batchId || batch.recordsRevision !== (state.recordsRevision || 0)) throw new Error('记录已变化，请重新整理并核对记录');
  const records = structuredClone(state.records);
  for (const entry of batch.entries) {
    assertRecord(entry);
    const index = records.findIndex(r => r.id === entry.id);
    if (index < 0) records.push(structuredClone(entry)); else records[index] = structuredClone(entry);
  }
  state.records = records; state.recordsRevision = (state.recordsRevision || 0) + 1; state.pendingRecords = null;
  return state;
}
export function monthSummary(state, month = currentMonth()) {
  const row = state.plan?.months.find(m => m.month === month);
  if (!row) return null;
  const items = state.plan.assets.filter(a => a.kind === 'investment').map(asset => {
    const paid = state.records.filter(r => r.assetId === asset.id && r.date.slice(0, 7) === month).reduce((sum, r) => sum + r.amount, 0);
    return { ...asset, target: row.targets[asset.id], paid };
  });
  return { items, target: state.plan.assets.reduce((sum, asset) => sum + row.targets[asset.id], 0), paid: items.reduce((s, a) => s + a.paid, 0) };
}
export function progress(paid, target) {
  const over = paid > target;
  const percent = target === 0 ? (paid === 0 ? 0 : null) : Math.round(paid / target * 1000) / 10;
  return { over, width: percent === null ? 100 : Math.min(100, percent), label: percent === null ? '超额' : `${percent}%` };
}
export function diffPlan(oldPlan, draft) {
  assertPlan(draft);
  const diffs = [];
  for (const row of draft.months) for (const asset of draft.assets) {
    const old = oldPlan?.months.find(m => m.month === row.month)?.targets[asset.id];
    if (old !== row.targets[asset.id]) diffs.push({ month: row.month, name: asset.name, before: old ?? null, after: row.targets[asset.id] });
  }
  for (const row of oldPlan?.months || []) for (const asset of oldPlan.assets) {
    if (!draft.months.some(m => m.month === row.month) || !draft.assets.some(a => a.id === asset.id)) diffs.push({ month: row.month, name: asset.name, before: row.targets[asset.id], after: null });
  }
  return diffs;
}
