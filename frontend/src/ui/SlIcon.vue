<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ name: string; size?: number; playerIcon?: boolean }>();

const playerIconCodePoints: Record<string, number> = {
  alarm: 0xf553,
  alarm_on: 0xf552,
  edit: 0xf6fb,
  equalizer: 0xf711,
  favorite: 0xe25b,
  favorite_border: 0xe25c,
  format_list_numbered: 0xf793,
  keyboard_arrow_down: 0xf82b,
  looks_one_outlined: 0xf19e,
  music_note: 0xf8ed,
  pause: 0xf0056,
  play_arrow: 0xf00a0,
  queue_music: 0xf00d0,
  repeat: 0xf00f7,
  repeat_one: 0xf00f6,
  schedule: 0xf012b,
  shuffle: 0xf0177,
  skip_next: 0xf0192,
  skip_previous: 0xf0193,
  stop: 0xf01dc,
  volume_down: 0xf0297,
  volume_mute: 0xf0298,
  volume_off: 0xf0299,
  volume_up: 0xf029a,
};

const playerGlyph = computed(() => {
  const codePoint = props.playerIcon ? playerIconCodePoints[props.name] : undefined;
  return codePoint === undefined ? props.name : String.fromCodePoint(codePoint);
});
const usesPlayerFont = computed(
  () => props.playerIcon && playerIconCodePoints[props.name] !== undefined,
);
</script>

<template>
  <span
    class="material-symbols-outlined sl-icon"
    :class="{ 'sl-icon-material-player': usesPlayerFont }"
    aria-hidden="true"
    :style="size ? { fontSize: `${size}px` } : undefined"
  >{{ playerGlyph }}</span>
</template>
