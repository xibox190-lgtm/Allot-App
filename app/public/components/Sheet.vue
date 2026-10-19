<script setup>
import { ref, watch, onMounted, onBeforeUnmount, provide } from "vue";

const props = defineProps(["id", "label", "open"]);
const emit = defineEmits(["close", "cancel", "opening"]);
const dialog = ref(null),
  body = ref(null),
  grip = ref(null);
const expanded = ref(false),
  phase = ref("closed");
let animation = null,
  generation = 0,
  gesture = null,
  ignoreClickUntil = 0;
let maxHeight = 0,
  collapsedHeight = 0,
  observer;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function bounds() {
  const viewport = globalThis.visualViewport;
  const height = viewport?.height || innerHeight;
  const viewportLimit = Math.floor(height * 0.92);
  dialog.value.style.setProperty("--sheet-limit", `${viewportLimit}px`);
  dialog.value.style.setProperty(
    "--sheet-bottom",
    `${Math.max(0, innerHeight - height - (viewport?.offsetTop || 0))}px`,
  );
  const content = body.value;
  maxHeight = Math.min(
    viewportLimit,
    Math.ceil(
      content.getBoundingClientRect().height +
        grip.value.getBoundingClientRect().height,
    ),
  );
  // Short drawers stop at their content. Long drawers have two useful heights
  // and scroll internally once the available screen height is exhausted.
  collapsedHeight = Math.min(maxHeight, Math.floor(height * 0.62));
  return collapsedHeight;
}
function stop() {
  generation++;
  animation?.cancel();
  animation = null;
}
async function animate(frames, duration = 380) {
  stop();
  const token = generation;
  const current = dialog.value.animate(frames, {
    duration: reduced() ? 0 : duration,
    easing: "cubic-bezier(.22,.75,.25,1)",
    fill: "both",
  });
  animation = current;
  try {
    await current.finished;
  } catch {
    return false;
  }
  if (token !== generation) return false;
  animation = null;
  current.cancel();
  return true;
}
async function sync() {
  const el = dialog.value;
  if (!el) return;
  gesture = null;
  if (props.open) {
    const wasOpen = el.open;
    const previous = wasOpen ? getComputedStyle(el).transform : null;
    stop();
    expanded.value = false;
    el.style.height = "";
    el.style.transform = "";
    // A closing sheet remains visible as a non-modal dialog during its exit.
    if (el.open && !el.matches(":modal")) el.close();
    el.inert = false;
    if (!el.open) el.showModal();
    phase.value = "opening";
    bounds();
    el.style.height = `${collapsedHeight}px`;
    const from =
      previous && previous !== "none"
        ? previous
        : `translateY(${el.getBoundingClientRect().height + 24}px)`;
    const entrance = animate([{ transform: from }, { transform: "translateY(0)" }]);
    emit("opening");
    if (await entrance)
      phase.value = "open";
  } else if (el.open) {
    const from = getComputedStyle(el).transform;
    phase.value = "closing";
    // Release the background immediately so a new press can start while the
    // sheet animates out. Keep only a non-interactive visual until it finishes.
    el.close();
    el.show();
    el.inert = true;
    if (
      await animate(
        [
          { transform: from === "none" ? "translateY(0)" : from },
          {
            transform: `translateY(${el.getBoundingClientRect().height + 24}px)`,
          },
        ],
        700,
      )
    ) {
      if (!props.open) {
        el.close();
        el.style.height = "";
        el.style.transform = "";
        expanded.value = false;
        phase.value = "closed";
      }
    }
  }
}
watch(() => props.open, sync, { flush: "post" });

