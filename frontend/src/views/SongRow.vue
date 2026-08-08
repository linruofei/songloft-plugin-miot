<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { acquireCoverSlot, songCoverUrl, type CoverSlot } from '../covers';
import type { Song } from '../types';
import { state } from '../store';
import SlButton from '../ui/SlButton.vue';
import SlIcon from '../ui/SlIcon.vue';

const props = defineProps<{ song: Song; index: number }>();
const emit = defineEmits<{ play: [Song, number] }>();
const coverSrc = ref('');
let coverSlot: CoverSlot | null = null;
let coverGeneration = 0;

function isCurrent() { return state.player.current_song?.id === props.song.id; }
function duration(seconds?: number) {
  if (!seconds || seconds < 0) return '';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function releaseCoverSlot(): void {
  coverSlot?.release();
  coverSlot = null;
}

function loadCover(): void {
  const generation = ++coverGeneration;
  releaseCoverSlot();
  coverSrc.value = '';
  const url = songCoverUrl(props.song, 96);
  if (!url) return;

  coverSlot = acquireCoverSlot();
  void coverSlot.promise.then(() => {
    if (generation === coverGeneration) coverSrc.value = url;
  });
}

function finishCoverLoad(): void {
  releaseCoverSlot();
}

function failCoverLoad(): void {
  coverSrc.value = '';
  releaseCoverSlot();
}

watch(() => [props.song.id, props.song.cover_url], loadCover, { immediate: true });
onUnmounted(() => {
  coverGeneration += 1;
  releaseCoverSlot();
});
</script>

<template>
  <div class="song-row" :class="{ 'song-row-current': isCurrent() }">
    <div class="song-index">
      <SlIcon v-if="isCurrent() && state.player.is_playing" name="equalizer" :size="18" />
      <span v-else>{{ index + 1 }}</span>
    </div>
    <div class="song-cover">
      <img
        v-if="coverSrc"
        class="song-cover-img"
        :src="coverSrc"
        :alt="song.title || '歌曲封面'"
        @load="finishCoverLoad"
        @error="failCoverLoad"
      />
      <SlIcon v-else name="music_note" :size="24" />
    </div>
    <div class="song-copy">
      <span class="song-title">{{ song.title || '未知歌曲' }}</span>
      <span class="song-meta">{{ song.artist || '未知艺术家' }}<span v-if="song.album"> · {{ song.album }}</span><span v-if="duration(song.duration)"> · {{ duration(song.duration) }}</span></span>
    </div>
    <div class="song-actions">
      <SlButton variant="icon" icon="play_arrow" title="播放此曲" @click="emit('play', song, index)" />
    </div>
  </div>
</template>
