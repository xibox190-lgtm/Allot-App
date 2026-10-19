<script setup>
import { computed, ref, watch, nextTick, onMounted } from "vue";
import ChatMessage from "./ChatMessage.vue";
const props = defineProps(["vm"]);
const { ui, state, reviews } = props.vm;
const scroll = ref(null),
  input = ref(null),
  files = ref(null);
const emptyReviews = Object.freeze([]);
const initialized = ref(false);
watch(
  () => ui.page === "plan" && !ui.tab,
  (value) => {
    if (value) initialized.value = true;
  },
  { immediate: true },
);
const rows = computed(() => {
  if (!initialized.value) return [];
  const grouped = new Map();
  for (const review of reviews.value) {
    if (!grouped.has(review.messageIndex)) grouped.set(review.messageIndex, []);
    grouped.get(review.messageIndex).push(review);
  }
  const result = [];
  state.value.chat.forEach((item, index) => {
    if (!["user", "assistant"].includes(item.role)) return;
    const cards = grouped.get(index) || emptyReviews;
    if (typeof item.content === "string" && !item.content && !cards.length)
      return;
    result.push({ ...item, key: index, reviews: cards });
  });
  for (const review of reviews.value.filter(
    (review) => review.messageIndex < 0,
  ))
    result.push({
      role: "assistant",
      key: review.batchId,
      content: "",
      reviews: [review],
    });
  return result;
});
function bottom() {
  requestAnimationFrame(() => {
    if (scroll.value) scroll.value.scrollTop = scroll.value.scrollHeight;
  });
}
function resize() {
  const el = input.value;
  if (!el?.clientWidth) return;
  const following =
    scroll.value.scrollHeight -
      scroll.value.scrollTop -
      scroll.value.clientHeight <
    80;
  const style = getComputedStyle(el),
    top = el.scrollTop;
  const maximum =
    parseFloat(style.lineHeight) * 5 +
    parseFloat(style.paddingTop) +
    parseFloat(style.paddingBottom);
  el.style.height = "0px";
  el.style.height = `${Math.min(el.scrollHeight, maximum)}px`;
  el.scrollTop = top;
  if (following) bottom();
}
watch(
  () => state.value.chat,
  async () => {
    const top = scroll.value?.scrollTop || 0;
    const follow =
      !scroll.value ||
      scroll.value.scrollHeight - top - scroll.value.clientHeight < 80;
    await nextTick();
    if (follow) bottom();
    else scroll.value.scrollTop = top;
  },
);
watch(
  () => [ui.input, ui.page, ui.tab],
  () => nextTick(resize),
);
onMounted(() => {
  props.vm.hooks.scrollChat = bottom;
  props.vm.hooks.resizeInput = resize;
  props.vm.hooks.blurInput = () => input.value.blur();
  props.vm.hooks.resetFiles = () => {
    files.value.value = "";
  };
});
</script>
<template>
  <section id="chat-pane" :inert="ui.tab" :aria-hidden="ui.tab">
    <div id="chat-scroll" ref="scroll">
      <div id="chat-list" aria-live="polite">
        <ChatMessage
          v-for="row in rows"
          :key="row.key"
          :role="row.role"
          :content="row.content"
          :reviews="row.reviews"
          :pending-id="state.pendingRecords?.id"
          :busy="ui.busy"
          :preview="vm.previewRecords"
        />
        <p v-if="ui.waiting" class="small muted">正在整理…</p>
      </div>
      <div
        id="chat-empty"
        class="chat-empty"
        :hidden="state.chat.length > 0 || Boolean(state.conversationStarted)"
      >
        <h2>说说你的计划或记录</h2>
        <p>文字、Markdown 或图片都可以。</p>
        <button id="start-manual" class="text-button" @click="vm.manual">
          手动创建
        </button>
      </div>
    </div>
    <form id="chat-form" class="composer" @submit.prevent="vm.send">
      <div id="attachments">
        <div
          v-for="(file, index) in ui.attachments"
          :key="index"
          class="attachment"
        >
          <img v-if="file.image" :src="file.image" alt="" /><span>{{
            file.name
          }}</span
          ><button
            type="button"
            :aria-label="`移除${file.name}`"
            :disabled="ui.busy"
            @click="ui.attachments.splice(index, 1)"
          >
            ×
          </button>
        </div>
      </div>
      <textarea
        id="chat-input"
        ref="input"
        v-model="ui.input"
        rows="1"
        aria-label="计划对话"
        :disabled="ui.busy"
        @input="resize"
      ></textarea>
      <div class="composer-row">
        <div class="composer-tools">
          <button
            id="attach"
            type="button"
            class="icon-button"
            aria-label="添加图片或文件"
            :disabled="ui.busy"
            @click="files.click()"
          >
            ＋
          </button>
          <button
            id="new-chat"
            type="button"
            class="icon-button"
            aria-label="开启新对话"
            title="开启新对话"
            :disabled="ui.busy"
            @click="
              input.blur();
              vm.openDialog('new-chat');
            "
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-10a9 9 0 0 1 9-9h1"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M19 2v6M16 5h6"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>
        <button
          id="send"
          class="circle-button"
          :class="{ pending: ui.busy }"
          aria-label="发送"
          :disabled="ui.busy"
        >
          <svg
            class="send-arrow"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M9 14V4M5 8l4-4 4 4"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
      <input
        id="files"
        ref="files"
        type="file"
        accept="image/png,image/jpeg,image/webp,.md,.txt,.markdown"
        multiple
        hidden
        @change="vm.attach([...files.files])"
      />
    </form>
  </section>
</template>
