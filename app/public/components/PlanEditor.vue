<script setup>
import { computed, ref, watch } from "vue";
import { money } from "../modules/domain.mjs";
import PlanAssetRow from "./PlanAssetRow.vue";
const props = defineProps(["vm"]);
const { ui, state, plan } = props.vm;
const initialized = ref(false);
watch(
  () => ui.page === "plan" && ui.tab,
  (value) => {
    if (value) initialized.value = true;
  },
  { immediate: true },
);
const month = computed(
  () =>
    plan.value?.months[Math.min(ui.draftMonth, plan.value.months.length - 1)],
);
const total = computed(() =>
  month.value
    ? Object.values(month.value.targets).reduce((a, b) => a + b, 0)
    : 0,
);
</script>
<template>
  <section id="draft-pane" :inert="!ui.tab" :aria-hidden="!ui.tab">
    <div id="draft-content" v-if="initialized">
      <p v-if="!plan" class="muted small">先通过对话或手动创建计划。</p>
      <template v-else>
        <template v-if="!state.draft"
          ><p class="muted small">当前为已使用的计划。</p>
          <button class="text-button" :disabled="ui.busy" @click="vm.editDraft">
            手动调整
          </button></template
        >
        <div class="month-tabs">
          <button
            v-for="(row, index) in plan.months"
            :key="row.month"
            :aria-pressed="index === ui.draftMonth"
            @click="vm.pickDraftMonth(index)"
          >
            {{ row.month.replace("-", ".") }}
          </button>
        </div>
        <PlanAssetRow
          v-for="asset in plan.assets"
          :key="asset.id"
          :asset-id="asset.id"
          :asset-name="asset.name"
          :amount="month.targets[asset.id]"
          :month="month.month"
          :editable="Boolean(state.draft)"
          :busy="ui.busy"
          :rename="vm.renameAsset"
          :change="vm.changeAmount"
        />
        <div class="draft-total">
          <span class="muted small">合计</span
          ><strong>{{ money(total) }}</strong>
        </div>
        <p v-if="plan.notes" class="notes">{{ plan.notes }}</p>
        <template v-if="state.draft"
          ><button
            class="text-button"
            :disabled="ui.busy || ui.invalidDraft"
            @click="vm.addAsset"
          >
            ＋ 标的</button
          ><button
            class="text-button"
            style="margin-left: 24px"
            :disabled="ui.busy || ui.invalidDraft"
            @click="vm.addMonth"
          >
            ＋ 月份</button
          ><button
            id="use-draft"
            class="blue-button"
            :disabled="ui.busy || ui.invalidDraft"
            @click="vm.previewPlan"
          >
            使用计划
          </button></template
        >
      </template>
    </div>
  </section>
</template>
