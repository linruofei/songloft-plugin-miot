<script setup lang="ts">
defineProps<{ ariaLabel?: string }>();
const emit = defineEmits<{ scroll: [Event] }>();
</script>

<template>
  <div class="sl-list-view sl-list-view-html" :aria-label="ariaLabel" @scroll="emit('scroll', $event)">
    <slot />
  </div>
</template>
