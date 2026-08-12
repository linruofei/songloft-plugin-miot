<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import SlButton from '../ui/SlButton.vue';
import SlSlider from '../ui/SlSlider.vue';

const props = defineProps<{ modelValue: number; disabled?: boolean }>();
const emit = defineEmits<{ change: [number] }>();

function clampVolume(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

const localVolume = ref(clampVolume(props.modelValue));
const previousVolume = ref(50);
const icon = computed(() => {
  if (localVolume.value <= 0) return 'volume_off';
  if (localVolume.value < 30) return 'volume_mute';
  if (localVolume.value < 70) return 'volume_down';
  return 'volume_up';
});

watch(() => props.modelValue, (value) => { localVolume.value = clampVolume(value); });

function update(value: number): void {
  localVolume.value = clampVolume(value);
}

function commit(value: number): void {
  update(value);
  emit('change', localVolume.value);
}

function toggleMute(): void {
  if (localVolume.value > 0) {
    previousVolume.value = localVolume.value;
    commit(0);
  } else {
    commit(previousVolume.value || 50);
  }
}
</script>

<template>
  <div class="player-volume-inline">
    <SlButton variant="icon" :icon="icon" player-icon class="player-tool-button" :title="localVolume > 0 ? '静音' : '取消静音'" :disabled="disabled" @click="toggleMute" />
    <SlSlider
      class="player-volume-inline-slider"
      :model-value="localVolume"
      :min="0"
      :max="100"
      orientation="horizontal"
      aria-label="设备音量"
      @update:model-value="update"
      @change="commit"
    />
  </div>
</template>
