<script setup>
import MarkdownText from "./MarkdownText.vue";
defineProps(["role", "content", "reviews", "pendingId", "busy", "preview"]);
const label = (review) =>
  ({
    pending: "待确认记录",
    updated: "已更新",
    saved: "已保存",
    cancelled: "已取消",
  })[review.status] || "已失效";
</script>
<template>
  <article class="message" :class="role">
    <span class="message-label">{{ role === "user" ? "我" : "Allot" }}</span>
    <MarkdownText
      v-if="typeof content === 'string' && content"
      :text="content"
    />
    <template v-else-if="Array.isArray(content)">
      <template v-for="(part, index) in content" :key="index">
        <MarkdownText v-if="part.type === 'text'" :text="part.text" />
        <img
          v-else-if="part.type === 'image_url'"
          :src="part.image_url.url"
          alt="计划附件"
        />
      </template>
    </template>
    <section
      v-for="review in reviews"
      :key="review.batchId"
      class="review-card"
      :class="{
        inactive: review.status !== 'pending' || review.batchId !== pendingId,
      }"
      :data-batch-id="review.batchId"
    >
      <h2>
        {{
          review.status === "pending" && review.batchId !== pendingId
            ? "已失效"
            : label(review)
        }}
      </h2>
      <p class="muted small">
        {{ review.count }} 条记录{{
          review.skipped ? ` · 已跳过 ${review.skipped} 条重复记录` : ""
        }}
      </p>
      <button
        v-if="review.status === 'pending' && review.batchId === pendingId"
        type="button"
        class="blue-button"
        :disabled="busy"
        @click="preview(review.batchId)"
      >
        核对记录
      </button>
    </section>
  </article>
</template>
