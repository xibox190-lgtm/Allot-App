import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../public/modules/domain.mjs';
import { exportPlan, exportRecords } from '../public/modules/export.mjs';

function saved() {
  const state = emptyState();
  state.plan = {
    assets: [{ id: 'stock', name: '沪深300', kind: 'investment' }, { id: 'buffer', name: '债券缓冲', kind: 'reserve' }],
    months: [{ month: '2026-11', targets: { stock: 30050, buffer: 0 } }, { month: '2026-10', targets: { stock: 200000, buffer: 100001 } }],
    notes: '按月投入\n缓冲留存'
  };
  state.draft = { ...structuredClone(state.plan), notes: '未确认说明' };
  state.pendingRecords = { entries: [{ assetName: '未确认标的', amount: 123 }] };
  state.chat = [{ role: 'user', content: '私密聊天' }];
  state.key = 'fake-secret';
  return state;
}

test('plan exports all saved months, reserves, zeros and exact yuan amounts without unfinished or unrelated data', () => {
  const state = saved(), before = structuredClone(state);
  assert.equal(exportPlan(state), 'Allot计划v1；金额单位：元；仅已保存；B为预留，不计已投\n标的：A="沪深300"；B="债券缓冲"\n月份:A,B\n2026-10:2000,1000.01\n2026-11:300.5,0\n说明：按月投入\n缓冲留存');
  assert.deepEqual(state, before);
});

test('records preserve duplicates, history outside the plan and historical names, sorted without mutation', () => {
  const state = saved();
  state.records = [
    { id: '1', assetId: 'stock', assetName: '沪深300', date: '2026-10-08', amount: 30050 },
    { id: '2', assetId: 'stock', assetName: '旧名称', date: '2025-01-01', amount: 1 },
    { id: '3', assetId: 'stock', assetName: '沪深300', date: '2026-10-08', amount: 30050 },
    { id: '4', assetId: 'old', assetName: '历史标的', date: '2025-01-02', amount: 100000000000 }
  ];
  const before = structuredClone(state);
  assert.equal(exportRecords(state), 'Allot买入记录v1；金额单位：元；仅已保存；每行一笔\n标的：A="旧名称"；B="历史标的"；C="沪深300"\n日期:标的,金额\n2025-01-01:A,0.01\n2025-01-02:B,1000000000\n2026-10-08:C,300.5\n2026-10-08:C,300.5');
  assert.deepEqual(state, before);
});

test('export rejects empty saved data even when drafts exist', () => {
  const state = saved(); state.plan = null;
  assert.throws(() => exportPlan(state), /没有已保存/);
  assert.throws(() => exportRecords(state), /没有已保存/);
});

test('asset mapping handles 40 assets and escapes names without disrupting colon-delimited rows', () => {
  const state = saved();
  state.plan.assets = Array.from({ length: 40 }, (_, i) => ({ id: `a${i}`, name: i === 0 ? '名称,分号；引号"\n换行' : `标的${i}`, kind: 'investment' }));
  state.plan.months = [{ month: '2026-10', targets: Object.fromEntries(state.plan.assets.map(a => [a.id, 10])) }];
  const lines = exportPlan(state).split('\n');
  assert.ok(lines[1].includes('A="名称,分号；引号\\"\\n换行"'));
  assert.ok(lines[1].includes('AN="标的39"'));
  assert.equal(lines[2].split(':')[0], '月份');
  assert.equal(lines[2].split(':')[1].split(',').length, 40);
  assert.equal(lines[3].split(':')[0], '2026-10');
  assert.equal(lines[3].split(':')[1].split(',').length, 40);
});
