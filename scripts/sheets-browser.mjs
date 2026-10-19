const frame = document.getElementById("subject");
const tick = () => Promise.resolve().then(() => Promise.resolve());
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const get = (id) => frame.contentDocument.getElementById(id);
const win = () => frame.contentWindow;
const results = [];
function assert(value, message) {
  if (!value) throw new Error(message);
  results.push(message);
}
async function until(condition, message = "UI did not settle") {
  const deadline = performance.now() + 5000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error(message);
    await pause(10);
  }
}
async function settled(id) {
  await until(
    () => get(id)?.open && get(id).dataset.phase === "open",
    id + " did not open",
  );
}
async function closed(id) {
  await until(() => !get(id).open, id + " did not close");
}
async function load(fixture) {
  frame.src = "about:blank";
  await new Promise((resolve) => (frame.onload = resolve));
  localStorage.setItem("allot.state.v1", JSON.stringify(fixture));
  frame.src = "/app/";
  await new Promise((resolve) => (frame.onload = resolve));
  await until(() => win().performance.getEntriesByName("allot-ready").length);
}
async function menu(id) {
  get("more").click();
  await tick();
  get(id).click();
  await tick();
}
function backdrop(id) {
  const rect = get(id).getBoundingClientRect();
  get(id).dispatchEvent(
    new (win().MouseEvent)("click", {
      bubbles: true,
      clientX: 190,
      clientY: Math.max(1, rect.top - 10),
    }),
  );
}
function pointer(target, type, y) {
  target.dispatchEvent(
    new (win().PointerEvent)(type, {
      bubbles: true,
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX: 190,
      clientY: y,
    }),
  );
}
async function drag(id, distance, cancel = false) {
  const sheet = get(id),
    grip = sheet.querySelector(".sheet-grip");
  const before = sheet.getBoundingClientRect();
  const y = before.top + 18;
  pointer(grip, "pointerdown", y);
  for (let step = 1; step <= 8; step++) {
    pointer(grip, "pointermove", y + (distance * step) / 8);
    await pause(16);
  }
  const moving = sheet.getBoundingClientRect();
  pointer(grip, cancel ? "pointercancel" : "pointerup", y + distance);
  await tick();
  return { before, moving };
}
function edit(id, value) {
  const el = get(id);
  el.value = value;
  el.dispatchEvent(new (win().Event)("input", { bubbles: true }));
}
const saved = () => JSON.parse(localStorage.getItem("allot.state.v1"));
async function checkSheet(id, open) {
  await open();
  await tick();
  await until(() => get(id).open);
  assert(
    get(id).dataset.phase === "opening" && get(id).getAnimations().length > 0,
    id + ": animated entrance",
  );
  await settled(id);
  assert(
    get(id).querySelectorAll(".sheet-grip").length === 1 &&
      !get(id).querySelector('[id^="close-"]'),
    id + ": one shared grip and no X",
  );
  const content = get(id).querySelector(".sheet-body");
  const limit = Math.min(
    Math.floor(win().innerHeight * 0.92),
    Math.ceil(
      content.getBoundingClientRect().height +
        get(id).querySelector(".sheet-grip").getBoundingClientRect().height,
    ),
  );
  const { before, moving } = await drag(id, -1000);
  const canExpand = limit > before.height + 1;
  assert(
    Math.abs(moving.height - limit) < 2,
    id + ": upward drag stops at content or viewport limit",
  );
  await settled(id);
  assert(
    Math.abs(get(id).getBoundingClientRect().height - limit) < 2,
    id + ": no blank expansion beyond content",
  );
  if (canExpand) {
    const area = get(id).querySelector(".sheet-content");
    area.scrollTop = area.scrollHeight;
    assert(
      area.scrollTop > 0,
      id + ": expanded long records remain scrollable",
    );
    area.scrollTop = 0;
  }
  pointer(content, "pointerdown", get(id).getBoundingClientRect().top + 90);
  pointer(content, "pointermove", get(id).getBoundingClientRect().top + 150);
  pointer(content, "pointerup", get(id).getBoundingClientRect().top + 150);
  await tick();
  assert(
    get(id).dataset.phase === "open",
    id + ": content scrolling does not drag sheet",
  );
  if (canExpand) {
    await drag(id, 130);
    await settled(id);
  }
  assert(
    get(id).dataset.expanded === "false" &&
      Math.abs(get(id).getBoundingClientRect().height - before.height) < 2,
    id + ": downward drag collapses",
  );
  await drag(id, 12);
  await settled(id);
  assert(get(id).open, id + ": short drag bounces back");
  await drag(id, -80, true);
  await settled(id);
  assert(
    get(id).dataset.expanded === "false",
    id + ": cancelled gesture returns safely",
  );
  await drag(id, 140);
  assert(
    get(id).open && get(id).dataset.phase === "closing",
    id + ": downward dismissal animates before native close",
  );
  await closed(id);
  await open();
  await settled(id);
  backdrop(id);
  await tick();
  assert(
    get(id).open && get(id).dataset.phase === "closing",
    id + ": backdrop uses exit animation",
  );
  await closed(id);
}
async function run() {
  const fixture = await (await fetch("/fixture")).json();
  const detailFixture = structuredClone(fixture);
  const thisMonth = fixture.plan.months[0].month;
  const previous = new Date(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5)) - 2, 1);
  const previousMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
  detailFixture.plan.months.push({ month: previousMonth, targets: { gold: 5000, index: 5000 } });
  detailFixture.records.push(
    { id: "earlier_gold", assetId: "gold", assetName: "黄金", date: `${thisMonth}-01`, amount: 250 },
    { id: "previous_gold", assetId: "gold", assetName: "黄金", date: `${previousMonth}-01`, amount: 900 },
    { id: "previous_index", assetId: "index", assetName: "A500", date: `${previousMonth}-01`, amount: 1200 },
  );
  await load(detailFixture);
  const haptics = [];
  win().AllotNative = { lightHaptic() {
    haptics.push({ open: get("asset-detail-dialog").open, animating: get("asset-detail-dialog").getAnimations().length > 0 });
  } };
  const row = id => frame.contentDocument.querySelector(`[data-asset-id="${id}"]`);
  async function hold(id) {
    pointer(row(id), "pointerdown", 220);
    await pause(470);
    pointer(row(id), "pointerup", 220);
  }
  row("index").click();
  await tick();
  assert(row("index").getAttribute("aria-pressed") === "true", "single click still selects an asset");
  row("gold").click();
  await tick();
  await hold("index");
  row("index").click();
  await tick();
  assert(!get("asset-detail-dialog").open && !row("index").classList.contains("item-pressing") && row("gold").getAttribute("aria-pressed") === "true", "no current-month records means no long-press response, even with historical records");
  pointer(row("index"), "pointerdown", 220);
  pointer(row("index"), "pointerup", 220);
  row("index").click();
  await tick();
  pointer(row("gold"), "pointerdown", 220);
  pointer(row("gold"), "pointerup", 220);
  await pause(470);
  assert(!get("asset-detail-dialog").open, "short press does not open asset details");
  pointer(row("gold"), "pointerdown", 220);
  pointer(row("gold"), "pointermove", 235);
  await pause(470);
  pointer(row("gold"), "pointerup", 235);
  assert(!get("asset-detail-dialog").open, "scroll movement cancels long press");
  pointer(row("gold"), "pointerdown", 220);
  pointer(row("gold"), "pointercancel", 220);
  await pause(470);
  assert(!get("asset-detail-dialog").open, "cancelled touch does not open asset details");
  assert(!haptics.length, "empty assets, short presses and cancelled gestures never trigger haptics");
  await checkSheet("asset-detail-dialog", async () => {
    const previousHaptics = haptics.length;
    await hold("gold");
    assert(haptics.length === previousHaptics + 1 && haptics.at(-1).open && haptics.at(-1).animating, "one haptic fires only after the native drawer is open and its entrance has started");
    row("gold").click();
    assert(row("index").getAttribute("aria-pressed") === "true", "long press does not also select an asset");
    assert(get("asset-detail-records").children.length === 21, "asset drawer keeps individual purchases and filters by asset and month");
    const dates = [...get("asset-detail-records").children].map(el => el.firstElementChild.textContent);
    assert(dates.every((date, index) => !index || dates[index - 1] >= date), "asset records appear newest first");
    assert(get("asset-detail-dialog").querySelector('[role="progressbar"]').getAttribute("aria-valuetext") === "1%", "asset drawer shows the matching monthly progress");
  });
  // Swipe to the previous month, then open the asset that had no records this month.
  const home = get("home");
  pointer(home, "pointerdown", 220);
  home.dispatchEvent(new (win().PointerEvent)("pointermove", { bubbles: true, pointerId: 7, pointerType: "touch", isPrimary: true, button: 0, clientX: 350, clientY: 220 }));
  home.dispatchEvent(new (win().PointerEvent)("pointerup", { bubbles: true, pointerId: 7, pointerType: "touch", isPrimary: true, button: 0, clientX: 350, clientY: 220 }));
  await until(() => get("date").textContent === previousMonth.replace("-", "."));
  await pause(300);
  await hold("index");
  await settled("asset-detail-dialog");
  assert(get("asset-detail-title").textContent === "A500" && get("asset-detail-records").children.length === 1 && get("asset-detail-records").querySelector("strong").textContent === "+12", "historical month long press shows that month's asset records");
  backdrop("asset-detail-dialog");
  await tick();
  await pause(30);
  assert(get("asset-detail-dialog").open && !get("asset-detail-dialog").matches(":modal"), "closing drawer keeps its exit animation while releasing the modal touch barrier");
  const goldBounds = row("gold").getBoundingClientRect();
  const hit = frame.contentDocument.elementFromPoint(190, goldBounds.top + 25);
  assert(hit?.closest('[data-asset-id="gold"]') === row("gold"), "a press during drawer dismissal reaches the underlying asset");
  pointer(hit, "pointerdown", goldBounds.top + 25);
  await pause(470);
  pointer(hit, "pointerup", goldBounds.top + 25);
  await settled("asset-detail-dialog");
  assert(get("asset-detail-title").textContent === "黄金", "the first long press during dismissal opens the next asset without lifting and retrying");
  win().allotBack();
  await closed("asset-detail-dialog");
  assert(!win().__errors.length, "asset details produce no browser errors");
  await load(fixture);
  await checkSheet("buy-dialog", () => get("buy").click());
  assert(
    saved().records.length === fixture.records.length,
    "gestures never save a purchase",
  );
  await checkSheet("data-dialog", () => menu("open-data"));
  await checkSheet("config-dialog", () => menu("open-config"));
  get("open-calendar").click();
  await tick();
  const day = () =>
    get("calendar-grid").querySelector(".invested:not(.outside)").click();
  await checkSheet("calendar-day-dialog", day);
  get("calendar-back").click();
  await tick();

  get("buy").click();
  await settled("buy-dialog");
  const grip = get("buy-dialog").querySelector(".sheet-grip");
  grip.dispatchEvent(
    new (win().KeyboardEvent)("keydown", { key: "ArrowUp", bubbles: true }),
  );
  await settled("buy-dialog");
  assert(
    get("buy-dialog").dataset.expanded === "false",
    "keyboard respects content height limit",
  );
  grip.dispatchEvent(
    new (win().KeyboardEvent)("keydown", { key: "ArrowDown", bubbles: true }),
  );
  await closed("buy-dialog");
  assert(!get("buy-dialog").open, "keyboard can dismiss without an X");

  get("buy").click();
  await settled("buy-dialog");
  edit("buy-amount", "12.34");
  get("buy-form").requestSubmit();
  await tick();
  win().allotBack();
  await tick();
  assert(
    get("buy-dialog").open && !get("buy-edit").hidden,
    "Android back still returns from confirmation to editing",
  );
  get("buy-form").requestSubmit();
  await tick();
  backdrop("buy-dialog");
  await closed("buy-dialog");
  assert(
    saved().records.length === fixture.records.length,
    "backdrop dismisses pending confirmation without saving",
  );
  get("buy").click();
  await settled("buy-dialog");
  get("buy-form").requestSubmit();
  await tick();
  get("save-buy").click();
  await tick();
  assert(
    get("buy-dialog").open && get("buy-dialog").dataset.phase === "closing",
    "successful save uses animated exit",
  );
  await closed("buy-dialog");
  assert(
    saved().records.length === fixture.records.length + 1,
    "confirmed purchase saves exactly once",
  );

  get("buy").click();
  await settled("buy-dialog");
  backdrop("buy-dialog");
  await pause(50);
  get("buy").click();
  await settled("buy-dialog");
  await pause(220);
  assert(
    get("buy-dialog").open,
    "rapid reopen cancels stale closing animation",
  );
  backdrop("buy-dialog");
  await closed("buy-dialog");
  await menu("open-config");
  await settled("config-dialog");
  get("config-form").requestSubmit();
  await tick();
  backdrop("config-dialog");
  await tick();
  assert(
    get("config-dialog").open &&
      get("config-dialog").dataset.phase !== "closing",
    "in-flight configuration save blocks premature dismissal",
  );
  await closed("config-dialog");
  assert(!win().__errors.length, "no browser errors");

  // A large asset list must stay inside the drawer after adding scroll containment.
  const many = structuredClone(fixture);
  for (let i = 0; i < 10; i++)
    many.plan.assets.push({
      id: "extra_" + i,
      name: "标的" + i,
      kind: "investment",
    });
  for (const asset of many.plan.assets)
    many.plan.months[0].targets[asset.id] = 10000;
  await load(many);
  get("buy").click();
  await settled("buy-dialog");
  get("picker-trigger").click();
  await settled("buy-dialog");
  await pause(250);
  const options = get("picker-options").getBoundingClientRect();
  const viewport = get("buy-dialog")
    .querySelector(".sheet-content")
    .getBoundingClientRect();
  assert(
    options.top >= viewport.top && options.bottom <= viewport.bottom,
    "large asset picker remains visible inside drawer",
  );
  get("picker-options").lastElementChild.click();
  await tick();
  assert(
    get("selected-name").textContent === "标的9",
    "large picker can select the last asset",
  );
  backdrop("buy-dialog");
  await closed("buy-dialog");

  frame.style.height = "420px";
  frame.style.width = "320px";
  await menu("open-config");
  await settled("config-dialog");
  assert(
    get("config-dialog").getBoundingClientRect().height <= 420 * 0.92 + 1,
    "small viewport limits drawer height",
  );
  const scroll = get("config-dialog").querySelector(".sheet-content");
  assert(
    scroll.scrollHeight > scroll.clientHeight,
    "long content scrolls inside a small viewport",
  );
  scroll.scrollTop = scroll.scrollHeight;
  assert(scroll.scrollTop > 0, "internal scroll reaches lower content");
  backdrop("config-dialog");
  await closed("config-dialog");
  frame.style.height = "844px";
  frame.style.width = "390px";

  const originalMatch = win().matchMedia;
  win().matchMedia = (query) =>
    query.includes("prefers-reduced-motion")
      ? { matches: true }
      : originalMatch.call(win(), query);
  get("buy").click();
  await settled("buy-dialog");
  assert(
    !get("buy-dialog").getAnimations().length,
    "reduced-motion preference skips sliding animation",
  );
  backdrop("buy-dialog");
  await closed("buy-dialog");
  win().matchMedia = originalMatch;
  return { assertions: results, count: results.length };
}
window.sheetTests = { run, load, settled, closed, drag, backdrop };
