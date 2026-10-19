import { nextTick } from "vue";
import { adjacentMonth } from "./domain.mjs";

// Only pointer geometry and transient animation snapshots touch the DOM here.
export function installMonthMotion({ getPlan, getMonth, setMonth, announce }) {
  const $ = (id) => document.getElementById(id);
  let swipeStart = null,
    suppressClickUntil = 0,
    monthAnimation = null;
  let monthMoving = false,
    dragFrame = 0,
    outgoingMonth = null,
    outgoingAnimation = null;
  const cleanups = [];
  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  }
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  function resetMonthMotion() {
    cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    swipeStart = null;
    monthMoving = false;
    monthAnimation?.cancel();
    monthAnimation = null;
    outgoingAnimation?.cancel();
    outgoingAnimation = null;
    outgoingMonth?.remove();
    outgoingMonth = null;
    $("month-content").style.transform = "";
    $("month-content").classList.remove("moving");
  }
  function takeOverMonthMotion() {
    const transform = getComputedStyle($("month-content")).transform;
    const offset =
      transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m41;
    resetMonthMotion();
    $("month-content").style.transform = `translate3d(${offset}px,0,0)`;
    return offset;
  }
  async function animateMonth(from, to, duration) {
    const animation = $("month-content").animate(
      [
        { transform: `translate3d(${from}px,0,0)` },
        { transform: `translate3d(${to}px,0,0)` },
      ],
      {
        duration: reducedMotion.matches ? 0 : duration,
        easing: "cubic-bezier(.22,.75,.25,1)",
        fill: "forwards",
      },
    );
    monthAnimation = animation;
    try {
      await animation.finished;
    } catch {
      return false;
    }
    return monthAnimation === animation;
  }
  async function moveMonth(direction, offset = 0) {
    if (document.querySelector("dialog[open]")) {
      resetMonthMotion();
      return;
    }
    if (monthMoving) offset = takeOverMonthMotion();
    cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    const next = adjacentMonth(getPlan(), getMonth(), direction);
    monthMoving = true;
    $("month-content").classList.add("moving");
    if (next === getMonth() || !direction) {
      if (await animateMonth(offset, 0, 180)) resetMonthMotion();
      return;
    }
    const width = $("month-viewport").clientWidth;
    const oldContent = $("month-content").cloneNode(true);
    const oldHeight = $("month-content").clientHeight;
    const oldScroll = $("items").scrollTop;
    const oldItems = oldContent.querySelector("#items");
    oldContent.removeAttribute("id");
    oldContent
      .querySelectorAll("[id]")
      .forEach((el) => el.removeAttribute("id"));
    oldContent.className = "month-outgoing";
    oldContent.inert = true;
    oldContent.setAttribute("aria-hidden", "true");
    oldContent.style.height = `${oldHeight}px`;
    setMonth(next);
    $("items").scrollTop = 0;
    resetMonthMotion();
    await nextTick();
    outgoingMonth = oldContent;
    $("month-viewport").append(oldContent);
    oldItems.scrollTop = oldScroll;
    monthMoving = true;
    $("month-content").classList.add("moving");
    const duration = 220;
    outgoingAnimation = oldContent.animate(
      [
        { transform: `translate3d(${offset}px,0,0)` },
        { transform: `translate3d(${-direction * width}px,0,0)` },
      ],
      {
        duration: reducedMotion.matches ? 0 : duration,
        easing: "cubic-bezier(.22,.75,.25,1)",
        fill: "forwards",
      },
    );
    if (!(await animateMonth(offset + direction * width, 0, duration))) return;
    resetMonthMotion();
    announce(`${getMonth().replace("-", "年")}月计划`);
  }
  listen($("home"), "pointerdown", (event) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      event.target.closest("button,input,textarea,.header-right") ||
      document.querySelector("dialog[open]")
    )
      return;
    const baseOffset = monthMoving ? takeOverMonthMotion() : 0;
    swipeStart = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      horizontal: false,
      offset: 0,
      baseOffset,
      sampleX: event.clientX,
      sampleTime: performance.now(),
      velocity: 0,
      hasNext: adjacentMonth(getPlan(), getMonth(), 1) !== getMonth(),
      hasPrevious: adjacentMonth(getPlan(), getMonth(), -1) !== getMonth(),
    };
  });
  listen(
    window,
    "pointermove",
    (event) => {
      const start = swipeStart;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x,
        dy = event.clientY - start.y;
      if (!start.horizontal) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.35) {
          swipeStart = null;
          if (start.baseOffset) moveMonth(0, start.baseOffset);
          return;
        }
        if (event.isTrusted) $("home").setPointerCapture(event.pointerId);
        start.horizontal = true;
        $("month-content").classList.add("moving");
      }
      const now = performance.now(),
        elapsed = now - start.sampleTime;
      if (elapsed > 0)
        start.velocity = (event.clientX - start.sampleX) / elapsed;
      if (elapsed >= 40) {
        start.sampleX = event.clientX;
        start.sampleTime = now;
      }
      const atEdge = dx < 0 ? !start.hasNext : !start.hasPrevious;
      start.offset = start.baseOffset + dx * (atEdge ? 0.22 : 1);
      if (!dragFrame)
        dragFrame = requestAnimationFrame(() => {
          dragFrame = 0;
          if (swipeStart === start)
            $("month-content").style.transform =
              `translate3d(${start.offset}px,0,0)`;
        });
    },
    { passive: true },
  );
  listen(window, "pointerup", (event) => {
    if (!swipeStart || swipeStart.id !== event.pointerId) return;
    const start = swipeStart;
    swipeStart = null;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    const horizontal =
      start.horizontal ||
      (Math.abs(dx) >= 48 && Math.abs(dx) >= Math.abs(dy) * 1.35);
    if (!horizontal) {
      if (start.baseOffset) moveMonth(0, start.baseOffset);
      return;
    }
    const threshold = Math.min(90, $("month-viewport").clientWidth * 0.2);
    const velocity =
      performance.now() - start.sampleTime < 100 ? start.velocity : 0;
    const fast = Math.abs(dx) >= 24 && Math.abs(velocity) > 0.45;
    suppressClickUntil = performance.now() + 400;
    const intent = fast ? velocity : dx;
    moveMonth(
      Math.abs(dx) >= threshold || fast ? (intent < 0 ? 1 : -1) : 0,
      start.horizontal ? start.offset : start.baseOffset,
    );
  });
  listen(window, "pointercancel", (event) => {
    if (!swipeStart || swipeStart.id !== event.pointerId) return;
    const offset = swipeStart.horizontal
      ? swipeStart.offset
      : swipeStart.baseOffset;
    swipeStart = null;
    if (offset) moveMonth(0, offset);
  });
  listen(
    $("home"),
    "click",
    (event) => {
      if (performance.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  listen($("home"), "keydown", (event) => {
    if (
      !event.target.closest("button,input,textarea") &&
      ["ArrowLeft", "ArrowRight"].includes(event.key)
    ) {
      event.preventDefault();
      moveMonth(event.key === "ArrowLeft" ? -1 : 1);
    }
  });

  return {
    reset: resetMonthMotion,
    move: moveMonth,
    destroy() {
      resetMonthMotion();
      cleanups.forEach((fn) => fn());
    },
  };
}
