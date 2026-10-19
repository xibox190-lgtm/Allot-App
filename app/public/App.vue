<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useApp } from "./modules/use-app.mjs";
import { installMonthMotion } from "./modules/month-motion.mjs";
import { installPager } from "./modules/pager.mjs";
import HomeContent from "./components/HomeContent.vue";
import BuySheet from "./components/BuySheet.vue";
import ChatPane from "./components/ChatPane.vue";
import PlanEditor from "./components/PlanEditor.vue";
import CalendarPage from "./components/CalendarPage.vue";
import AssetDetailSheet from "./components/AssetDetailSheet.vue";
import ConfirmationSheets from "./components/ConfirmationSheets.vue";
import SettingsSheets from "./components/SettingsSheets.vue";
import DataSheets from "./components/DataSheets.vue";
import Sheet from "./components/Sheet.vue";
const vm = useApp();
const { ui, state, home } = vm;
const buy = ref(null),
  assetDetail = ref(null),
  calendar = ref(null),
  planViewport = ref(null),
  planTrack = ref(null);
let motion, pager, timer;
function menu(place) {
  ui.menu = ui.menu === place ? "" : place;
}
function calendarOpen() {
  if (ui.busy) return;
  vm.navigate("calendar");
  calendar.value.open(ui.month);
}
function cancel(id, event) {
  if (
    (id === "clear" && ui.clearing) ||
    (["key", "remove-key"].includes(id) && ui.keySaving) ||
    (id === "config" && ui.configSaving)
  ) {
    event.preventDefault();
    return;
  }
  if (id === "buy" && !["backdrop", "drag"].includes(event.sheetDismiss))
    buy.value.cancel(event);
}
function back() {
  if (ui.menu) {
    ui.menu = "";
    return true;
  }
  for (const id of [
    "asset-detail",
    "calendar-day",
    "remove-key",
    "key",
    "new-chat",
    "clear",
    "data",
    "records",
    "plan",
    "config",
    "buy",
  ]) {
    if (!ui.dialogs.includes(id)) continue;
    const event = new Event("cancel", { cancelable: true });
    cancel(id, event);
    if (!event.defaultPrevented) vm.closeDialog(id);
    return true;
  }
  if (ui.page !== "home") {
    vm.navigate("home");
    return true;
  }
  return false;
}
function outside(event) {
  if (!event.target.closest(".header-right")) ui.menu = "";
  if (!event.target.closest(".picker")) buy.value.closePicker();
}
function escape(event) {
  if (event.key === "Escape") ui.menu = "";
}
function viewport() {
  document.documentElement.style.setProperty(
    "--app-height",
    `${globalThis.visualViewport?.height || innerHeight}px`,
  );
  nextTick(() => vm.hooks.resizeInput?.());
}
watch(
  () => ui.page,
  (value) => {
    document.body.className = `${value}-active`;
  },
  { immediate: true },
);
onMounted(async () => {
  motion = installMonthMotion({
    getPlan: () => state.value.plan,
    getMonth: () => ui.month,
    setMonth: (value) => {
      ui.month = value;
    },
    announce: (value) => {
      ui.status = value;
    },
  });
  pager = installPager(planViewport.value, planTrack.value, (index) => {
    ui.tab = Boolean(index);
    if (!ui.tab) nextTick(() => vm.hooks.scrollChat?.());
  });
  vm.hooks.resetMotion = motion.reset;
  vm.hooks.resetPager = pager.reset;
  vm.hooks.selectTab = (tab, animate) => {
    pager.select(Number(tab), animate);
    if (tab) vm.hooks.blurInput?.();
    else
      nextTick(() => {
        vm.hooks.resizeInput?.();
        vm.hooks.scrollChat?.();
      });
  };
  vm.hooks.openBuy = () => buy.value.open();
  vm.hooks.resetBuy = () => buy.value.reset();
  document.addEventListener("click", outside);
  document.addEventListener("keydown", escape);
  window.addEventListener("storage", vm.storage);
  window.addEventListener("resize", viewport);
  globalThis.visualViewport?.addEventListener("resize", viewport);
  globalThis.allotBack = back;
  timer = setInterval(vm.rollover, 30000);
  viewport();
  await nextTick();
  performance.mark("allot-ready");
});
onBeforeUnmount(() => {
  motion?.destroy();
  pager?.destroy();
  vm.destroy();
  clearInterval(timer);
  document.removeEventListener("click", outside);
  document.removeEventListener("keydown", escape);
  window.removeEventListener("storage", vm.storage);
  window.removeEventListener("resize", viewport);
  globalThis.visualViewport?.removeEventListener("resize", viewport);
  delete globalThis.allotBack;
});
</script>
<template>
  <main id="app">
    <section id="home" class="page" :hidden="ui.page !== 'home'">
      <header>
        <h1>
          <button
            id="open-calendar"
            aria-label="打开投资日历"
            @click="calendarOpen"
          >
            <span id="home-title">{{
              home.current ? "本月计划" : `${Number(ui.month.slice(5))}月计划`
            }}</span
            ><span class="calendar-entry-arrow" aria-hidden="true">›</span>
          </button>
        </h1>
        <div class="header-right">
          <span id="date">{{ ui.month.replace("-", ".") }}</span
          ><button
            id="more"
            class="icon-button"
            aria-label="更多"
            :aria-expanded="ui.menu === 'home'"
            @click="menu('home')"
          >
            ⋯
          </button>
        </div>
      </header>
      <div id="month-viewport">
        <div id="month-content">
          <HomeContent
            :model="home"
            :select="vm.selectAsset"
            :details="(id) => assetDetail.open(id)"
            :create="() => vm.navigate('plan')"
          />
        </div>
      </div>
      <button
        id="buy"
        class="white-button buy-button"
        :hidden="!home.current || !home.summary?.items.length"
        @click="vm.openBuy"
      >
        ＋ 记一笔
      </button>
    </section>
    <section id="plan-page" class="page" :hidden="ui.page !== 'plan'">
      <header>
        <button
          id="back"
          class="icon-button"
          aria-label="返回本月计划"
          :disabled="ui.busy"
          @click="vm.navigate('home')"
        >
          ‹
        </button>
        <h1>Allot</h1>
        <div class="header-right">
          <button
            id="plan-config"
            class="icon-button"
            aria-label="更多"
            :aria-expanded="ui.menu === 'plan'"
            @click="menu('plan')"
          >
            ⋯
          </button>
        </div>
      </header>
      <nav class="tabs">
        <button
          id="chat-tab"
          :aria-pressed="!ui.tab"
          @click="vm.selectTab(false)"
        >
          对话</button
        ><button
          id="draft-tab"
          :aria-pressed="ui.tab"
          @click="vm.selectTab(true)"
        >
          计划<span id="draft-dot" :hidden="!state.draft"> ·</span>
        </button>
      </nav>
      <div id="plan-viewport" ref="planViewport">
        <div id="plan-track" ref="planTrack">
          <ChatPane :vm="vm" /><PlanEditor :vm="vm" />
        </div>
      </div>
    </section>
    <CalendarPage ref="calendar" :vm="vm" :cancel="cancel" />
    <p id="global-error" class="error" role="alert">{{ ui.errors.global }}</p>
    <p id="status" class="sr-only" role="status">{{ ui.status }}</p>
  </main>
  <Teleport
    v-if="ui.menu"
    :to="
      ui.menu === 'home' ? '#home .header-right' : '#plan-page .header-right'
    "
  >
    <div id="menu" class="menu">
      <button id="open-assistant" @click="vm.navigate('plan', false)">
        投资助手</button
      ><button id="open-plan" @click="vm.navigate('plan', true)">
        投资计划</button
      ><button id="open-data" @click="vm.openData">数据管理</button
      ><button id="open-config" @click="vm.openConfig">设置</button>
    </div>
  </Teleport>
  <Sheet
    id="buy-dialog"
    label="buy-title"
    :open="ui.dialogs.includes('buy')"
    @close="vm.closeDialog('buy')"
    @cancel="cancel('buy', $event)"
    ><BuySheet
      ref="buy"
      :select="vm.selectAsset"
      :get-context="vm.getBuyContext"
      :save="vm.saveBuy"
  /></Sheet>
  <ConfirmationSheets :vm="vm" :cancel="cancel" /><SettingsSheets
    :vm="vm"
    :cancel="cancel"
  /><DataSheets :vm="vm" :cancel="cancel" />
  <AssetDetailSheet ref="assetDetail" :vm="vm" :cancel="cancel" />
  <p id="chat-toast" class="toast" role="status" :hidden="!ui.toast">
    {{ ui.toast }}
  </p>
</template>