function dismiss(source) {
  if (!props.open || phase.value === "closing") return false;
  const event = new Event("cancel", { cancelable: true });
  event.sheetDismiss = source;
  emit("cancel", event);
  if (!event.defaultPrevented) {
    emit("close");
    return true;
  }
  return false;
}
function nativeCancel(event) {
  event.preventDefault(); // Let Vue close after the exit animation, not immediately.
  dismiss("escape");
}
function nativeClose() {
  // close() also queues an event when switching modal modes or reopening.
  if (props.open && !dialog.value.open) emit("close");
}
function backdrop(event) {
  if (event.target !== dialog.value || performance.now() < ignoreClickUntil)
    return;
  const rect = dialog.value.getBoundingClientRect();
  if (
    event.clientY < rect.top ||
    event.clientY > rect.bottom ||
    event.clientX < rect.left ||
    event.clientX > rect.right
  )
    dismiss("backdrop");
}
async function snap(target) {
  if (!props.open) return;
  bounds();
  const el = dialog.value,
    height = el.getBoundingClientRect().height;
  const from = getComputedStyle(el).transform;
  stop();
  expanded.value = target && maxHeight > collapsedHeight + 1;
  const to = expanded.value ? maxHeight : collapsedHeight;
  el.style.height = `${to}px`;
  el.style.transform = "";
  phase.value = "settling";
  if (
    await animate([
      {
        height: `${height}px`,
        transform: from === "none" ? "translateY(0)" : from,
      },
      { height: `${to}px`, transform: "translateY(0)" },
    ])
  ) {
    el.style.height = `${expanded.value ? maxHeight : collapsedHeight}px`;
    phase.value = "open";
  }
}
function down(event) {
  if (
    !props.open ||
    phase.value === "closing" ||
    !event.isPrimary ||
    event.button !== 0
  )
    return;
  const el = dialog.value;
  const height = el.getBoundingClientRect().height;
  const matrix = getComputedStyle(el).transform;
  const offset = matrix === "none" ? 0 : new DOMMatrixReadOnly(matrix).m42;
  stop();
  bounds();
  el.style.height = `${height}px`;
  el.style.transform = `translateY(${offset}px)`;
  gesture = {
    id: event.pointerId,
    y: event.clientY,
    lastY: event.clientY,
    lastTime: performance.now(),
    velocity: 0,
    height,
    offset,
    moved: false,
    expanded: expanded.value,
  };
  if (event.isTrusted) grip.value.setPointerCapture(event.pointerId);
}
function move(event) {
  const start = gesture;
  if (!start || event.pointerId !== start.id) return;
  const dy = event.clientY - start.y;
  if (Math.abs(dy) > 5) start.moved = true;
  if (!start.moved) return;
  phase.value = "dragging";
  const now = performance.now(),
    elapsed = now - start.lastTime;
  if (elapsed >= 12) {
    start.velocity = (event.clientY - start.lastY) / elapsed;
    start.lastY = event.clientY;
    start.lastTime = now;
  }
  const desired = start.height - dy;
  const height = Math.min(maxHeight, Math.max(collapsedHeight, desired));
  const offset = Math.max(0, collapsedHeight - desired) + start.offset;
  dialog.value.style.height = `${height}px`;
  dialog.value.style.transform = `translateY(${offset}px)`;
}
function finish(event, cancelled = false) {
  const start = gesture;
  if (!start || start.id !== event.pointerId) return;
  move(event);
  gesture = null;
  if (!start.moved) {
    snap(start.expanded);
    return;
  }
  ignoreClickUntil = performance.now() + 400;
  if (cancelled) {
    snap(start.expanded);
    return;
  }
  const dy = event.clientY - start.y;
  const height = dialog.value.getBoundingClientRect().height;
  const offset =
    Math.max(0, collapsedHeight - (start.height - dy)) + start.offset;
  const velocity =
    performance.now() - start.lastTime < 100 ? start.velocity : 0;
  if (
    offset > Math.min(100, Math.max(56, collapsedHeight * 0.22)) ||
    (velocity > 0.65 && dy > 24 && height <= collapsedHeight + 16)
  ) {
    if (!dismiss("drag")) snap(start.expanded);
  } else if (dy < -36 || velocity < -0.5) snap(true);
  else if (dy > 36 || velocity > 0.5) snap(false);
  else snap(height > (collapsedHeight + maxHeight) / 2);
}
function toggle() {
  if (performance.now() >= ignoreClickUntil) snap(!expanded.value);
}
function keydown(event) {
  if (event.key === "ArrowUp") {
    event.preventDefault();
    snap(true);
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (expanded.value) snap(false);
    else dismiss("drag");
  }
}
function resize() {
  if (!dialog.value?.open || phase.value === "closing") return;
  bounds();
  if (!gesture) {
    if (maxHeight <= collapsedHeight + 1) expanded.value = false;
    dialog.value.style.height = `${expanded.value ? maxHeight : collapsedHeight}px`;
  }
}
// Programmatic completion (e.g. saving a purchase) uses the same animated exit.
provide("allot-sheet", {
  close: () => emit("close"),
});
onMounted(() => {
  observer = new ResizeObserver(resize);
  observer.observe(body.value);
  window.addEventListener("resize", resize);
  globalThis.visualViewport?.addEventListener("resize", resize);
  globalThis.visualViewport?.addEventListener("scroll", resize);
  sync();
});
onBeforeUnmount(() => {
  stop();
  observer?.disconnect();
  window.removeEventListener("resize", resize);
  globalThis.visualViewport?.removeEventListener("resize", resize);
  globalThis.visualViewport?.removeEventListener("scroll", resize);
});
</script>

<template>
  <dialog
    :id="id"
    ref="dialog"
    class="sheet"
    :data-phase="phase"
    :data-expanded="expanded"
    :aria-labelledby="label"
    @cancel="nativeCancel"
    @click="backdrop"
    @close="nativeClose"
  >
    <button
      ref="grip"
      type="button"
      class="sheet-grip"
      :aria-expanded="expanded"
      :aria-label="
        expanded ? '收起抽屉，向下拖动可关闭' : '展开抽屉，向下拖动可关闭'
      "
      title="上下拖动调整高度，下拉关闭"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="finish"
      @pointercancel="finish($event, true)"
      @lostpointercapture="gesture && finish($event, true)"
      @click="toggle"
      @keydown="keydown"
    >
      <span class="handle" aria-hidden="true"></span>
    </button>
    <div class="sheet-content">
      <div ref="body" class="sheet-body"><slot /></div>
    </div>
  </dialog>
  <Teleport to="body">
    <div v-if="phase === 'closing'" class="sheet-exit-mask" aria-hidden="true"></div>
  </Teleport>
</template>
