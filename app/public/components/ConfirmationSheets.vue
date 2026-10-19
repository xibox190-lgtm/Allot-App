<script setup>
import { computed } from "vue";
import { money } from "../modules/domain.mjs";
import Sheet from "./Sheet.vue";
const props = defineProps(["vm", "cancel"]);
const { ui, state, changes, recordChanges } = props.vm;
const renames = computed(() =>
  (state.value.draft?.assets || []).flatMap((asset) => {
    const previous = state.value.plan?.assets.find(
      (old) => old.id === asset.id,
    );
    return previous && previous.name !== asset.name
      ? [`${previous.name} → ${asset.name}`]
      : [];
  }),
);
const summary = computed(() => {
  const batch = state.value.pendingRecords;
  const updates = recordChanges.value.filter(
    (record) => record.previous,
  ).length;
  return batch
    ? `新增 ${recordChanges.value.length - updates} 条 · 修改 ${updates} 条${batch.skipped ? ` · 跳过重复 ${batch.skipped} 条` : ""}`
    : "";
});
</script>
<template>
  <Sheet
    id="plan-confirm"
    label="plan-confirm-title"
    :open="ui.dialogs.includes('plan')"
    @close="vm.closeDialog('plan')"
    @cancel="cancel('plan', $event)"
  >
    <div class="sheet-heading">
      <h2 id="plan-confirm-title">确认计划</h2>
    </div>
    <div id="changes">
      <p v-for="name in renames" :key="name" class="small">{{ name }}</p>
      <div v-for="(change, index) in changes" :key="index" class="change">
        <div>
          <small>{{ change.month.replace("-", ".") }}</small
          >{{ change.name }}
        </div>
        <span
          >{{ change.before === null ? "新增" : money(change.before) }} →
          {{ change.after === null ? "移除" : money(change.after) }}</span
        >
      </div>
      <p v-if="!changes.length" class="small muted">
        金额保持原样，确认使用当前草稿。
      </p>
      <p
        v-if="state.draft && state.draft.notes !== (state.plan?.notes || '')"
        class="small"
      >
        {{ state.draft.notes || "已清除计划说明" }}
      </p>
    </div>
    <p class="muted small">已记录的买入金额会保留。</p>
    <button id="save-plan" class="blue-button" @click="vm.savePlan">
      确认使用
    </button>
    <p id="commit-error" class="error" role="alert">{{ ui.errors.plan }}</p>
  </Sheet>
  <Sheet
    id="records-confirm"
    label="records-title"
    :open="ui.dialogs.includes('records')"
    @close="vm.closeDialog('records')"
    @cancel="cancel('records', $event)"
  >
    <div class="sheet-heading">
      <h2 id="records-title">核对投资记录</h2>
    </div>
    <p id="records-summary" class="muted small">{{ summary }}</p>
    <div id="record-changes">
      <div v-for="record in recordChanges" :key="record.id" class="change">
        <div>
          <small>{{ record.date }}</small
          >{{ record.assetName }}
        </div>
        <span>{{
          record.previous
            ? `修改为 ${money(record.amount)}\n原：${record.previous.date} ${record.previous.assetName} ${money(record.previous.amount)}`
            : money(record.amount)
        }}</span>
      </div>
      <p v-if="!recordChanges.length" class="muted small">
        没有需要新增或修改的记录。
      </p>
    </div>
    <p class="muted small">日期、标的或金额不对，可以返回对话让 AI 调整。</p>
    <div class="two-actions">
      <button
        id="discard-records"
        :disabled="ui.busy"
        @click="vm.saveRecords(true)"
      >
        放弃本次</button
      ><button
        id="save-records"
        class="blue-button"
        :disabled="ui.busy || !recordChanges.length"
        @click="vm.saveRecords(false)"
      >
        确认保存
      </button>
    </div>
    <p id="records-error" class="error" role="alert">{{ ui.errors.records }}</p>
  </Sheet>
  <Sheet
    id="new-chat-dialog"
    label="new-chat-title"
    :open="ui.dialogs.includes('new-chat')"
    @close="vm.closeDialog('new-chat')"
    @cancel="cancel('new-chat', $event)"
  >
    <p id="new-chat-title" class="new-chat-prompt">
      开启新对话将清空聊天和未完成的整理
    </p>
    <div class="two-actions">
      <button
        id="return-new-chat"
        type="button"
        @click="vm.closeDialog('new-chat')"
      >
        返回</button
      ><button
        id="confirm-new-chat"
        type="button"
        class="blue-button"
        :disabled="ui.busy"
        @click="vm.newConversation"
      >
        确认
      </button>
    </div>
    <p id="new-chat-error" class="error" role="alert">
      {{ ui.errors["new-chat"] }}
    </p>
  </Sheet>
</template>
