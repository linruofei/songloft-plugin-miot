<script setup lang="ts">
import { ref } from 'vue';
import { useNativeUI } from '../runtime';
import { bindNativeProps } from './nativeProps';
import SlIcon from './SlIcon.vue';

const props = withDefaults(
  defineProps<{
    label?: string;
    icon?: string;
    playerIcon?: boolean;
    iconSize?: number;
    trailingIcon?: string;
    variant?: 'filled' | 'outlined' | 'text' | 'icon' | 'tonal';
    disabled?: boolean;
    title?: string;
    block?: boolean;
    type?: 'button' | 'submit';
  }>(),
  { variant: 'text', type: 'button' },
);
defineEmits<{ click: [MouseEvent] }>();
const native = ref<HTMLElement | null>(null);
bindNativeProps(native, () => ({ disabled: !!props.disabled }));
</script>

<template>
  <flutter-cupertino-button
    v-if="useNativeUI"
    ref="native"
    class="sl-button"
    :class="[`sl-button-${variant}`, { 'sl-button-block': block }]"
    :title="title"
    @click="$emit('click', $event)"
  >
    <span class="sl-button-content">
      <SlIcon v-if="icon" :name="icon" :size="iconSize ?? (variant === 'icon' ? 22 : 18)" :player-icon="playerIcon" />
      <span v-if="label" class="sl-button-label">{{ label }}</span>
      <SlIcon v-if="trailingIcon" :name="trailingIcon" :size="18" />
    </span>
  </flutter-cupertino-button>
  <button
    v-else
    class="sl-button"
    :class="[`sl-button-${variant}`, { 'sl-button-block': block }]"
    :disabled="disabled"
    :title="title"
    :aria-label="variant === 'icon' ? label || title : undefined"
    :type="type"
    @click="$emit('click', $event)"
  >
    <span class="sl-button-content">
      <SlIcon v-if="icon" :name="icon" :size="iconSize ?? (variant === 'icon' ? 22 : 18)" :player-icon="playerIcon" />
      <span v-if="label && variant !== 'icon'" class="sl-button-label">{{ label }}</span>
      <SlIcon v-if="trailingIcon" :name="trailingIcon" :size="18" />
    </span>
  </button>
</template>
