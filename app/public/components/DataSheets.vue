<script setup>
import Sheet from "./Sheet.vue";
const props = defineProps(["vm", "cancel"]);
const { state, ui } = props.vm;
</script>
<template>
  <Sheet
    id="data-dialog"
    label="data-title"
    :open="ui.dialogs.includes('data')"
    @close="vm.closeDialog('data')"
    @cancel="cancel('data', $event)"
  >
    <div class="sheet-heading">
      <h2 id="data-title">数据管理</h2>
    </div>
    <p class="muted small">点击导出，直接复制到剪贴板</p>
    <button
      id="export-plan"
      class="settings-link export-link"
      :disabled="ui.copying || ui.broken || !state.plan"
      @click="vm.copyExport(false)"
    >
      <span
        >导出计划<small id="export-plan-count">{{
          state.plan
            ? `全部已保存计划 · ${state.plan.months.length} 个月`
            : "暂无已保存计划"
        }}</small></span
      ><span aria-hidden="true">›</span>
    </button>
    <button
      id="export-records"
      class="settings-link export-link"
      :disabled="ui.copying || ui.broken || !state.records.length"
      @click="vm.copyExport(true)"
    >
      <span
        >导出记录<small id="export-records-count">{{
          state.records.length
            ? `全部已保存记录 · ${state.records.length} 笔`
            : "暂无已保存记录"
        }}</small></span
      ><span aria-hidden="true">›</span>
    </button>
    <p
      id="export-pending"
      class="muted small"
      :hidden="!state.draft && !state.pendingRecords"
    >
      仅导出已保存数据，待确认内容不包含
    </p>
    <p id="data-status" class="small" role="status">{{ ui.dataStatus }}</p>
    <p id="data-error" class="error" role="alert">{{ ui.errors.data }}</p>
    <button
      id="open-clear"
      class="settings-link danger-text"
      @click="vm.openClear"
    >
      清空数据 <span aria-hidden="true">›</span>
    </button>
  </Sheet>
  <Sheet
    id="clear-dialog"
    label="clear-title"
    :open="ui.dialogs.includes('clear')"
    @close="vm.closeDialog('clear')"
    @cancel="cancel('clear', $event)"
  >
    <div class="sheet-heading">
      <h2 id="clear-title">清空数据</h2>
    </div>
    <p class="muted small">
      将删除所有计划、草稿、投资记录、待确认记录及对话，无法撤销。AI 设置和 API
      Key 保留。
    </p>
    <form id="clear-form" class="config-form" @submit.prevent="vm.clear">
      <label
        >输入「清空」以确认<input
          id="clear-input"
          v-model="ui.clearInput"
          autocomplete="off"
          placeholder="清空"
          required /></label
      ><button
        id="clear-submit"
        class="danger-button"
        :disabled="ui.busy || ui.clearInput.trim() !== '清空'"
      >
        确认清空
      </button>
      <p id="clear-error" class="error" role="alert">{{ ui.errors.clear }}</p>
    </form>
  </Sheet>
</template>
