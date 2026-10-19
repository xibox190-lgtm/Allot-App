<script setup>
import { money } from "../modules/domain.mjs";
import ProgressMeter from "./ProgressMeter.vue";
import AssetRow from "./AssetRow.vue";
defineProps(["model", "select", "create", "details"]);
</script>

<template>
  <div id="summary">
    <section v-if="model.summary?.items.length" class="summary">
      <div class="totals">
        <div
          v-for="[label, amount] in [
            ['计划', model.summary.target],
            ['已投', model.summary.paid],
            ['剩余', Math.max(0, model.summary.target - model.summary.paid)],
          ]"
          :key="label"
        >
          <span class="total-label">{{ label }}</span
          ><strong class="total-value">{{ money(amount) }}</strong>
        </div>
      </div>
      <ProgressMeter
        :paid="model.summary.paid"
        :target="model.summary.target"
      />
    </section>
  </div>
  <div id="items" role="group" :aria-label="`${model.month} 标的`">
    <AssetRow
      v-for="item in model.summary?.items || []"
      :key="item.id"
      :item="item"
      :month="model.month"
      :current="model.current"
      :selected="item.id === model.selected"
      :select="select"
      :details="details"
    />
  </div>
  <div id="empty" class="empty" :hidden="Boolean(model.summary?.items.length)">
    <p id="empty-text">
      {{
        model.hasPlan
          ? model.current
            ? "本月还没有安排"
            : "这个月还没有安排"
          : "还没有计划"
      }}
    </p>
    <button id="create" class="white-button" @click="create">制定计划</button>
  </div>
</template>
