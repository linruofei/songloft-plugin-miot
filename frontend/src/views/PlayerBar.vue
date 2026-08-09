<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { songCoverUrl } from '../covers';
import { openPage } from '../runtime';
import { currentDevice, playerCommand, state } from '../store';
import SlButton from '../ui/SlButton.vue';
import SlIcon from '../ui/SlIcon.vue';
import PlayerProgress from './PlayerProgress.vue';

const coverFailed = ref(false);
const cover = computed(() => coverFailed.value ? '' : songCoverUrl(state.player.current_song, 96));

watch(
  () => [state.player.current_song?.id, state.player.current_song?.cover_url],
  () => { coverFailed.value = false; },
);

function openPlayer(): void {
  openPage('player');
}
</script>

<template>
  <div v-if="currentDevice" class="player-bar-shell">
    <PlayerProgress
      :position="Number(state.player.position || 0)"
      :duration="Number(state.player.duration || 0)"
      mini
    />
    <div class="player-bar" role="button" tabindex="0" aria-label="展开播放器" @click="openPlayer" @keydown.enter="openPlayer">
      <img v-if="cover" class="player-cover" :src="cover" :alt="state.player.current_song?.title || '歌曲封面'" @error="coverFailed = true" />
      <div v-else class="player-cover player-cover-empty"><SlIcon name="music_note" :size="22" player-icon /></div>
      <div class="player-copy">
        <span class="player-title">{{ state.player.current_song?.title || '暂无播放' }}</span>
        <span class="player-subtitle">{{ state.player.current_song?.artist || currentDevice.name || '已选择设备' }}</span>
      </div>
      <div class="player-controls" @click.stop>
        <SlButton variant="icon" icon="skip_previous" player-icon class="player-control-button" title="上一首" :disabled="state.playerBusy" @click="playerCommand('/player/previous')" />
        <SlButton
          class="mini-play-control"
          variant="icon"
          player-icon
          :icon="state.player.is_playing ? 'pause' : 'play_arrow'"
          :title="state.player.is_playing ? '暂停' : '播放'"
          :disabled="state.playerBusy"
          @click="playerCommand('/player/toggle')"
        />
        <SlButton variant="icon" icon="skip_next" player-icon class="player-control-button" title="下一首" :disabled="state.playerBusy" @click="playerCommand('/player/next')" />
      </div>
    </div>
  </div>
</template>
