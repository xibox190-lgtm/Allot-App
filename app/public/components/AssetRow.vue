<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { money } from "../modules/domain.mjs";
import ProgressMeter from "./ProgressMeter.vue";

const props = defineProps(["item", "month", "current", "selected", "select", "details"]);
const pressing = ref(false);
let timer, gesture = null, consumed = false;
function reset() {
  clearTimeout(timer);
  gesture = null;
  pressing.value = false;
}
function down(event) {
  reset();
  consumed = false;
  if (!event.isPrimary || event.button !== 0) return;
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
  pressing.value = props.item.paid > 0;
  timer = setTimeout(() => {
    consumed = true;
    reset();
    if (props.item.paid > 0) props.details(props.item.id);
  }, 450);
}
function move(event) {
  if (gesture?.id !== event.pointerId) return;
  if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= 8)
    reset();
}
function finish(event) {
  if (gesture?.id === event.pointerId) reset();
}
function click(event) {
  if (consumed) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (props.current) props.select(props.item.id);
}
watch(() => [props.month, props.item.id, props.item.paid], reset);
onMounted(() => {
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
  window.addEventListener("blur", reset);
  window.addEventListener("scroll", reset, true);
});
onBeforeUnmount(() => {
  reset();
  window.removeEventListener("pointermove", move);
  window.removeEventListener("pointerup", finish);
  window.removeEventListener("pointercancel", finish);
  window.removeEventListener("blur", reset);
  window.removeEventListener("scroll", reset, true);
});
</script>

<template>
  <section
    class="item"
    :class="{ 'item-pressing': pressing }"
    :data-asset-id="item.id"
    :tabindex="current ? 0 : undefined"
    :role="current ? 'button' : undefined"
    :aria-label="current ? `选择${item.name}` : undefined"
    :aria-pressed="current ? selected : undefined"
    @pointerdown="down"
    @contextmenu.prevent
    @click="click"
    @keydown.enter.prevent="current && select(item.id)"
    @keydown.space.prevent="current && select(item.id)"
  >
    <h2>{{ item.name }}</h2>
    <div class="amounts">
      <span
        >计划 <strong>{{ money(item.target) }}</strong> · 已投
        {{ money(item.paid) }}</span
      >
      <span v-if="item.target === item.paid">完成</span>
      <span v-else>
        {{ item.target > item.paid ? "还差 " : "超出 "
        }}<b>{{ money(Math.abs(item.target - item.paid)) }}</b>
      </span>
    </div>
    <ProgressMeter :paid="item.paid" :target="item.target" />
  </section>
</template>
