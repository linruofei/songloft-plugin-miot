<script setup lang="ts">
import { resolveConfirm, state } from '../store';
import SlButton from '../ui/SlButton.vue';
</script>

<template>
  <div v-if="state.confirm.open" class="dialog-overlay" @click.self="resolveConfirm(false)">
    <div class="dialog" role="dialog" aria-modal="true">
      <h2 class="dialog-title">{{ state.confirm.title }}</h2>
      <div class="dialog-content">{{ state.confirm.message }}</div>
      <div class="dialog-actions">
        <SlButton variant="text" label="取消" @click="resolveConfirm(false)" />
        <SlButton :variant="state.confirm.dangerous ? 'filled' : 'filled'" :label="state.confirm.confirmText" @click="resolveConfirm(true)" />
      </div>
    </div>
  </div>
</template>
