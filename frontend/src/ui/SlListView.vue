<script setup lang="ts">
import { ref } from 'vue';
import { useNativeList } from '../runtime';

defineProps<{ ariaLabel?: string }>();
const emit = defineEmits<{ scroll: [Event] }>();

/**
 * 滚动位置的读写与 `@scroll` 事件，供 MainPage 的虚拟列表定位窗口用。
 *
 * 原生分支也绑 `@scroll`：WebF 的 `handleScroll` 只在**挂了监听器**时才派发 DOM `scroll`
 * （`_dispatchScrollEvent`），不绑就永远收不到。
 *
 * 实测结论（WebF 0.24.27，真实 miot 构建产物 + 假后端 2000 首歌，#97 修复后首次跑通）：
 *  - 渲染的是 `<webf-list-view>`（非 `div.sl-list-view-html`），`clientHeight` 读得到
 *    （442px），首尾 spacer 与虚拟窗口协同正常（`0px,126016px` ≈ (2000−31)×64）。
 *  - `scrollTop` **读**：实时返回数值，绑定是活的。
 *  - `@scroll` **派发**：写入触发的滚动事件被监听器收到（计数 0→1→2）。
 *  - `scrollTop` **写**：写入后视口确实移动、spacer 重平衡、首行变化（写 32000→
 *    视口下移到第 11 行 / top spacer 变 640px；写 0→回到顶部）。但**写入落点与请求值
 *    不一致**：请求 32000px 实际只滚到 ~640px，且回读值（1439/640）与可见偏移对不上，
 *    疑似 WebF `scrollTop` 绑定的单位/异步落点问题。这不影响 #97（本修复只纠正探测让
 *    原生分支得以启用），但建议另开 issue 复核 `MainPage.scrollToIndex` 在原生列表下的
 *    落点精度（其 120ms 轮询 + 重试兜底可能掩盖了该问题）。
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
