<script setup>
import { computed } from "vue";
import { progress } from "../modules/domain.mjs";
const props = defineProps(["paid", "target"]);
const value = computed(() => progress(props.paid, props.target));
</script>

<template>
  <div class="meter" :class="{ over: value.over }">
    <div
      class="track"
      role="progressbar"
      aria-label="完成进度"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="value.width"
      :aria-valuetext="value.label"
    >
      <div class="fill" :style="{ width: `${value.width}%` }"></div>
    </div>
    <span class="percent">{{ value.label }}</span>
  </div>
</template>
