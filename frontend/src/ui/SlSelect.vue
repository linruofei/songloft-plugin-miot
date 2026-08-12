<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import type { SelectOption } from '../types';
import { isWebFRuntime } from '../runtime';
import SlButton from './SlButton.vue';
import { nextSelectId, openSelect } from './selectState';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: SelectOption[];
    placeholder?: string;
    ariaLabel?: string;
    allowEmpty?: boolean;
    disabled?: boolean;
  }>(),
  { placeholder: '请选择', allowEmpty: false },
);
const emit = defineEmits<{ 'update:modelValue': [string] }>();
const wrapper = ref<HTMLElement | null>(null);
const panelWidth = ref('100%');
const id = nextSelectId();
const opened = computed(() => openSelect.value === id);
const label = computed(
  () => props.options.find((option) => option.value === props.modelValue)?.label || props.placeholder,
);
const rows = computed(() =>
  props.allowEmpty
    ? [{ value: '', label: props.placeholder }, ...props.options]
    : props.options,
);

function toggle() {
  if (props.disabled) return;
  if (!opened.value) {
    const width = wrapper.value?.getBoundingClientRect().width || 0;
    if (width > 0) panelWidth.value = `${Math.round(width)}px`;
  }
  openSelect.value = opened.value ? null : id;
}
function select(value: string) {
  openSelect.value = null;
  emit('update:modelValue', value);
}
onUnmounted(() => {
  if (openSelect.value === id) openSelect.value = null;
});
</script>

<template>
  <div
    v-if="isWebFRuntime"
    ref="wrapper"
    class="sl-select-wrap"
    :class="{ 'sl-select-wrap-open': opened }"
  >
    <SlButton
      :key="modelValue"
      class="sl-select-trigger"
      variant="tonal"
      :label="label"
      trailing-icon="expand_more"
      :disabled="disabled"
      @click="toggle"
    />
    <div
      v-if="opened"
      class="sl-select-panel"
      role="listbox"
      :aria-label="ariaLabel || undefined"
      :style="{ width: panelWidth }"
    >
      <div
        v-for="option in rows"
        :key="option.value"
        class="sl-select-option"
        :class="{ 'sl-select-option-on': option.value === modelValue }"
        role="option"
        :aria-selected="option.value === modelValue"
        @click="select(option.value)"
      >
        {{ option.label }}
      </div>
    </div>
  </div>
  <select
    v-else
    class="sl-select"
    :value="modelValue"
    :disabled="disabled"
    :aria-label="ariaLabel"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-if="allowEmpty" value="">{{ placeholder }}</option>
    <option v-for="option in options" :key="option.value" :value="option.value">
      {{ option.label }}
    </option>
  </select>
</template>
