<script setup>
import Sheet from "./Sheet.vue";
const props = defineProps(["vm", "cancel"]);
const { ui } = props.vm;
</script>
<template>
  <Sheet
    id="config-dialog"
    label="config-title"
    :open="ui.dialogs.includes('config')"
    @close="vm.closeDialog('config')"
    @cancel="cancel('config', $event)"
  >
    <div class="sheet-heading">
      <h2 id="config-title">设置</h2>
    </div>
    <form id="config-form" class="config-form" @submit.prevent="vm.saveConfig">
      <label
        >接口地址<input
          id="api-base"
          v-model="ui.config.baseUrl"
          type="url"
          required /></label
      ><label
        >模型<input id="api-model" v-model="ui.config.model" required /></label
      ><button class="blue-button" :disabled="ui.configSaving">保存</button>
      <p class="muted small">使用 AI 时，对话、所选附件及工具查询到的计划和记录会发送至此接口。请使用可信服务，调用费用由你的 API 账户承担。</p>
      <p id="config-error" class="error" role="alert">{{ ui.errors.config }}</p>
    </form>
    <button
      id="open-key"
      class="settings-link"
      :disabled="ui.configSaving"
      @click="vm.openKey"
    >
      管理 API Key <span aria-hidden="true">›</span>
    </button>
  </Sheet>
  <Sheet
    id="key-dialog"
    label="key-title"
    :open="ui.dialogs.includes('key')"
    @close="vm.closeDialog('key')"
    @cancel="cancel('key', $event)"
  >
    <div class="sheet-heading">
      <h2 id="key-title">管理 API Key</h2>
    </div>
    <p id="key-status" class="muted small">
      {{ ui.configured ? "已配置 API Key" : "尚未配置 API Key" }}
    </p>
    <form id="key-form" class="config-form" @submit.prevent="vm.saveKey(false)">
      <label
        >API Key<input
          id="api-key"
          v-model="ui.apiKey"
          type="password"
          inputmode="text"
          autocapitalize="none"
          autocorrect="off"
          autocomplete="off"
          :placeholder="ui.configured ? '输入新密钥以替换' : '填入密钥'"
          spellcheck="false" /></label
      ><button id="save-key" class="blue-button" :disabled="ui.keySaving">
        保存
      </button>
      <p id="key-error" class="error" role="alert">{{ ui.errors.key }}</p>
    </form>
    <button
      id="open-remove-key"
      class="settings-link danger-text"
      :disabled="ui.keySaving || !ui.configured"
      @click="vm.openDialog('remove-key')"
    >
      清除 API Key <span aria-hidden="true">›</span>
    </button>
  </Sheet>
  <Sheet
    id="remove-key-dialog"
    label="remove-key-title"
    :open="ui.dialogs.includes('remove-key')"
    @close="vm.closeDialog('remove-key')"
    @cancel="cancel('remove-key', $event)"
  >
    <p id="remove-key-title" class="new-chat-prompt">清除 API Key？</p>
    <div class="two-actions">
      <button
        id="return-remove-key"
        :disabled="ui.keySaving"
        @click="vm.closeDialog('remove-key')"
      >
        返回</button
      ><button
        id="confirm-remove-key"
        class="blue-button"
        :disabled="ui.keySaving"
        @click="vm.saveKey(true)"
      >
        确认
      </button>
    </div>
    <p id="remove-key-error" class="error" role="alert">
      {{ ui.errors["remove-key"] }}
    </p>
  </Sheet>
</template>
