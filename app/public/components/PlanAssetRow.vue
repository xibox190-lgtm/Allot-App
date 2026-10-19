<script setup>
import { ref, watch } from "vue";
import { money } from "../modules/domain.mjs";
const props = defineProps([
  "assetId",
  "assetName",
  "amount",
  "month",
  "editable",
  "busy",
  "rename",
  "change",
]);
const name = ref(props.assetName),
  text = ref(money(props.amount));
watch(
  () => props.assetName,
  (value) => {
    name.value = value;
  },
);
watch(
  () => [props.amount, props.month],
  () => {
    text.value = money(props.amount);
  },
);
</script>
<template>
  <div class="draft-row">
    <input
      v-if="editable"
      v-model="name"
      class="asset-name-input"
      aria-label="标的名称"
      :disabled="busy"
      @change="rename(assetId, name)"
    />
    <span v-else>{{ assetName }}</span>
    <input
      v-model="text"
      inputmode="decimal"
      :aria-label="`${month} ${assetName}计划金额`"
      :disabled="!editable || busy"
      @change="change(assetId, text)"
    />
  </div>
</template>
