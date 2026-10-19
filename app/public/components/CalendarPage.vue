<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from "vue";
import {
  calendarMonth,
  calendarDay,
  shiftCalendarMonth,
} from "../modules/calendar.mjs";
import { currentMonth, localDate, money } from "../modules/domain.mjs";
import Sheet from "./Sheet.vue";
const props = defineProps(["vm", "cancel"]);
const { ui, state } = props.vm;
const month = ref(currentMonth()),
  selected = ref(""),
  initialized = ref(false);
const grid = ref(null),
  viewport = ref(null);
const days = computed(() =>
  initialized.value ? calendarMonth(state.value, month.value) : [],
);
const detail = computed(() =>
  selected.value && ui.dialogs.includes("calendar-day")
    ? calendarDay(state.value, selected.value)
    : { records: [], total: 0 },
);
const title = computed(
  () => `${month.value.slice(0, 4)}年 ${Number(month.value.slice(5))}月`,
);
let moving = false,
  gesture = null,
  animations = [],
  outgoing = null,
  suppressClickUntil = 0;
const cleanups = [];
function listen(target, name, handler, options) {
  target.addEventListener(name, handler, options);
  cleanups.push(() => target.removeEventListener(name, handler, options));
}
function reset() {
  moving = false;
  gesture = null;
  animations.forEach((animation) => animation.cancel());
  animations = [];
  outgoing?.remove();
  outgoing = null;
  if (grid.value) grid.value.style.transform = "";
}
function open(value = currentMonth()) {
  reset();
  month.value = value;
  selected.value = "";
  initialized.value = true;
  viewport.value.scrollTop = 0;
}
function showDay(date) {
  selected.value = date;
  props.vm.openDialog("calendar-day");
}
async function move(direction, offset = 0) {
  if (moving || ui.dialogs.length) return;
  const next = shiftCalendarMonth(month.value, direction);
  moving = true;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (next === month.value || !direction) {
    const animation = grid.value.animate(
      [
        { transform: `translateX(${offset}px)` },
        { transform: "translateX(0)" },
      ],
      { duration: reduced ? 0 : 180 },
    );
    animations = [animation];
    try {
      await animation.finished;
    } catch {
      return;
    }
    reset();
    return;
  }
  const width = viewport.value.clientWidth;
  outgoing = grid.value.cloneNode(true);
  outgoing.removeAttribute("id");
  outgoing.inert = true;
  outgoing.setAttribute("aria-hidden", "true");
  outgoing.classList.add("calendar-outgoing");
  viewport.value.append(outgoing);
  month.value = next;
  selected.value = "";
  await nextTick();
  if (!moving || !outgoing) return;
  const timing = {
    duration: reduced ? 0 : 220,
    easing: "cubic-bezier(.22,.75,.25,1)",
    fill: "forwards",
  };
  animations = [
    outgoing.animate(
      [
        { transform: `translateX(${offset}px)` },
        { transform: `translateX(${-direction * width}px)` },
      ],
      timing,
    ),
    grid.value.animate(
      [
        { transform: `translateX(${offset + direction * width}px)` },
        { transform: "translateX(0)" },
      ],
      timing,
    ),
  ];
  try {
    await Promise.all(animations.map((animation) => animation.finished));
  } catch {
    return;
  }
  reset();
  ui.status = title.value;
}
function down(event) {
  if (moving || !event.isPrimary || event.button !== 0 || ui.dialogs.length)
    return;
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    offset: 0,
    horizontal: false,
  };
}
function pointerMove(event) {
  const start = gesture;
  if (!start || start.id !== event.pointerId) return;
  const dx = event.clientX - start.x,
    dy = event.clientY - start.y;
  if (!start.horizontal) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.35) {
      gesture = null;
      return;
    }
    start.horizontal = true;
    if (event.isTrusted) viewport.value.setPointerCapture(event.pointerId);
  }
  start.offset = dx;
  grid.value.style.transform = `translateX(${dx}px)`;
}
function finish(event, cancelled = false) {
  const start = gesture;
  if (!start || start.id !== event.pointerId) return;
  gesture = null;
  if (!start.horizontal) return;
  suppressClickUntil = performance.now() + 400;
  const travel =
    !cancelled &&
    Math.abs(start.offset) >= Math.min(70, viewport.value.clientWidth * 0.18);
  move(travel ? (start.offset < 0 ? 1 : -1) : 0, start.offset);
}
function click(event) {
  if (performance.now() < suppressClickUntil) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
function keyboard(event) {
  if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    move(event.key === "ArrowLeft" ? -1 : 1);
  }
}
function today() {
  reset();
  month.value = currentMonth();
  initialized.value = true;
  showDay(localDate());
}
onMounted(() => {
  listen(window, "pointermove", pointerMove, { passive: true });
  listen(window, "pointerup", (event) => finish(event));
  listen(window, "pointercancel", (event) => finish(event, true));
  listen(window, "resize", reset);
  props.vm.hooks.resetCalendar = reset;
});
onBeforeUnmount(() => {
  reset();
  cleanups.forEach((fn) => fn());
});
defineExpose({ open, reset });
</script>
<template>
  <section id="calendar-page" class="page" :hidden="ui.page !== 'calendar'">
    <header>
      <button
        id="calendar-back"
        class="icon-button"
        aria-label="返回本月计划"
        @click="vm.navigate('home')"
      >
        ‹</button
      ><button id="calendar-today" class="text-button" @click="today">
        今天
      </button>
    </header>
    <div class="calendar-navigation">
      <button
        id="calendar-prev"
        class="icon-button"
        aria-label="上个月"
        :disabled="shiftCalendarMonth(month, -1) === month"
        @click="move(-1)"
      >
        ‹
      </button>
      <h2 id="calendar-month" aria-live="polite">{{ title }}</h2>
      <button
        id="calendar-next"
        class="icon-button"
        aria-label="下个月"
        :disabled="shiftCalendarMonth(month, 1) === month"
        @click="move(1)"
      >
        ›
      </button>
    </div>
    <div class="calendar-weekdays" aria-hidden="true">
      <span
        v-for="day in ['日', '一', '二', '三', '四', '五', '六']"
        :key="day"
        >{{ day }}</span
      >
    </div>
    <div
      id="calendar-viewport"
      ref="viewport"
      @pointerdown="down"
      @click.capture="click"
      @keydown="keyboard"
    >
      <div
        id="calendar-grid"
        ref="grid"
        class="calendar-grid"
        role="group"
        :aria-label="`${title}投资记录`"
      >
        <button
          v-for="day in days"
          :key="day.date"
          type="button"
          class="calendar-day"
          :class="{
            outside: !day.inMonth,
            invested: day.total,
            today: day.date === localDate(),
          }"
          :disabled="!day.inMonth || !day.total"
          :data-date="day.date"
          :aria-label="`${day.date}${day.date === localDate() ? ' 今天' : ''}，${day.total ? `投入 ${money(day.total)} 元` : '无投资记录'}`"
          :aria-pressed="day.date === selected"
          :aria-current="day.date === localDate() ? 'date' : undefined"
          @click="showDay(day.date)"
        >
          <span class="calendar-number">{{ Number(day.date.slice(8)) }}</span
          ><span v-if="day.total" class="calendar-amount"
            >+{{ money(day.total) }}</span
          >
        </button>
      </div>
    </div>
  </section>
  <Sheet
    id="calendar-day-dialog"
    label="calendar-day-title"
    :open="ui.dialogs.includes('calendar-day')"
    @close="vm.closeDialog('calendar-day')"
    @cancel="cancel('calendar-day', $event)"
  >
    <div class="sheet-heading">
      <h2 id="calendar-day-title">{{ selected.replaceAll("-", ".") }}</h2>
    </div>
    <strong id="calendar-day-total" class="big-amount"
      >+{{ money(detail.total) }}</strong
    >
    <div id="calendar-day-records">
      <div
        v-for="record in detail.records"
        :key="record.id"
        class="calendar-record"
      >
        <span>{{ record.assetName }}</span
        ><strong>+{{ money(record.amount) }}</strong>
      </div>
    </div>
    <p
      id="calendar-day-empty"
      class="muted small"
      :hidden="detail.records.length > 0"
    >
      当天没有投资记录
    </p>
  </Sheet>
</template>
