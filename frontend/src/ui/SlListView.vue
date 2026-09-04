<script setup lang="ts">
import { ref } from 'vue';
import { useNativeList } from '../runtime';

defineProps<{ ariaLabel?: string }>();
const emit = defineEmits<{ scroll: [Event] }>();

/**
 * 滚动位置的读写与 `@scroll` 事件，供 MainPage 的虚拟列表定位窗口用。
 *
 * 原生分支也绑 `@scroll`：WebF 的 `handleScroll` 只在**挂了监听器**时才派发 DOM `scroll`
 * （`_dispatchScrollEvent`），不绑就永远收不到。`scrollTop` 读写按源码应当可用
 * （`WebFListViewElement` 覆写 `scrollControllerY`，`ElementOverflowMixin` 的 `scrollTop`
 * 读写都走它），但**这条分支目前跑不到、因此未经实测**：`runtime.ts` 的
 * `hasNativeElement()` 用 `property in el` 探测，而 WebF 的绑定属性取值拿得到、`in` 却
 * 返回 false，于是 `useNativeList` 在 WebF 下恒为 false，实际渲染的一直是下面那个
 * `div.sl-list-view-html`（已在真实 WebF 里逐项验证）。哪天探测修好了再回来实测原生分支。
 */
const root = ref<HTMLElement | null>(null);

/** 当前滚动位置（px）。列表尚未布局时为 0。 */
function scrollTop(): number {
  return root.value?.scrollTop ?? 0;
}

/** 滚到指定位置。WebF 布局是异步的，列表还没有滚动范围时这次写入会被忽略，调用方需自行校验。 */
function setScrollTop(value: number): void {
  if (!root.value) return;
  root.value.scrollTop = Math.max(0, Math.round(value));
}

/** 可视区高度（px）。用来决定虚拟窗口要渲染多少行。 */
function clientHeight(): number {
  return root.value?.clientHeight ?? 0;
}

defineExpose({ scrollTop, setScrollTop, clientHeight });
</script>

<template>
  <webf-list-view
    v-if="useNativeList"
    ref="root"
    class="sl-list-view"
    shrink-wrap="false"
    scroll-direction="vertical"
    :aria-label="ariaLabel"
    @scroll="emit('scroll', $event)"
  >
    <slot />
  </webf-list-view>
  <div v-else ref="root" class="sl-list-view sl-list-view-html" :aria-label="ariaLabel" @scroll="emit('scroll', $event)">
    <slot />
  </div>
</template>
