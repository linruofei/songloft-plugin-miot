<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { acquireCoverSlot, listCoverNonce, songCoverUrl, type CoverSlot } from '../covers';
import type { Song } from '../types';
import { state } from '../store';
import SlButton from '../ui/SlButton.vue';
import SlIcon from '../ui/SlIcon.vue';

const props = defineProps<{ song: Song; index: number }>();
const emit = defineEmits<{ play: [Song, number] }>();
const coverSrc = ref('');
let coverSlot: CoverSlot | null = null;
let coverGeneration = 0;
let coverTimer: ReturnType<typeof setTimeout> | null = null;
let coverWatchdog: ReturnType<typeof setTimeout> | null = null;
let appliedNonce = 0;

/**
 * 并发槽的兜底归还时限。
 *
 * 槽位本来只在 `load` / `error` 时归还，但 WebF 存在**两个事件都不发**的情形
 * （`covers.ts` 注释②：imageCache 驱逐后画着已 dispose 的 ui.Image）。那样每漏一个槽
 * 就少一份并发预算，漏满 3 个之后整个列表的封面就永久停在占位图
 * （songloft-org/songloft-plugin-miot#96「列表封面全空白」）。
 * 到点强制归还只放开预算，不影响那张图自己继续加载。
 */
const COVER_SLOT_WATCHDOG_MS = 6000;

function isCurrent() { return state.player.current_song?.id === props.song.id; }
function duration(seconds?: number) {
  if (!seconds || seconds < 0) return '';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function releaseCoverSlot(): void {
  if (coverWatchdog) {
    clearTimeout(coverWatchdog);
    coverWatchdog = null;
  }
  coverSlot?.release();
  coverSlot = null;
}

function loadCover(): void {
  if (coverTimer) clearTimeout(coverTimer);
  coverTimer = setTimeout(() => {
    coverTimer = null;
    loadCoverNow(false);
  }, 220);
}

function loadCoverNow(isRefresh: boolean): void {
  const generation = ++coverGeneration;
  releaseCoverSlot();
  if (!isRefresh) coverSrc.value = '';
  const url = songCoverUrl(props.song, 96);
  if (!url) return;

  coverSlot = acquireCoverSlot();
  void coverSlot.promise.then(() => {
    if (generation !== coverGeneration) return;
    const n = listCoverNonce.value;
    coverSrc.value = n > 0 ? `${url}${url.includes('?') ? '&' : '?'}_r=${n}` : url;
    appliedNonce = n;
    if (coverWatchdog) clearTimeout(coverWatchdog);
    coverWatchdog = setTimeout(() => {
      coverWatchdog = null;
      if (generation !== coverGeneration) return;
      coverSlot?.release();
      coverSlot = null;
    }, COVER_SLOT_WATCHDOG_MS);
  });
}

function refreshCover(): void {
  if (!coverSrc.value) return;
  if (coverTimer) clearTimeout(coverTimer);
  coverTimer = setTimeout(() => {
    coverTimer = null;
    loadCoverNow(true);
  }, 220);
}

function finishCoverLoad(): void {
  releaseCoverSlot();
}

function failCoverLoad(): void {
  coverSrc.value = '';
  releaseCoverSlot();
}

watch(() => [props.song.id, props.song.cover_url], loadCover, { immediate: true });
watch(listCoverNonce, (n) => {
  if (n > appliedNonce) refreshCover();
});
onUnmounted(() => {
  if (coverTimer) clearTimeout(coverTimer);
  coverGeneration += 1;
  releaseCoverSlot();
});
</script>

<template>
  <div class="song-row" :class="{ 'song-row-current': isCurrent() }">
    <button type="button" class="song-row-button" @click="emit('play', song, index)">
      <span class="song-index">
        <SlIcon v-if="isCurrent() && state.player.is_playing" name="equalizer" :size="18" />
        <span v-else>{{ index + 1 }}</span>
      </span>
      <span class="song-cover">
        <img
          v-if="coverSrc"
          class="song-cover-img"
          :src="coverSrc"
          :alt="song.title || '歌曲封面'"
          @load="finishCoverLoad"
          @error="failCoverLoad"
        />
        <SlIcon v-else name="music_note" :size="24" />
      </span>
      <span class="song-copy">
        <span class="song-title">{{ song.title || '未知歌曲' }}</span>
        <span class="song-meta">{{ song.artist || '未知艺术家' }}<span v-if="song.album"> · {{ song.album }}</span><span v-if="duration(song.duration)"> · {{ duration(song.duration) }}</span></span>
      </span>
    </button>
    <div class="song-actions">
      <SlButton variant="icon" icon="play_arrow" title="播放此曲" @click="emit('play', song, index)" />
    </div>
  </div>
</template>
