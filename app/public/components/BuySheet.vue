<script setup>
import { ref, shallowRef, computed, nextTick, inject } from "vue";
import { money, toCents, currentMonth } from "../modules/domain.mjs";
import ProgressMeter from "./ProgressMeter.vue";
const props = defineProps(["getContext", "select", "save"]);
const sheet = inject("allot-sheet");
const context = shallowRef({ items: [], selected: "", revision: 0 });
const item = computed(() =>
  context.value.items.find((asset) => asset.id === context.value.selected),
);
const amount = ref("");
const pending = ref(null);
const error = ref("");
const expanded = ref(false);
function open() {
  context.value = props.getContext();
  pending.value = null;
  error.value = "";
  expanded.value = false;
}
function choose(id) {
  props.select(id);
  context.value = props.getContext();
  expanded.value = false;
  nextTick(() =>
    document.getElementById("picker-trigger").focus({ preventScroll: true }),
  );
}
function preview() {
  try {
    const cents = toCents(amount.value);
    if (cents <= 0) throw new Error("请输入大于 0 的金额");
    const latest = props.getContext();
    const asset = latest.items.find(
      (asset) => asset.id === context.value.selected,
    );
    if (!asset) throw new Error("该标的不在本月计划中");
    pending.value = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      name: asset.name,
      amount: cents,
      revision: latest.revision,
      date: currentMonth(),
    };
    expanded.value = false;
    error.value = "";
    nextTick(() => document.getElementById("return-buy").focus());
  } catch (e) {
    error.value = e.message;
  }
}
function back() {
  pending.value = null;
  nextTick(() => document.getElementById("buy-amount").focus());
}
function commit() {
  if (!pending.value) return;
  try {
    props.save(pending.value);
    pending.value = null;
    amount.value = "";
    sheet.close();
  } catch (e) {
    error.value = e.message;
  }
}
function cancel(event) {
  if (pending.value) {
    event.preventDefault();
    back();
  } else if (expanded.value) {
    event.preventDefault();
    expanded.value = false;
  }
}
function keyboard(event) {
  if (["ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    expanded.value = true;
    nextTick(() => document.querySelector("#picker-options button")?.focus());
  }
}
defineExpose({
  open,
  back,
  cancel,
  hasPending: () => Boolean(pending.value),
  closePicker: () => {
    expanded.value = false;
  },
  reset: () => {
    pending.value = null;
    amount.value = "";
  },
});
</script>

<template>
  <div class="sheet-heading">
    <h2 id="buy-title">{{ pending ? "确认买入" : "记一笔" }}</h2>
  </div>
  <div id="buy-edit" :hidden="Boolean(pending)">
    <div id="buy-plan" v-if="item">
      <div class="buy-plan-values">
        <div
          v-for="[label, value] in [
            ['计划', item.target],
            ['已投', item.paid],
          ]"
          :key="label"
        >
          <span class="total-label">{{ label }}</span
          ><strong>{{ money(value) }}</strong>
        </div>
      </div>
      <ProgressMeter :paid="item.paid" :target="item.target" />
    </div>
    <form id="buy-form" class="buy-fields" @submit.prevent="preview">
      <div
        id="picker"
        class="picker"
        :class="{ expanded }"
        :style="{
          '--options-height': `${Math.min(260, context.items.length * 47 + 16)}px`,
        }"
      >
        <div class="picker-surface">
          <button
            id="picker-trigger"
            type="button"
            :aria-expanded="expanded"
            aria-controls="picker-options"
            @click="expanded = !expanded"
            @keydown="keyboard"
          >
            <span id="selected-name">{{ item?.name }}</span
            ><i class="chevron" aria-hidden="true"></i>
          </button>
          <div
            id="picker-options"
            role="group"
            aria-label="选择标的"
            :hidden="!expanded"
          >
            <button
              v-for="asset in context.items"
              :key="asset.id"
              type="button"
              :aria-pressed="asset.id === context.selected"
              @click="choose(asset.id)"
            >
              {{ asset.name }}
            </button>
          </div>
        </div>
      </div>
      <input
        id="buy-amount"
        v-model="amount"
        inputmode="decimal"
        autocomplete="off"
        placeholder="0.00"
        aria-label="买入金额"
      />
      <button class="circle-button check-button" aria-label="确认买入">
        <i class="check" aria-hidden="true"></i>
      </button>
    </form>
  </div>
  <div id="buy-confirm" :hidden="!pending">
    <p id="confirm-name" class="muted">{{ pending?.name }}</p>
    <strong id="confirm-amount" class="big-amount">{{
      pending ? money(pending.amount) : ""
    }}</strong>
    <div class="two-actions">
      <button id="return-buy" @click="back">返回修改</button
      ><button id="save-buy" class="blue-button" @click="commit">
        确认保存
      </button>
    </div>
  </div>
  <p id="buy-error" class="error" role="alert">{{ error }}</p>
</template>
