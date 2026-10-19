import { shallowRef, reactive, computed, nextTick } from "vue";
import {
  emptyState,
  assertPlan,
  setDraft,
  commitDraft,
  commitRecords,
  addPurchase,
  monthSummary,
  toCents,
  money,
  currentMonth,
  diffPlan,
  browseMonths,
} from "./domain.mjs";
import * as platform from "./platform.mjs";
import { exportPlan, exportRecords } from "./export.mjs";
import { runAgent } from "./agent.mjs";
import {
  recordReviews,
  reconcileRecordReviews,
  startNewConversation,
} from "./chat.mjs";

// Persist plain snapshots, then publish them. Vue never proxies persisted data.
export function useApp() {
  const state = shallowRef(emptyState());
  const ui = reactive({
    page: "home",
    tab: false,
    menu: "",
    dialogs: [],
    selected: "",
    month: currentMonth(),
    todayMonth: currentMonth(),
    busy: false,
    broken: false,
    invalidDraft: false,
    draftMonth: 0,
    attachments: [],
    input: "",
    pendingPlan: null,
    confirmingRecords: null,
    waiting: false,
    toast: "",
    status: "",
    errors: {},
    config: { baseUrl: "https://api.deepseek.com", model: "deepseek-flash" },
    configured: false,
    apiKey: "",
    keySaving: false,
    configSaving: false,
    copying: false,
    clearing: false,
    clearInput: "",
    dataStatus: "",
  });
  let epoch = 0,
    toastTimer;
  const hooks = {};
  const report = (error, target = "global") => {
    ui.errors[target] = error.message || String(error);
  };
  try {
    state.value = platform.readState();
  } catch (e) {
    ui.broken = true;
    report(new Error("本地数据无法读取，未覆盖原数据：" + e.message));
  }
  const summary = computed(() => monthSummary(state.value, ui.month));
  const home = computed(() => ({
    summary: summary.value,
    month: ui.month,
    current: ui.month === ui.todayMonth,
    selected: ui.selected,
    hasPlan: Boolean(state.value.plan),
  }));
  const plan = computed(() => state.value.draft || state.value.plan);
  const reviews = computed(() => recordReviews(state.value));
  const changes = computed(() =>
    state.value.draft ? diffPlan(state.value.plan, state.value.draft) : [],
  );
  const recordChanges = computed(() => {
    const batch = state.value.pendingRecords;
    if (!batch || batch.id !== ui.confirmingRecords) return [];
    const previous = new Map(
      state.value.records.map((record) => [record.id, record]),
    );
    return [...batch.entries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((record) => ({ ...record, previous: previous.get(record.id) }));
  });
  function transact(change) {
    if (ui.broken) throw new Error("本地数据读取失败，暂不能写入");
    const next = structuredClone(state.value);
    change(next);
    next.recordReviews = reconcileRecordReviews(state.value, next);
    platform.writeState(next);
    state.value = next;
    if (!browseMonths(next.plan).includes(ui.month)) ui.month = currentMonth();
    if (!summary.value?.items.some((item) => item.id === ui.selected))
      ui.selected = "";
    hooks.resetMotion?.();
  }
  function openDialog(id) {
    ui.errors[id] = "";
    if (!ui.dialogs.includes(id)) ui.dialogs.push(id);
  }
  function closeDialog(id) {
    ui.dialogs = ui.dialogs.filter((value) => value !== id);
    if (id === "key") ui.apiKey = "";
  }
  function navigate(page, tab = false) {
    if (ui.busy || ui.clearing) return;
    hooks.resetMotion?.();
    hooks.resetCalendar?.();
    hooks.resetPager?.();
    ui.menu = "";
    ui.page = page;
    ui.errors.global = "";
    if (page === "plan") {
      ui.tab = tab;
      nextTick(() => hooks.selectTab?.(tab, false));
    }
    if (page !== "plan") hooks.blurInput?.();
    window.scrollTo(0, 0);
  }
  function selectTab(tab, animate = true) {
    ui.tab = Boolean(tab);
    hooks.selectTab?.(ui.tab, animate);
  }
  function selectAsset(id) {
    ui.selected = id;
  }
  function getBuyContext() {
    return {
      items: monthSummary(state.value)?.items || [],
      selected: ui.selected,
      revision: state.value.revision,
    };
  }
  function openBuy() {
    if (ui.month !== currentMonth()) return;
    const items = getBuyContext().items;
    if (!items.length) return;
    hooks.resetMotion?.();
    if (!items.some((item) => item.id === ui.selected))
      ui.selected = items[0].id;
    hooks.openBuy?.();
    openDialog("buy");
  }
  function saveBuy(pending) {
    if (pending.date !== currentMonth())
      throw new Error("月份已变化，请重新记录");
    transact((next) =>
      addPurchase(
        next,
        pending.assetId,
        pending.amount,
        pending.revision,
        new Date(),
        pending.id,
      ),
    );
    ui.status = "已保存买入";
  }
  function manual() {
    try {
      const id = "asset_" + crypto.randomUUID().slice(0, 8);
      transact((next) =>
        setDraft(next, {
          assets: [{ id, name: "标的", kind: "investment" }],
          months: [{ month: currentMonth(), targets: { [id]: 0 } }],
          notes: "",
        }),
      );
      ui.invalidDraft = false;
      ui.draftMonth = 0;
      selectTab(true);
    } catch (e) {
      report(e);
    }
  }
  function editDraft() {
    try {
      transact((next) => setDraft(next, next.plan));
      ui.invalidDraft = false;
    } catch (e) {
      report(e);
    }
  }
  function updateDraft(change) {
    if (ui.busy) return;
    try {
      transact((next) => {
        const draft = structuredClone(next.draft);
        change(draft);
        setDraft(next, draft);
      });
      ui.invalidDraft = false;
      ui.errors.global = "";
    } catch (e) {
      ui.invalidDraft = true;
      report(e);
    }
  }
  function renameAsset(id, name) {
    updateDraft((draft) => {
      draft.assets.find((asset) => asset.id === id).name = name.trim();
    });
  }
  function changeAmount(id, text) {
    updateDraft((draft) => {
      draft.months[ui.draftMonth].targets[id] = toCents(text);
    });
  }
  function pickDraftMonth(index) {
    if (ui.invalidDraft) {
      report(new Error("请先修正金额或名称"));
      return;
    }
    ui.draftMonth = index;
  }
  function addAsset() {
    if (ui.busy || ui.invalidDraft) return;
    updateDraft((draft) => {
      const id = "asset_" + crypto.randomUUID().slice(0, 8);
      let i = draft.assets.length + 1;
      while (draft.assets.some((asset) => asset.name === `标的 ${i}`)) i++;
      draft.assets.push({ id, name: `标的 ${i}`, kind: "investment" });
      draft.months.forEach((month) => {
        month.targets[id] = 0;
      });
    });
  }
  function addMonth() {
    if (ui.busy || ui.invalidDraft) return;
    updateDraft((draft) => {
      const last = [...draft.months]
        .sort((a, b) => a.month.localeCompare(b.month))
        .at(-1)
        .month.split("-")
        .map(Number);
      const date = new Date(last[0], last[1], 1);
      draft.months.push({
        month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        targets: Object.fromEntries(draft.assets.map((asset) => [asset.id, 0])),
      });
    });
    if (!ui.invalidDraft) ui.draftMonth = state.value.draft.months.length - 1;
  }
  function previewPlan() {
    try {
      if (ui.invalidDraft || ui.busy) return;
      assertPlan(state.value.draft);
      ui.pendingPlan = {
        draftRevision: state.value.draftRevision,
        revision: state.value.revision,
      };
      openDialog("plan");
    } catch (e) {
      report(e);
    }
  }
  function savePlan() {
    if (!ui.pendingPlan) return;
    try {
      transact((next) =>
        commitDraft(
          next,
          ui.pendingPlan.draftRevision,
          ui.pendingPlan.revision,
        ),
      );
      ui.pendingPlan = null;
      closeDialog("plan");
      navigate("home");
      ui.status = "计划已生效";
    } catch (e) {
      report(e, "plan");
    }
  }
  function previewRecords(id) {
    if (ui.busy || state.value.pendingRecords?.id !== id) return;
    ui.confirmingRecords = id;
    openDialog("records");
  }
  function saveRecords(discard = false) {
    if (
      ui.busy ||
      !ui.confirmingRecords ||
      state.value.pendingRecords?.id !== ui.confirmingRecords
    )
      return;
    try {
      transact((next) => {
        if (discard) next.pendingRecords = null;
        else commitRecords(next, ui.confirmingRecords);
      });
      closeDialog("records");
      ui.confirmingRecords = null;
      if (!discard) ui.status = "投资记录已保存";
    } catch (e) {
      report(e, "records");
    }
  }
  function newConversation() {
    if (ui.busy) return;
    try {
      transact(startNewConversation);
      epoch++;
      ui.pendingPlan = null;
      ui.confirmingRecords = null;
      ui.invalidDraft = false;
      ui.draftMonth = 0;
      ui.attachments = [];
      ui.input = "";
      ui.errors.global = "";
      closeDialog("new-chat");
      selectTab(false, false);
      hooks.resetFiles?.();
      ui.toast = "已开启新对话";
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        ui.toast = "";
      }, 2200);
    } catch (e) {
      report(e, "new-chat");
    }
  }
  async function attach(files) {
    const started = epoch;
    try {
      for (const file of files) {
        if (ui.attachments.length >= 3 || file.size > 2 * 1024 * 1024)
          throw new Error("最多 3 个附件，单个不超过 2 MB");
        let attachment;
        if (/^image\/(png|jpeg|webp)$/.test(file.type)) {
          const image = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          attachment = { name: file.name, image };
        } else if (/\.(md|markdown|txt)$/i.test(file.name))
          attachment = { name: file.name, text: await file.text() };
        else throw new Error("请选择图片、MD 或 TXT");
        if (started !== epoch) return;
        ui.attachments.push(attachment);
      }
    } catch (e) {
      if (started === epoch) report(e);
    } finally {
      if (started === epoch) hooks.resetFiles?.();
    }
  }
  async function send() {
    if (ui.busy) return;
    const text = ui.input.trim();
    if (!text && !ui.attachments.length) return;
    const content = [
      {
        type: "text",
        text:
          text ||
          "请理解附件中的计划或买入记录，有歧义先澄清，再整理供我确认。",
      },
    ];
    for (const file of ui.attachments)
      content.push(
        file.image
          ? { type: "image_url", image_url: { url: file.image } }
          : { type: "text", text: `附件 ${file.name}：\n${file.text}` },
      );
    const history = [
      ...state.value.chat,
      { role: "user", content: ui.attachments.length ? content : text },
    ];
    const before = state.value,
      baseEpoch = epoch;
    ui.busy = true;
    ui.waiting = true;
    ui.errors.global = "";
    nextTick(() => hooks.scrollChat?.());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);
    try {
      const result = await runAgent(
        before,
        history,
        platform.transport,
        controller.signal,
      );
      const latest = state.value;
      if (
        baseEpoch !== epoch ||
        before.draftRevision !== latest.draftRevision ||
        before.revision !== latest.revision ||
        (before.recordsRevision || 0) !== (latest.recordsRevision || 0) ||
        before.pendingRecords?.id !== latest.pendingRecords?.id
      )
        throw new Error("数据已变化，本次结果未覆盖你的修改，请重新发送");
      transact((next) => {
        next.draft = result.state.draft;
        next.draftRevision = result.state.draftRevision;
        next.pendingRecords = result.state.pendingRecords || null;
        next.chat = result.messages;
      });
      ui.input = "";
      ui.attachments = [];
      if (before.draftRevision !== result.state.draftRevision) {
        ui.draftMonth = 0;
        ui.invalidDraft = false;
        selectTab(true);
      }
      if (before.pendingRecords?.id !== result.state.pendingRecords?.id)
        selectTab(false);
    } catch (e) {
      report(e);
    } finally {
      clearTimeout(timeout);
      ui.busy = false;
      ui.waiting = false;
    }
  }
  async function openConfig() {
    if (ui.busy) return;
    ui.menu = "";
    try {
      const config = await platform.getConfig();
      ui.config = { baseUrl: config.baseUrl, model: config.model };
      ui.configured = config.configured;
      openDialog("config");
    } catch (e) {
      report(e);
    }
  }
  async function saveConfig() {
    if (ui.configSaving) return;
    ui.configSaving = true;
    try {
      await platform.saveConfig({
        baseUrl: ui.config.baseUrl.trim(),
        model: ui.config.model.trim(),
      });
      closeDialog("config");
      ui.status = "AI 配置已保存";
    } catch (e) {
      report(e, "config");
    } finally {
      ui.configSaving = false;
    }
  }
  async function openKey() {
    if (ui.busy || ui.keySaving) return;
    try {
      const config = await platform.getConfig();
      ui.configured = config.configured;
      ui.apiKey = "";
      closeDialog("config");
      openDialog("key");
    } catch (e) {
      report(e);
    }
  }
  async function saveKey(remove = false) {
    if (ui.keySaving) return;
    if (!remove && !ui.apiKey.trim()) {
      report(new Error("请填写 API Key"), "key");
      return;
    }
    ui.keySaving = true;
    try {
      if (remove) await platform.clearApiKey();
      else await platform.saveApiKey(ui.apiKey.trim());
      ui.configured = !remove;
      ui.apiKey = "";
      ui.errors.key = "";
      if (remove) closeDialog("remove-key");
      ui.status = remove ? "API Key 已清除" : "API Key 已保存";
    } catch (e) {
      report(e, remove ? "remove-key" : "key");
    } finally {
      ui.keySaving = false;
    }
  }
  function openData() {
    if (!ui.busy) {
      ui.menu = "";
      ui.dataStatus = "";
      openDialog("data");
    }
  }
  async function copyExport(records) {
    if (ui.copying || ui.broken) return;
    ui.dataStatus = "";
    ui.errors.data = "";
    ui.copying = true;
    try {
      const text = records
        ? exportRecords(state.value)
        : exportPlan(state.value);
      const count = state.value.records.length;
      await platform.copyText(text);
      ui.dataStatus = records ? `已复制 ${count} 笔记录` : "已复制计划";
    } catch (e) {
      report(e, "data");
    } finally {
      ui.copying = false;
    }
  }
  function openClear() {
    if (!ui.busy) {
      closeDialog("data");
      ui.clearInput = "";
      openDialog("clear");
    }
  }
  async function clear() {
    if (ui.busy || ui.clearInput.trim() !== "清空") return;
    ui.busy = true;
    ui.clearing = true;
    try {
      await platform.clearData();
      epoch++;
      state.value = emptyState();
      ui.broken = false;
      ui.selected = "";
      ui.invalidDraft = false;
      ui.pendingPlan = null;
      ui.confirmingRecords = null;
      ui.draftMonth = 0;
      ui.attachments = [];
      ui.input = "";
      ui.apiKey = "";
      ui.clearInput = "";
      ui.dialogs = [];
      ui.month = currentMonth();
      ui.page = "home";
      ui.menu = "";
      ui.errors = {};
      hooks.resetBuy?.();
      hooks.resetFiles?.();
      hooks.resetMotion?.();
      hooks.resetCalendar?.();
      hooks.resetPager?.();
      ui.status = "全部数据已清空";
    } catch (e) {
      report(e, "clear");
    } finally {
      ui.busy = false;
      ui.clearing = false;
    }
  }
  function storage(event) {
    if (event.key !== "allot.state.v1" && event.key !== null) return;
    try {
      epoch++;
      state.value = platform.readState();
      ui.broken = false;
      for (const id of ["buy", "plan", "records"]) closeDialog(id);
      ui.pendingPlan = null;
      ui.confirmingRecords = null;
      ui.invalidDraft = false;
      ui.draftMonth = Math.min(
        ui.draftMonth,
        (plan.value?.months.length || 1) - 1,
      );
      if (!browseMonths(state.value.plan).includes(ui.month))
        ui.month = currentMonth();
      hooks.resetBuy?.();
      hooks.resetMotion?.();
    } catch (e) {
      ui.broken = true;
      report(e);
    }
  }
  function rollover() {
    const month = currentMonth();
    if (ui.todayMonth === month) return;
    ui.todayMonth = month;
    ui.month = month;
    hooks.resetMotion?.();
  }
  function destroy() {
    clearTimeout(toastTimer);
  }
  return {
    state,
    ui,
    hooks,
    home,
    plan,
    reviews,
    changes,
    recordChanges,
    report,
    transact,
    openDialog,
    closeDialog,
    navigate,
    selectTab,
    selectAsset,
    getBuyContext,
    openBuy,
    saveBuy,
    manual,
    editDraft,
    renameAsset,
    changeAmount,
    pickDraftMonth,
    addAsset,
    addMonth,
    previewPlan,
    savePlan,
    previewRecords,
    saveRecords,
    newConversation,
    attach,
    send,
    openConfig,
    saveConfig,
    openKey,
    saveKey,
    openData,
    copyExport,
    openClear,
    clear,
    storage,
    rollover,
    destroy,
  };
}
