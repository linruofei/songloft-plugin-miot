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
import { openSelect } from '../ui/selectState';
import { navigation, openPage } from '../runtime';
import { currentDevice, deviceName, messageOf, playlistLabel, playSong, refreshAll, selectPlaylist, state, visibleSongs } from '../store';
import type { SelectOption, Song } from '../types';

const search = ref('');
const songRenderLimit = ref(20);
const songRenderBatchSize = 40;
const playlistOptions = computed<SelectOption[]>(() => state.playlists.map((p) => ({ value: String(p.id), label: playlistLabel(p) })));
const renderedSongs = computed(() => visibleSongs.value.slice(0, songRenderLimit.value));
const noServerHint = computed(() => !state.config.server_host || state.config.server_host_status === 'loopback');
const listMeasureRetries = 6;
let listMeasureTimer: ReturnType<typeof setTimeout> | null = null;
let locateTimer: ReturnType<typeof setTimeout> | null = null;
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
function resetSongRenderLimit(): void { songRenderLimit.value = 20; }
function loadMoreSongs(event: Event): void {
  const target = event.currentTarget as HTMLElement | null;
  if (!target || songRenderLimit.value >= visibleSongs.value.length) return;
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 160) {
    songRenderLimit.value = Math.min(songRenderLimit.value + songRenderBatchSize, visibleSongs.value.length);
  }
}
function openDevicePicker() {
  openSelect.value = null;
  navigation.devicePickerOpen = true;
}
async function play(song: Song, index: number) {
  try { await playSong(song, index); } catch (error) { /* store already presents the error */ notifyLocal(error); }
}
function notifyLocal(error: unknown) { console.warn('[miot] play failed', messageOf(error)); }
function scrollToCurrentSong(attempt = 0): void {
  if (!mounted) return;
  const list = document.querySelector<HTMLElement>('.sl-list-view');
  const row = document.querySelector<HTMLElement>('.song-row-current');
  if (!list || !row) return;
  const listRect = list.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  // WebF 布局是异步的：nextTick 只保证 Vue patch 完成，新插入的行此刻可能仍是零尺寸，
  // 直接拿零值计算会把 scrollTop 冲到负值（被钳制为 0），表现为"始终跳回第一屏"。
  if (rowRect.height <= 0 || list.clientHeight <= 0) {
    if (attempt < listMeasureRetries) locateTimer = setTimeout(() => scrollToCurrentSong(attempt + 1), 32 * (attempt + 1));
    return;
  }
  list.scrollTop += rowRect.top - listRect.top - (list.clientHeight - rowRect.height) / 2;
}
function locateCurrentSong() {
  const currentIndex = visibleSongs.value.findIndex((song) => song.id === state.player.current_song?.id);
  if (currentIndex < 0) return;
  if (currentIndex >= songRenderLimit.value) songRenderLimit.value = Math.min(currentIndex + songRenderBatchSize, visibleSongs.value.length);
  if (locateTimer) clearTimeout(locateTimer);
  void nextTick(() => scrollToCurrentSong());
}
watch(() => [state.selectedPlaylistId, state.songSearch], resetSongRenderLimit);
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
  if (locateTimer) clearTimeout(locateTimer);
});
</script>

<template>
  <div class="miot-main-appbar">
    <div class="miot-main-appbar-inner">
      <AppBar title="MIoT 智能音箱" :subtitle="state.deviceConnecting ? '正在连接音箱…' : currentDevice ? `${deviceName(currentDevice)} · ${state.player.is_playing ? '播放中' : '待机'}` : '请选择播放设备'">
        <SlButton variant="icon" icon="speaker_group" title="选择设备" @click="openDevicePicker" />
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
      <SlInput :model-value="search" aria-label="搜索歌曲" placeholder="搜索歌曲、艺术家或专辑" @update:model-value="(v) => { search = v; state.songSearch = v; }" />
      <SlButton v-if="search" variant="icon" icon="close" title="清除搜索" @click="search = ''; state.songSearch = ''" />
      <SlButton variant="icon" icon="my_location" title="定位当前播放" @click="locateCurrentSong" />
    </div>

    <SlListView v-if="state.selectedPlaylistId && !state.songsLoading && !state.songsError" aria-label="歌曲列表" @scroll="loadMoreSongs">
      <SongRow v-for="(song, index) in renderedSongs" :key="song.id" :song="song" :index="index" @play="play" />
      <div v-if="visibleSongs.length === 0" class="song-list-empty">没有匹配的歌曲</div>
    </SlListView>
    <div v-else-if="state.songsLoading" class="song-list-empty"><span class="loading-spinner"></span><span>正在加载歌曲</span></div>
    <div v-else-if="state.songsError" class="song-list-empty"><span>{{ state.songsError }}</span><SlButton variant="text" label="重试" @click="selectPlaylist(state.selectedPlaylistId)" /></div>
    <div v-else class="song-list-empty"><div><SlIcon name="queue_music" :size="34" /><p>选择歌单后开始播放</p></div></div>

    <PlayerBar />

  </main>
  <DevicePicker v-if="navigation.devicePickerOpen" @close="navigation.devicePickerOpen = false" />
</template>
