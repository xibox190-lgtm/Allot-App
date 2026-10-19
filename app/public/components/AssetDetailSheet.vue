<script setup>
import { computed, ref } from "vue";
import { money, monthSummary } from "../modules/domain.mjs";
import { lightHaptic } from "../modules/platform.mjs";
import Sheet from "./Sheet.vue";
import ProgressMeter from "./ProgressMeter.vue";

const props = defineProps(["vm", "cancel"]);
const { ui, state } = props.vm;
const assetId = ref(""), month = ref("");
const records = computed(() => state.value.records
  .filter(record => record.assetId === assetId.value && record.date.slice(0, 7) === month.value)
  .sort((a, b) => b.date.localeCompare(a.date)));
const item = computed(() => monthSummary(state.value, month.value)?.items
  .find(asset => asset.id === assetId.value));
function open(id) {
  if (ui.dialogs.length || !state.value.records.some(record =>
    record.assetId === id && record.date.slice(0, 7) === ui.month)) return;
  props.vm.hooks.resetMotion?.();
  assetId.value = id;
  month.value = ui.month;
  props.vm.openDialog("asset-detail");
}
defineExpose({ open });
</script>

<template>
  <Sheet
    id="asset-detail-dialog"
    label="asset-detail-title"
    :open="ui.dialogs.includes('asset-detail')"
    @opening="lightHaptic"
    @close="vm.closeDialog('asset-detail')"
    @cancel="cancel('asset-detail', $event)"
  >
    <template v-if="item">
      <div class="sheet-heading">
        <h2 id="asset-detail-title">{{ item.name }}</h2>
        <span class="muted small">{{ month.replace('-', '.') }}</span>
      </div>
      <div class="asset-detail-progress">
        <div class="amounts">
          <span>计划 <strong>{{ money(item.target) }}</strong> · 已投 {{ money(item.paid) }}</span>
          <span v-if="item.target === item.paid">完成</span>
          <span v-else>{{ item.target > item.paid ? '还差 ' : '超出 ' }}<b>{{ money(Math.abs(item.target - item.paid)) }}</b></span>
        </div>
        <ProgressMeter :paid="item.paid" :target="item.target" />
      </div>
      <div id="asset-detail-records">
        <div v-for="record in records" :key="record.id" class="calendar-record">
          <span>{{ record.date.replaceAll('-', '.') }}</span>
          <strong>+{{ money(record.amount) }}</strong>
        </div>
      </div>
    </template>
  </Sheet>
</template>
