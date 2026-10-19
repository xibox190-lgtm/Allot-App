import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, assertState, setDraft, commitDraft, addPurchase, prepareRecords, commitRecords, monthSummary } from '../public/modules/domain.mjs';
import { executeTool, runAgent } from '../public/modules/agent.mjs';

const row = (date = '2026-08-28', amount = '2000') => ({ recordId: '', assetId: 'gold', assetName: '黄金', date, amount });
const plan = () => ({ assets: [{ id: 'gold', name: '黄金', kind: 'investment' }], months: ['2026-08', '2026-09', '2026-10'].map(month => ({ month, targets: { gold: 300000 } })), notes: '' });
function active() { const s = emptyState(); setDraft(s, plan()); commitDraft(s, s.draftRevision, s.revision); return s; }

test('historical imports stay pending, survive reload and update the matching month only after confirmation', () => {
  const s = active(); const originalPlan = structuredClone(s.plan);
  prepareRecords(s, [row(), row('2026-09-02', '1000'), row('2026-10-08', '890')]);
  assert.equal(s.records.length, 0); assert.equal(monthSummary(s, '2026-08').paid, 0);
  const restored = assertState(JSON.parse(JSON.stringify(s)));
  commitRecords(restored, restored.pendingRecords.id);
  assert.equal(monthSummary(restored, '2026-08').paid, 200000);
  assert.equal(monthSummary(restored, '2026-09').paid, 100000);
  assert.equal(monthSummary(restored, '2026-10').paid, 89000);
  assert.deepEqual(restored.plan, originalPlan); assert.equal(restored.pendingRecords, null);
  assert.throws(() => commitRecords(restored, 'old-batch'), /变化/);
});

test('reimport skips exact duplicates; explicitly distinct equal purchases can be confirmed', () => {
  const s = emptyState(); prepareRecords(s, [row(), row()]);
  assert.equal(s.pendingRecords.skipped, 1); commitRecords(s, s.pendingRecords.id);
  prepareRecords(s, [row()]); assert.equal(s.pendingRecords.entries.length, 0); assert.equal(s.pendingRecords.skipped, 1);
  prepareRecords(s, [row()], true); commitRecords(s, s.pendingRecords.id);
  assert.equal(s.records.length, 2);
});

test('AI record corrections preserve IDs and show old data until confirmation', () => {
  const s = active(); prepareRecords(s, [row()]); commitRecords(s, s.pendingRecords.id);
  const record = s.records[0]; const result = executeTool(s, 'get_records', { month: '2026-08' });
  assert.equal(result.records[0].amount, '2,000');
  executeTool(s, 'prepare_records', { records: [{ ...row('2026-09-02', '1200'), recordId: record.id }], allowDuplicates: false });
  assert.equal(s.records[0].amount, 200000);
  commitRecords(s, s.pendingRecords.id);
  assert.equal(s.records.length, 1); assert.equal(s.records[0].id, record.id);
  assert.equal(monthSummary(s, '2026-08').paid, 0); assert.equal(monthSummary(s, '2026-09').paid, 120000);
});

test('invalid dates, amounts, conflicting identities and missing record IDs never partially replace a batch', () => {
  const s = active(); prepareRecords(s, [row()]); const before = structuredClone(s);
  for (const bad of [row('2026-02-30'), row('2026-09-31'), row('2026-08-28', '0'), { ...row(), assetName: '其他黄金' }, { ...row(), assetId: 'different' }, { ...row(), recordId: 'missing' }]) {
    assert.throws(() => prepareRecords(s, [row(), bad])); assert.deepEqual(s, before);
  }
});

test('a newer purchase or batch makes old confirmation stale; plan confirmation can precede record confirmation', () => {
  const s = active(); prepareRecords(s, [row()]); const old = s.pendingRecords.id;
  addPurchase(s, 'gold', 100, s.revision, new Date(2026, 9, 8));
  assert.throws(() => commitRecords(s, old), /变化/); assert.equal(s.records.length, 1);
  prepareRecords(s, [row()]); const replaced = s.pendingRecords.id; prepareRecords(s, [row('2026-09-02')]);
  assert.throws(() => commitRecords(s, replaced), /变化/);
  setDraft(s, plan()); commitDraft(s, s.draftRevision, s.revision);
  commitRecords(s, s.pendingRecords.id); assert.equal(s.records.length, 2);
});

test('legacy stored states still load; invalid pending records are rejected', () => {
  const old = emptyState(); delete old.recordsRevision; delete old.pendingRecords;
  assert.doesNotThrow(() => assertState(old));
  const s = emptyState(); prepareRecords(s, [row()]); s.pendingRecords.entries[0].date = '2026-02-30';
  assert.throws(() => assertState(s), /日期/);
});

test('AI queries and stages historical records without writing originals or active records', async () => {
  const s = active(); let call = 0;
  const message = calls => ({ choices: [{ message: { role: 'assistant', content: null, tool_calls: calls } }] });
  const tool = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
  const result = await runAgent(s, [{ role: 'user', content: '导入 2026.08.28 黄金2000' }], async payload => {
    if (call++ === 0) return message([tool('read', 'get_records', { month: '' })]);
    if (call === 2) { assert.equal(payload.messages.at(-1).role, 'tool'); return message([tool('stage', 'prepare_records', { records: [row()], allowDuplicates: false })]); }
    assert.equal(JSON.parse(payload.messages.at(-1).content).saved, false);
    return { choices: [{ message: { role: 'assistant', content: '请核对记录后确认保存。' } }] };
  });
  assert.equal(result.state.pendingRecords.entries.length, 1); assert.equal(result.state.records.length, 0);
  assert.equal(s.pendingRecords, null); assert.equal(s.records.length, 0);
});
