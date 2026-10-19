import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, prepareRecords, commitRecords, assertState } from '../public/modules/domain.mjs';
import { recordReviews, reconcileRecordReviews, startNewConversation } from '../public/modules/chat.mjs';
const entry = amount => ({ recordId: '', assetId: 'gold', assetName: '黄金', date: '2026-10-12', amount });
function staged() {
  const s = emptyState(); s.chat = [{ role: 'user', content: '黄金1000' }, { role: 'assistant', content: '请核对记录。' }];
  prepareRecords(s, [entry('1000')]);
  s.recordReviews = reconcileRecordReviews(emptyState(), s);
  return s;
}

test('new conversation clears unfinished work and model context while preserving saved investments', () => {
  const before = staged();
  commitRecords(before, before.pendingRecords.id);
  before.plan = { assets: [{ id: 'gold', name: '黄金', kind: 'investment' }], months: [{ month: '2026-10', targets: { gold: 200000 } }], notes: '' };
  before.draft = structuredClone(before.plan); before.draft.months[0].targets.gold = 300000;
  prepareRecords(before, [entry('100')]);
  const next = structuredClone(before); startNewConversation(next);
  next.recordReviews = reconcileRecordReviews(before, next);
  assert.deepEqual(next.chat, []); assert.deepEqual(next.recordReviews, []);
  assert.equal(next.pendingRecords, null); assert.equal(next.draft, null);
  assert.equal(next.draftRevision, before.draftRevision + 1);
  assert.deepEqual(next.plan, before.plan); assert.deepEqual(next.records, before.records);
  assert.equal(next.recordsRevision, before.recordsRevision); assert.equal(next.revision, before.revision);
  assert.equal(assertState(JSON.parse(JSON.stringify(next))).conversationStarted, true);
});

test('new conversation also works without unfinished work', () => {
  const s = emptyState(); startNewConversation(s);
  assert.equal(s.draftRevision, 0); assert.deepEqual(s.chat, []);
  assert.deepEqual(recordReviews(s), []); assertState(s);
});
test('record cards stay attached to their reply through follow-up questions and reloads', () => {
  const before = staged(); const next = structuredClone(before);
  next.chat.push({ role: 'user', content: '再加一条' }, { role: 'assistant', content: '请补充日期和金额。' });
  next.recordReviews = reconcileRecordReviews(before, next);
  const reviews = recordReviews(assertState(JSON.parse(JSON.stringify(next))));
  assert.equal(reviews.length, 1); assert.equal(reviews[0].messageIndex, 1); assert.equal(reviews[0].status, 'pending');
});
test('a replacement batch retires the old card and attaches the new one to the latest result', () => {
  const before = staged(); const next = structuredClone(before);
  next.chat.push({ role: 'user', content: '改成2000' }, { role: 'assistant', content: '金额已调整，请核对。' });
  prepareRecords(next, [entry('2000')]); next.recordReviews = reconcileRecordReviews(before, next);
  const cards = recordReviews(next);
  assert.deepEqual(cards.map(r => [r.messageIndex, r.status]), [[1, 'updated'], [3, 'pending']]);
  assert.notEqual(cards[0].batchId, cards[1].batchId);
});
test('saved and discarded batches retain distinct persistent status on their original replies', () => {
  const before = staged(); const saved = structuredClone(before);
  commitRecords(saved, saved.pendingRecords.id); saved.recordReviews = reconcileRecordReviews(before, saved);
  assert.equal(recordReviews(assertState(JSON.parse(JSON.stringify(saved))))[0].status, 'saved');
  const cancelled = structuredClone(before); cancelled.pendingRecords = null;
  cancelled.recordReviews = reconcileRecordReviews(before, cancelled);
  assert.equal(recordReviews(cancelled)[0].status, 'cancelled');
  assert.equal(recordReviews(cancelled)[0].messageIndex, 1);
});
test('legacy batches attach to the reply after their successful tool call rather than a later conversation', () => {
  const s = staged(); delete s.recordReviews;
  s.chat = [
    { role: 'assistant', content: '之前的计划。' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'prepare', function: { name: 'prepare_records' } }] },
    { role: 'tool', tool_call_id: 'prepare', content: JSON.stringify({ saved: false, pending: [] }) },
    { role: 'assistant', content: '请核对记录。' },
    { role: 'user', content: '再加一条' },
    { role: 'assistant', content: '请补充金额。' }
  ];
  assert.equal(recordReviews(s)[0].messageIndex, 3);
  assert.equal(s.recordReviews, undefined);
});
