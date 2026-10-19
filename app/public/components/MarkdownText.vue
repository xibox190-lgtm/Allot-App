<script setup>
import { computed } from "vue";
import { renderMarkdown } from "../modules/markdown.mjs";
const props = defineProps(["text"]);
// Only the existing sanitizer can supply v-html. Cached until text changes.
const html = computed(() => renderMarkdown(props.text).innerHTML);
</script>
<template><div class="markdown-body" v-html="html"></div></template>
