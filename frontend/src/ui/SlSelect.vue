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
const scrollStyle = ref<Record<string, string>>({});
const id = nextSelectId();
// positionPanel 内部滚动让位时置位，用来吞掉由此产生的 scroll 回调，避免自激
let repositioning = false;
const opened = computed(() => openSelect.value === id);
const label = computed(
  () => props.options.find((option) => option.value === props.modelValue)?.label || props.placeholder,
);
const rows = computed(() =>
  props.allowEmpty
    ? [{ value: '', label: props.placeholder }, ...props.options]
    : props.options,
);

const PANEL_MAX_H = 320;
const PANEL_GAP = 4;
const VIEWPORT_EDGE = 8;
// 下方至少要放得下这么多项，才认为「向下展开」是有意义的
const MIN_ROWS_BELOW = 3;

// 逐级向上试着滚动，返回真正滚动了多少。刻意不用 getComputedStyle 判 overflow：
// 设置页真正的滚动容器是 .settings-scroll-body 而不是 documentElement，而「设了
// scrollTop 后值有没有变」这个判据不依赖引擎对 overflow 的计算值，更稳。
function scrollNearestBy(el: HTMLElement, delta: number): number {
  const candidates: HTMLElement[] = [];
  for (let node = el.parentElement; node; node = node.parentElement) candidates.push(node);
  candidates.push(document.documentElement, document.body);
  for (const node of candidates) {
    if (!node) continue;
    const before = node.scrollTop;
    node.scrollTop = before + delta;
    if (node.scrollTop !== before) return node.scrollTop - before;
  }
  return 0;
}

// 面板用 position: fixed + JS 坐标，逃逸滚动容器裁切。WebF 里 fixed 确实锚定视口、
// getBoundingClientRect 也确实返回视口坐标，两者自洽，所以这套算法在 WebF 下成立。
//
// allowScroll 只在「刚打开」时为 true：APP 里插件视口只有 ~520 逻辑 px 高（宿主
// appbar + 底部导航吃掉其余），表单靠下的下拉一定满足 spaceBelow < 320，旧逻辑会
// 无条件翻到上方、把整个表单盖住，看起来就是「列表飘在控件上面」
// （songloft-org/songloft-plugin-miot#80）。所以这里先滚动让出下方空间再定位。
// 面板打开期间的 resize/scroll 重定位传 false —— 否则用户每次滚动都会被我们反向
// 拽回去，跟手势打架。
function positionPanel(allowScroll = false): void {
  const el = wrapper.value;
  if (!el) return;
  const itemH = window.innerWidth < 600 ? 40 : 44;
  const desiredH = Math.min(PANEL_MAX_H, Math.max(itemH, rows.value.length * itemH + 8));
  const minBelowH = Math.min(desiredH, itemH * MIN_ROWS_BELOW + 8);

  let rect = el.getBoundingClientRect();
  let spaceBelow = window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_EDGE;
  if (allowScroll && spaceBelow < minBelowH) {
    // 滚动会触发已注册的 scroll 监听 → handleViewportChange → positionPanel，挡掉自激
    repositioning = true;
    try {
      if (scrollNearestBy(el, minBelowH - spaceBelow) > 0) {
        rect = el.getBoundingClientRect();
        spaceBelow = window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_EDGE;
      }
    } finally {
      repositioning = false;
    }
  }
  const spaceAbove = rect.top - PANEL_GAP - VIEWPORT_EDGE;
  const placeBelow = spaceBelow >= minBelowH || spaceBelow >= spaceAbove;
  // 高度必须夹到该侧真实可用空间：旧逻辑恒用 320，超出的部分要么被视口裁掉、
  // 要么盖住上方内容
  const height = Math.max(itemH, Math.min(desiredH, placeBelow ? spaceBelow : spaceAbove));
  const top = placeBelow
    ? rect.bottom + PANEL_GAP
    : Math.max(VIEWPORT_EDGE, rect.top - height - PANEL_GAP);
  const left = Math.max(
    VIEWPORT_EDGE,
    Math.min(rect.left, window.innerWidth - rect.width - VIEWPORT_EDGE),
  );
  panelStyle.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${Math.round(rect.width)}px`,
  };
  // 高度给内层滚动容器，不能给 fixed 的外层（见 style.css .sl-select-panel 注释）。
  // 减 2 是外层的上下边框，让整体不超出算出来的可用空间。
  scrollStyle.value = { maxHeight: `${Math.round(height) - 2}px` };
}

function toggle() {
  if (props.disabled) return;
  if (opened.value) {
    openSelect.value = null;
    return;
  }
  openSelect.value = id;
  nextTick(() => positionPanel(true));
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
  if (!opened.value || repositioning) return;
  positionPanel(false);
}
// scroll 不冒泡，但 window 上的 capture 监听照样能收到后代元素的 scroll。面板内部
// 滚动不该触发重定位：位置本来就没变，白跑一次还会跟滚动手势抖动。
// 单独一个 handler 而不是在 handleViewportChange 里判 target —— resize 的 target 是
// window，不是 Node，喂给 contains() 不安全。
function onViewportScroll(event: Event) {
  const target = event.target as Node | null;
  if (target && panel.value?.contains(target)) return;
  handleViewportChange();
}

watch(opened, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeydown, true);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', onViewportScroll, true);
  } else {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('resize', handleViewportChange);
    window.removeEventListener('scroll', onViewportScroll, true);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown, true);
  document.removeEventListener('keydown', onKeydown, true);
  window.removeEventListener('resize', handleViewportChange);
  window.removeEventListener('scroll', onViewportScroll, true);
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
      :style="panelStyle"
    >
      <div
        class="sl-select-panel-scroll"
        role="listbox"
        :aria-label="ariaLabel || undefined"
        :style="scrollStyle"
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
