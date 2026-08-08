<script setup lang="ts">
import { ref } from 'vue';
import { useNativeSlider } from '../runtime';
import { bindNativeProps } from './nativeProps';

const props = withDefaults(
  defineProps<{ modelValue: number; min?: number; max?: number; step?: number; disabled?: boolean; ariaLabel?: string }>(),
  { min: 0, max: 100, step: 1 },
);
const emit = defineEmits<{ 'update:modelValue': [number]; change: [number] }>();
const native = ref<HTMLElement | null>(null);
bindNativeProps(native, () => ({
  value: props.modelValue,
  min: props.min,
  max: props.max,
  step: props.step,
  disabled: !!props.disabled,
}));

function valueFrom(event: Event): number {
  const detail = (event as CustomEvent).detail;
  return Number(detail ?? (event.target as HTMLInputElement).value);
}
</script>

<template>
  <songloft-slider
    v-if="useNativeSlider"
    ref="native"
    class="sl-slider-native"
    @input="emit('update:modelValue', valueFrom($event))"
    @change="emit('change', valueFrom($event))"
  />
  <input
    v-else
    class="sl-slider"
    type="range"
    :value="modelValue"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :aria-label="ariaLabel"
    @input="emit('update:modelValue', valueFrom($event))"
    @change="emit('change', valueFrom($event))"
  />
</template>
