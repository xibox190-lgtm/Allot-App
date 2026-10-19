// Review metadata stays outside API messages so it is never sent to the model.
export function startNewConversation(state) {
  state.conversationStarted = true;
  state.chat = [];
  state.recordReviews = [];
  state.pendingRecords = null;
  if (state.draft) state.draftRevision++;
  state.draft = null;
  return state;
}
function replyIndex(chat, start = 0) {
  for (let i = chat.length - 1; i >= start; i--) {
    if (chat[i].role === 'assistant' && !chat[i].tool_calls?.length && chat[i].content) return i;
  }
  return -1;
}
export function recordReviews(state) {
  const reviews = structuredClone(state.recordReviews || []);
  const batch = state.pendingRecords;
  if (batch && !reviews.some(review => review.batchId === batch.id)) {
    // Older versions stored the batch but not its position in the conversation.
    let start = 0;
    for (let i = 0; i < state.chat.length; i++) {
      const message = state.chat[i];
      if (message.role !== 'assistant' || !message.tool_calls?.some(call => call.function?.name === 'prepare_records')) continue;
      const ids = new Set(message.tool_calls.filter(call => call.function?.name === 'prepare_records').map(call => call.id));
      const succeeded = state.chat.slice(i + 1).some(item => {
        if (item.role !== 'tool' || !ids.has(item.tool_call_id)) return false;
        try { const result = JSON.parse(item.content); return result.saved === false && Array.isArray(result.pending); } catch { return false; }
      });
      if (succeeded) start = i + 1;
    }
    let index = state.chat.findIndex((message, i) => i >= start && message.role === 'assistant' && !message.tool_calls?.length && message.content);
    if (index < 0) index = replyIndex(state.chat);
    reviews.push({ batchId: batch.id, messageIndex: index, count: batch.entries.length, skipped: batch.skipped, status: 'pending' });
  }
  return reviews;
}
export function reconcileRecordReviews(before, after) {
  if (!after.chat.length && !after.pendingRecords) return [];
  const reviews = recordReviews(before);
  const previous = before.pendingRecords;
  if (previous && previous.id !== after.pendingRecords?.id) {
    const review = reviews.find(item => item.batchId === previous.id);
    const saved = (after.recordsRevision || 0) !== (before.recordsRevision || 0) && previous.entries.every(entry => after.records.some(record => ['id', 'assetId', 'assetName', 'date', 'amount'].every(key => record[key] === entry[key])));
    if (review) review.status = after.pendingRecords ? 'updated' : saved ? 'saved' : 'cancelled';
  }
  if (after.pendingRecords && !reviews.some(review => review.batchId === after.pendingRecords.id)) {
    reviews.push({ batchId: after.pendingRecords.id, messageIndex: replyIndex(after.chat), count: after.pendingRecords.entries.length, skipped: after.pendingRecords.skipped, status: 'pending' });
  }
  return reviews;
}
