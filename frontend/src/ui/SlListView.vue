<script setup lang="ts">
import { useNativeList } from '../runtime';
defineProps<{ ariaLabel?: string }>();
</script>

<template>
  <webf-list-view
    v-if="useNativeList"
    class="sl-list-view"
    shrink-wrap="false"
    scroll-direction="vertical"
    :aria-label="ariaLabel"
  ><slot /></webf-list-view>
  <div v-else class="sl-list-view sl-list-view-html" :aria-label="ariaLabel">
    <slot />
  </div>
</template>
