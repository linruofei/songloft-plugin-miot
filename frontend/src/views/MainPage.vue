<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import AppBar from './AppBar.vue';
import DevicePicker from './DevicePicker.vue';
import PlayerBar from './PlayerBar.vue';
import SongRow from './SongRow.vue';
import SlButton from '../ui/SlButton.vue';
import SlIcon from '../ui/SlIcon.vue';
import SlInput from '../ui/SlInput.vue';
import SlListView from '../ui/SlListView.vue';
import SlSelect from '../ui/SlSelect.vue';
import { navigation, openPage } from '../runtime';
import { currentDevice, deviceName, messageOf, playSong, refreshAll, selectPlaylist, state, visibleSongs } from '../store';
import type { SelectOption, Song } from '../types';

const showDevicePicker = ref(false);
const search = ref('');
const playlistOptions = computed<SelectOption[]>(() => state.playlists.map((p) => ({ value: String(p.id), label: p.name, description: `${p.song_count ?? 0} 首歌曲` })));
const noServerHint = computed(() => !state.config.server_host || state.config.server_host_status === 'loopback');
const listMeasureRetries = 6;
let listMeasureTimer: ReturnType<typeof setTimeout> | null = null;
let mounted = false;

function measureListHeight(attempt = 0): void {
  if (!mounted) return;
  const list = document.querySelector<HTMLElement>('.sl-list-view');
  const player = document.querySelector<HTMLElement>('.player-bar-shell');
  const listTop = list?.getBoundingClientRect().top || 0;
  const listBottom = player?.getBoundingClientRect().top || window.innerHeight - 16;
  if (list && listTop > 0 && listBottom > listTop) {
    list.style.height = `${Math.max(128, Math.round(listBottom - listTop))}px`;
    return;
  }
  if (attempt < listMeasureRetries) {
    listMeasureTimer = setTimeout(() => measureListHeight(attempt + 1), 32 * (attempt + 1));
  }
}

function remeasureList(): void {
  if (listMeasureTimer) clearTimeout(listMeasureTimer);
  void nextTick(() => measureListHeight());
}

async function onPlaylist(value: string) { await selectPlaylist(value); }
async function play(song: Song, index: number) {
  try { await playSong(song, index); } catch (error) { /* store already presents the error */ notifyLocal(error); }
}
function notifyLocal(error: unknown) { console.warn('[miot] play failed', messageOf(error)); }
function locateCurrentSong() {
  document.querySelector('.song-row-current')?.scrollIntoView({ block: 'center' });
}
watch(
  () => [state.selectedPlaylistId, state.songsLoading, state.songsError, visibleSongs.value.length, !!currentDevice.value, noServerHint.value],
  remeasureList,
);
onMounted(() => {
  mounted = true;
  window.addEventListener('resize', remeasureList);
  remeasureList();
});
onUnmounted(() => {
  mounted = false;
  window.removeEventListener('resize', remeasureList);
  if (listMeasureTimer) clearTimeout(listMeasureTimer);
});
</script>

<template>
  <div class="miot-main-appbar">
    <div class="miot-main-appbar-inner">
      <AppBar title="MIoT 智能音箱" :subtitle="currentDevice ? `${deviceName(currentDevice)} · ${state.player.is_playing ? '播放中' : '待机'}` : '请选择播放设备'">
        <SlButton variant="icon" icon="speaker_group" title="选择设备" @click="showDevicePicker = true" />
        <SlButton variant="icon" icon="refresh" title="刷新" :disabled="state.refreshing" @click="refreshAll" />
        <SlButton variant="icon" icon="settings" title="设置" @click="openPage('settings')" />
      </AppBar>
    </div>
  </div>

  <main class="miot-page" :class="{ 'miot-page-with-player': currentDevice }">

    <div v-if="noServerHint" class="status-panel">
      <div class="inline-fields">
        <SlIcon name="info" :size="18" />
        <span>{{ state.config.server_host_status === 'loopback' ? '服务器地址是本地回环地址，音箱无法访问。请在设置中改为局域网地址。' : '请先在设置中配置音箱可访问的 Songloft 服务器地址。' }}</span>
        <SlButton variant="text" label="去设置" @click="navigation.settingsCategory = 'device'; openPage('settings')" />
      </div>
    </div>

    <div class="player-toolbar">
      <div class="toolbar-field">
        <SlSelect :model-value="state.selectedPlaylistId" :options="playlistOptions" placeholder="选择歌单" allow-empty aria-label="选择歌单" @update:model-value="onPlaylist" />
      </div>
    </div>

    <div v-if="state.selectedPlaylistId" class="search-bar">
      <SlIcon name="search" :size="20" />
      <SlInput v-model="search" aria-label="搜索歌曲" placeholder="搜索歌曲、艺术家或专辑" @update:model-value="state.songSearch = search" />
      <SlButton variant="icon" icon="my_location" title="定位当前播放" @click="locateCurrentSong" />
    </div>

    <SlListView v-if="state.selectedPlaylistId && !state.songsLoading && !state.songsError" :height="'var(--miot-list-height)'" aria-label="歌曲列表">
      <SongRow v-for="(song, index) in visibleSongs" :key="song.id" :song="song" :index="index" @play="play" />
      <div v-if="visibleSongs.length === 0" class="song-list-empty">没有匹配的歌曲</div>
    </SlListView>
    <div v-else-if="state.songsLoading" class="song-list-empty"><span class="loading-spinner"></span><span>正在加载歌曲</span></div>
    <div v-else-if="state.songsError" class="song-list-empty"><span>{{ state.songsError }}</span><SlButton variant="text" label="重试" @click="selectPlaylist(state.selectedPlaylistId)" /></div>
    <div v-else class="song-list-empty"><div><SlIcon name="queue_music" :size="34" /><p>选择歌单后开始播放</p></div></div>

    <PlayerBar />

  </main>
  <DevicePicker v-if="showDevicePicker" @close="showDevicePicker = false" />
</template>
