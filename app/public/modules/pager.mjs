// Two adjacent panes share a track, keeping both visible during a horizontal drag.
export function installPager(viewport, track, onChange) {
  const cleanups = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };
  let selected = 0,
    gesture = null,
    animation = null,
    frame = 0,
    suppressClickUntil = 0;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  function stop() {
    const transform = getComputedStyle(track).transform;
    const offset =
      transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m41;
    animation?.cancel();
    animation = null;
    cancelAnimationFrame(frame);
    frame = 0;
    track.style.transform = `translate3d(${offset}px,0,0)`;
    return offset;
  }
  function reset() {
    animation?.cancel();
    animation = null;
    cancelAnimationFrame(frame);
    frame = 0;
    gesture = null;
    track.style.transform = "";
    track.style.setProperty("--pane-offset", selected ? "-50%" : "0%");
  }
  function select(index, animate = true, from) {
    const start = from ?? stop();
    const next = Math.max(0, Math.min(1, index));
    const changed = next !== selected;
    selected = next;
    track.style.setProperty("--pane-offset", selected ? "-50%" : "0%");
    if (changed) onChange(selected);
    if (!animate || reducedMotion.matches) {
      reset();
      return;
    }
    const current = track.animate(
      [
        { transform: `translate3d(${start}px,0,0)` },
        { transform: `translate3d(${-selected * viewport.clientWidth}px,0,0)` },
      ],
      {
        duration: 220,
        easing: "cubic-bezier(.22,.75,.25,1)",
        fill: "forwards",
      },
    );
    animation = current;
    current.finished.then(
      () => {
        if (animation === current) reset();
      },
      () => {},
    );
  }
  listen(viewport, "pointerdown", (event) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      event.target.closest("textarea,a,table,pre,.composer") ||
      (event.target.closest("input") &&
        event.target.closest("input") === document.activeElement) ||
      document.querySelector("dialog[open]")
    )
      return;
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      base: stop(),
      offset: 0,
      horizontal: false,
      sampleX: event.clientX,
      sampleTime: performance.now(),
      velocity: 0,
    };
  });
  listen(
    window,
    "pointermove",
    (event) => {
      const start = gesture;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x,
        dy = event.clientY - start.y;
      if (!start.horizontal) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.35) {
          gesture = null;
          select(selected, true, start.base);
          return;
        }
        start.horizontal = true;
        if (event.isTrusted) viewport.setPointerCapture(event.pointerId);
      }
      const now = performance.now(),
        elapsed = now - start.sampleTime;
      if (elapsed > 0)
        start.velocity = (event.clientX - start.sampleX) / elapsed;
      if (elapsed >= 40) {
        start.sampleX = event.clientX;
        start.sampleTime = now;
      }
      const raw = start.base + dx,
        width = viewport.clientWidth;
      start.offset =
        raw > 0
          ? raw * 0.22
          : raw < -width
            ? -width + (raw + width) * 0.22
            : raw;
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (gesture === start)
            track.style.transform = `translate3d(${start.offset}px,0,0)`;
        });
    },
    { passive: true },
  );
  function finish(event, cancelled = false) {
    const start = gesture;
    if (!start || event.pointerId !== start.id) return;
    if (start.horizontal) suppressClickUntil = performance.now() + 400;
    gesture = null;
    cancelAnimationFrame(frame);
    frame = 0;
    const dx = event.clientX - start.x;
    const velocity =
      performance.now() - start.sampleTime < 100 ? start.velocity : 0;
    const fast = Math.abs(dx) >= 24 && Math.abs(velocity) > 0.45;
    const travel =
      Math.abs(dx) >= Math.min(90, viewport.clientWidth * 0.2) || fast;
    const direction = (fast ? velocity : dx) < 0 ? 1 : -1;
    select(
      !cancelled && start.horizontal && travel
        ? selected + direction
        : selected,
      true,
      start.horizontal ? start.offset : start.base,
    );
  }
  listen(window, "pointerup", (event) => finish(event));
  listen(window, "pointercancel", (event) => finish(event, true));
  listen(
    viewport,
    "click",
    (event) => {
      if (performance.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  const observer = new ResizeObserver(reset);
  observer.observe(viewport);
  return {
    select,
    reset,
    destroy() {
      reset();
      observer.disconnect();
      cleanups.forEach((fn) => fn());
    },
  };
}
