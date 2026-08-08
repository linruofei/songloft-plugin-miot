<script setup lang="ts">
import { useNativeList } from '../runtime';
withDefaults(defineProps<{ height?: string; ariaLabel?: string }>(), { height: '420px' });
</script>

<template>
  <webf-list-view
    v-if="useNativeList"
    class="sl-list-view"
    shrink-wrap="false"
    :style="{ height }"
    :aria-label="ariaLabel"
  ><slot /></webf-list-view>
  <div v-else class="sl-list-view sl-list-view-html" :style="{ height }" :aria-label="ariaLabel">
    <slot />
  </div>
</template>
