import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, setDraft, commitDraft, addPurchase, monthSummary, progress, toCents, browseMonths, adjacentMonth } from '../public/modules/domain.mjs';
import { executeTool, runAgent } from '../public/modules/agent.mjs';
const plan = () => ({ assets: [{ id: 'gold', name: '黄金', kind: 'investment' }, { id: 'reserve', name: '预留', kind: 'reserve' }], months: [{ month: '2026-10', targets: { gold: 100000, reserve: 200000 } }, { month: '2026-11', targets: { gold: 200000, reserve: 100000 } }], notes: '' });
test('month browsing covers the entire plan in date order, includes today and stops at its ends', () => {
  const p = { months: ['2027-02', '2026-09', '2027-01', '2026-12', '2026-11'].map(month => ({ month })) };
  const before = structuredClone(p);
  assert.deepEqual(browseMonths(p, '2026-10'), ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
  let month = '2026-09';
  for (const next of ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02']) { month = adjacentMonth(p, month, 1, '2026-10'); assert.equal(month, next); }
  assert.equal(adjacentMonth(p, month, 1, '2026-10'), '2027-02');
  assert.equal(adjacentMonth(p, '2026-09', -1, '2026-10'), '2026-09');
  assert.equal(adjacentMonth(p, '2027-01', -1, '2026-10'), '2026-12');
  assert.equal(adjacentMonth(null, '2026-10', 1, '2026-10'), '2026-10');
  assert.deepEqual(p, before);
});
function active() { const state = emptyState(); setDraft(state, plan()); commitDraft(state, state.draftRevision, state.revision); return state; }
test('draft needs confirmation; stale confirmation cannot overwrite a newer draft', () => {
  const s = emptyState(); setDraft(s, plan()); assert.equal(s.plan, null);
  const revision = s.draftRevision; setDraft(s, plan());
  assert.throws(() => commitDraft(s, revision, 0), /变化/); assert.equal(s.plan, null);
  commitDraft(s, s.draftRevision, 0); assert.ok(s.plan); assert.equal(s.draft, null);
});
test('partial purchases accumulate, repeated confirmation is idempotent, reserve stays out of buyable items', () => {
  const s = active(), now = new Date(2026, 9, 10);
  addPurchase(s, 'gold', toCents('300.01'), 1, now, 'one');
  addPurchase(s, 'gold', toCents('300.01'), 1, now, 'one');
  addPurchase(s, 'gold', toCents('200'), 1, now, 'two');
  assert.equal(s.records.length, 2); assert.equal(s.records[0].date, '2026-10-10');
  assert.equal(monthSummary(s, '2026-10').paid, 50001);
  assert.equal(monthSummary(s, '2026-10').target, 300000);
  assert.equal(monthSummary(s, '2026-11').paid, 0);
  assert.throws(() => addPurchase(s, 'reserve', 100, 1, now), /没有/);
  assert.throws(() => addPurchase(s, 'gold', 100, 0, now), /变化/);
  assert.throws(() => addPurchase(s, 'gold', 100, 1, new Date(2027, 1, 1)), /没有/);
});

test('monthly totals include the reserve budget without treating it as a completed investment', () => {
  const s = active();
  s.plan.months[0].targets = { gold: 940000, reserve: 60000 };
  s.records = [{ id: 'one', assetId: 'gold', assetName: '黄金', date: '2026-10-10', amount: 940000 }];
  const summary = monthSummary(s, '2026-10');
  assert.deepEqual(summary.items.map(a => a.id), ['gold']);
  assert.equal(summary.target, 1000000); assert.equal(summary.paid, 940000);
  assert.equal(summary.target - summary.paid, 60000);
  assert.equal(progress(summary.paid, summary.target).label, '94%');
  assert.equal(monthSummary(s, '2026-11').target, 300000);
});
test('plan changes retain purchases; over-target and zero-target completion stay meaningful', () => {
  const s = active(); addPurchase(s, 'gold', 150000, 1, new Date(2026, 9, 10), 'one');
  executeTool(s, 'update_draft', { changes: [{ month: '2026-10', assetId: 'gold', amount: '500' }] });
  assert.equal(s.plan.months[0].targets.gold, 100000);
  assert.equal(s.draft.months[1].targets.gold, 200000);
  commitDraft(s, s.draftRevision, s.revision);
  assert.equal(monthSummary(s, '2026-10').paid, 150000);
  assert.deepEqual(progress(150000, 50000), { over: true, width: 100, label: '300%' });
  assert.deepEqual(progress(100, 0), { over: true, width: 100, label: '超额' });
  assert.deepEqual(progress(0, 0), { over: false, width: 0, label: '0%' });
  const replacement = plan(); replacement.assets = replacement.assets.filter(a => a.id !== 'gold'); replacement.months.forEach(m => delete m.targets.gold);
  assert.throws(() => setDraft(s, replacement), /须保留/);
});
test('invalid tool batch is atomic and cents parsing does not lose precision', () => {
  const s = active(), before = structuredClone(s);
  assert.throws(() => executeTool(s, 'update_draft', { changes: [{ month: '2026-10', assetId: 'gold', amount: '200' }, { month: '2026-10', assetId: 'unknown', amount: '100' }] }));
  assert.deepEqual(s, before);
  assert.equal(toCents('2,500.09'), 250009);
  for (const value of ['-2', '0.001', 'Infinity', 'NaN', '', '2e5']) assert.throws(() => toCents(value));
});
const toolReply = (id, name, args) => ({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] });
const textReply = content => ({ choices: [{ message: { role: 'assistant', content } }] });
test('agent queries and edits autonomously, returns draft without touching the original', async () => {
  const s = active(); let n = 0;
  const result = await runAgent(s, [{ role: 'user', content: '本月黄金改到 1500，其他不变' }], async payload => {
    assert.deepEqual(payload.thinking, { type: 'disabled' });
    if (n++ === 0) return toolReply('query', 'get_plan', { scope: 'active' });
    if (n === 2) { assert.equal(JSON.parse(payload.messages.at(-1).content).plan.months[0].allocations[0].amount, '1,000'); return toolReply('edit', 'update_draft', { changes: [{ month: '2026-10', assetId: 'gold', amount: '1500' }] }); }
    return textReply('已整理，确认后生效。');
  });
  assert.equal(s.draft, null); assert.equal(result.state.plan.months[0].targets.gold, 100000);
  assert.equal(result.state.draft.months[0].targets.gold, 150000);
  assert.equal(result.state.draft.months[1].targets.gold, 200000);
  assert.equal(result.messages.filter(m => m.role === 'tool').length, 2);
});
test('agent error repair and request failures never partially apply a plan', async () => {
  const s = active(); let n = 0;
  const result = await runAgent(s, [{ role: 'user', content: '改黄金' }], async payload => {
    if (n++ === 0) return toolReply('bad', 'update_draft', { changes: [{ month: '2026-10', assetId: 'unknown', amount: '1' }] });
    assert.match(JSON.parse(payload.messages.at(-1).content).error, /不存在/); return textReply('请确认月份和金额。');
  });
  assert.deepEqual(result.state, s);
  n = 0;
  await assert.rejects(runAgent(s, [], async () => {
    if (n++ === 0) return toolReply('valid', 'update_draft', { changes: [{ month: '2026-10', assetId: 'gold', amount: '1' }] });
    throw new Error('offline');
  }), /offline/);
  assert.equal(s.draft, null);
});
test('image content is forwarded and ambiguous input may simply ask a question', async () => {
  const history = [{ role: 'user', content: [{ type: 'text', text: '这是我的计划' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }] }];
  const result = await runAgent(emptyState(), history, async payload => { assert.deepEqual(payload.messages[1], history[0]); return textReply('从哪个月份开始？'); });
  assert.equal(result.state.draft, null); assert.equal(result.reply, '从哪个月份开始？');
});
