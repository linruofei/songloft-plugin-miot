<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
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
const panel = ref<HTMLElement | null>(null);
const panelStyle = ref<Record<string, string>>({});
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

// 面板用 position: fixed + JS 坐标，逃逸滚动容器裁切并按空间上下翻转。
function positionPanel(): void {
  const el = wrapper.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const maxH = 320;
  const gap = 4;
  const itemH = window.innerWidth < 600 ? 40 : 44;
  const panelH = Math.min(maxH, Math.max(itemH, rows.value.length * itemH + 8));
  const spaceBelow = window.innerHeight - rect.bottom - gap;
  const spaceAbove = rect.top - gap;
  const placeBelow = spaceBelow >= panelH || spaceBelow >= spaceAbove;
  const top = placeBelow ? rect.bottom + gap : Math.max(gap, rect.top - panelH - gap);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));
  panelStyle.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${Math.round(rect.width)}px`,
    maxHeight: `${maxH}px`,
  };
}

function toggle() {
  if (props.disabled) return;
  if (opened.value) {
    openSelect.value = null;
    return;
  }
  openSelect.value = id;
  nextTick(positionPanel);
}
function select(value: string) {
  openSelect.value = null;
  emit('update:modelValue', value);
}

// 点外部 / Esc 关闭：此前 webf 自定义下拉没有这些处理，打开后点别处面板一直不消失。
function onPointerDown(event: PointerEvent) {
  if (!opened.value) return;
  const target = event.target as Node | null;
  if (wrapper.value?.contains(target) || panel.value?.contains(target)) return;
  openSelect.value = null;
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && opened.value) openSelect.value = null;
}
function handleViewportChange() {
  if (opened.value) positionPanel();
}

watch(opened, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeydown, true);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
  } else {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('resize', handleViewportChange);
    window.removeEventListener('scroll', handleViewportChange, true);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown, true);
  document.removeEventListener('keydown', onKeydown, true);
  window.removeEventListener('resize', handleViewportChange);
  window.removeEventListener('scroll', handleViewportChange, true);
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
      class="sl-select-backdrop"
      @click="openSelect = null"
    ></div>
    <div
      v-if="opened"
      ref="panel"
      class="sl-select-panel sl-select-panel-fixed"
      role="listbox"
      :aria-label="ariaLabel || undefined"
      :style="panelStyle"
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
