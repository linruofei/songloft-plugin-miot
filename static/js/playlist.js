/**
 * 歌单管理模块
 * 负责歌单加载、歌曲列表加载、歌单播放
 */

const { apiGet, apiPost } = SongloftPlugin;
import { showSnackbar, showLoading, hideLoading, showResult, getAccountId, getDeviceId, formatDuration } from './utils.js';
import { loadDeviceStatus } from './playback.js';
import { initPlaylistSearch, initSongSearch } from './search.js';

const COVER_FETCH_TIMEOUT_MS = 8000;
const MAX_COVER_FETCH_CONCURRENCY = 3;
const MAX_COVER_RETRIES = 2;          // 失败/超时后最多重试次数（远程封面首访较慢/易限流）
const COVER_RETRY_DELAY_MS = 1500;    // 每次重试前的延迟

const coverQueue = [];
let activeCoverFetches = 0;

const coverObserver = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            coverObserver.unobserve(entry.target);
            // 观察的是可见容器 .song-item-cover-wrap，真正要填充的 img 挂在 _coverImg 上
            const img = entry.target._coverImg;
            const url = img && img.dataset.coverUrl;
            if (img && url) enqueueCoverLoad(img, url);
        });
    }, { rootMargin: '240px 0px' })
    : null;

/**
 * 用插件 token 认证 fetch 封面资源
 * @param {string} url
 * @returns {Promise<Blob|null>}
 */
function fetchCoverWithAuth(url, timeoutMs = COVER_FETCH_TIMEOUT_MS) {
    const { getAuthToken } = SongloftPlugin;
    const token = getAuthToken();
    const headers = {};
    if (token) {
        headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const options = { headers };
    let timeoutId = null;
    if (controller && timeoutMs > 0) {
        options.signal = controller.signal;
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    return fetch(url, options).then(res => {
        if (!res.ok) throw new Error('fetch failed: ' + res.status);
        return res.blob();
    }).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
    });
}

function scheduleCoverLoad(img, url) {
    img.dataset.coverUrl = url;
    if (coverObserver) {
        // img 初始 display:none（无 src 时用占位音符），display:none 元素永远不会被
        // IntersectionObserver 命中，故改为观察其可见容器 .song-item-cover-wrap。
        const target = img.parentElement || img;
        target._coverImg = img;
        coverObserver.observe(target);
    } else {
        enqueueCoverLoad(img, url);
    }
}

function enqueueCoverLoad(img, url) {
    if (!img || !url || img.dataset.coverQueued === '1') return;
    img.dataset.coverQueued = '1';
    coverQueue.push({ img, url, attempt: 0 });
    drainCoverQueue();
}

function drainCoverQueue() {
    while (activeCoverFetches < MAX_COVER_FETCH_CONCURRENCY && coverQueue.length > 0) {
        const task = coverQueue.shift();
        if (!task.img.isConnected || task.img.dataset.coverUrl !== task.url) {
            continue;
        }

        activeCoverFetches++;
        fetchCoverWithAuth(task.url)
            .then(blob => renderCoverBlob(task.img, task.url, blob))
            .catch(() => {
                // 封面获取失败/超时：远程封面首访较慢，延迟重试若干次后再放弃（保持占位图标）
                scheduleCoverRetry(task);
            })
            .finally(() => {
                activeCoverFetches--;
                drainCoverQueue();
            });
    }
}

// 失败重试：图片仍在 DOM 且 url 未被新封面覆盖时，延迟后重新入队，最多 MAX_COVER_RETRIES 次
function scheduleCoverRetry(task) {
    const attempt = task.attempt || 0;
    if (attempt >= MAX_COVER_RETRIES) return;
    if (!task.img.isConnected || task.img.dataset.coverUrl !== task.url) return;
    setTimeout(() => {
        if (!task.img.isConnected || task.img.dataset.coverUrl !== task.url) return;
        coverQueue.push({ img: task.img, url: task.url, attempt: attempt + 1 });
        drainCoverQueue();
    }, COVER_RETRY_DELAY_MS);
}

function renderCoverBlob(img, url, blob) {
    if (!blob || !img.isConnected || img.dataset.coverUrl !== url) return;
    const reader = new FileReader();
    reader.onload = () => {
        if (img.isConnected && img.dataset.coverUrl === url) {
            img.src = reader.result;
        }
    };
    reader.readAsDataURL(blob);
}

function cancelQueuedCovers(container) {
    if (!container) return;
    if (coverObserver) {
        container.querySelectorAll('.song-item-cover-wrap').forEach(wrap => coverObserver.unobserve(wrap));
    }
    for (let i = coverQueue.length - 1; i >= 0; i--) {
        if (container.contains(coverQueue[i].img)) {
            coverQueue.splice(i, 1);
        }
    }
}

// ========== 虚拟滚动 ==========

const ITEM_HEIGHT = 73;
const ITEM_GAP = 8;
const ITEM_STRIDE = ITEM_HEIGHT + ITEM_GAP;
const OVERSCAN = 5;
const VS_THRESHOLD = 100;

let virtualSongList = null;

export function getVirtualSongList() { return virtualSongList; }

function createSongItem(song, originalIndex, displayIndex) {
    const item = document.createElement('div');
    item.className = 'song-item';
    item.setAttribute('data-index', originalIndex);
    item.setAttribute('data-song-id', song.id);

    const coverWrap = document.createElement('div');
    coverWrap.className = 'song-item-cover-wrap';
    const coverImg = document.createElement('img');
    coverImg.className = 'song-item-cover';
    coverImg.alt = song.title;
    const coverPlaceholder = document.createElement('span');
    coverPlaceholder.className = 'material-symbols-outlined song-item-cover-placeholder';
    coverPlaceholder.textContent = 'music_note';
    coverWrap.appendChild(coverImg);
    coverWrap.appendChild(coverPlaceholder);
    if (song.cover_url) {
        scheduleCoverLoad(coverImg, song.cover_url);
    }
    item.appendChild(coverWrap);

    const indexSpan = document.createElement('span');
    indexSpan.className = 'song-item-index';
    indexSpan.textContent = (displayIndex + 1);

    const textDiv = document.createElement('div');
    textDiv.className = 'song-item-content';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'song-item-title';
    titleDiv.textContent = song.title;

    const artistDiv = document.createElement('div');
    artistDiv.className = 'song-item-subtitle';
    artistDiv.textContent = song.artist || '未知艺术家';

    textDiv.appendChild(titleDiv);
    textDiv.appendChild(artistDiv);

    item.appendChild(indexSpan);
    item.appendChild(textDiv);

    if (song.duration) {
        const durationSpan = document.createElement('span');
        durationSpan.className = 'song-item-duration';
        durationSpan.textContent = formatDuration(song.duration);
        item.appendChild(durationSpan);
    }

    item.addEventListener('click', () => {
        playSongAtIndex(originalIndex, song.id);
    });

    return item;
}

class VirtualSongList {
    constructor(container) {
        this.container = container;
        this.allSongs = [];
        this.filteredIndices = [];
        this.activeOriginalIndex = -1;
        this.activeSongId = -1;
        this.renderedStart = -1;
        this.renderedEnd = -1;
        this.spacer = null;
        this.enabled = false;
        this._raf = null;
        this._onScroll = () => {
            if (this._raf) return;
            this._raf = requestAnimationFrame(() => {
                this._raf = null;
                this.render();
            });
        };
    }

    init(songs) {
        this.allSongs = songs;
        this.filteredIndices = [];
        for (let i = 0; i < songs.length; i++) this.filteredIndices.push(i);
        this.enabled = true;

        this.container.classList.add('virtual-scroll');

        this.spacer = document.createElement('div');
        this.spacer.className = 'song-list-spacer';
        this._updateSpacerHeight();
        this.container.appendChild(this.spacer);

        this.container.addEventListener('scroll', this._onScroll, { passive: true });
        this.render();
    }

    _updateSpacerHeight() {
        const total = this.filteredIndices.length;
        const h = total > 0 ? total * ITEM_STRIDE - ITEM_GAP : 0;
        this.spacer.style.height = h + 'px';
    }

    render() {
        if (!this.enabled) return;
        const scrollTop = this.container.scrollTop;
        const viewportHeight = this.container.clientHeight;

        let startIdx = Math.floor(scrollTop / ITEM_STRIDE) - OVERSCAN;
        let endIdx = Math.ceil((scrollTop + viewportHeight) / ITEM_STRIDE) + OVERSCAN;
        startIdx = Math.max(0, startIdx);
        endIdx = Math.min(this.filteredIndices.length, endIdx);

        if (startIdx === this.renderedStart && endIdx === this.renderedEnd) return;

        // Remove items outside the new range
        const existingItems = this.container.querySelectorAll('.song-item');
        existingItems.forEach(el => {
            const vIdx = parseInt(el.getAttribute('data-vindex'), 10);
            if (vIdx < startIdx || vIdx >= endIdx) {
                if (coverObserver) {
                    const wrap = el.querySelector('.song-item-cover-wrap');
                    if (wrap) coverObserver.unobserve(wrap);
                }
                el.remove();
            }
        });

        // Build a set of currently rendered vindices
        const rendered = new Set();
        this.container.querySelectorAll('.song-item').forEach(el => {
            rendered.add(parseInt(el.getAttribute('data-vindex'), 10));
        });

        // Add new items
        for (let vi = startIdx; vi < endIdx; vi++) {
            if (rendered.has(vi)) continue;
            const origIdx = this.filteredIndices[vi];
            const song = this.allSongs[origIdx];
            const item = createSongItem(song, origIdx, vi);
            item.setAttribute('data-vindex', vi);
            item.style.top = (vi * ITEM_STRIDE) + 'px';
            if (origIdx === this.activeOriginalIndex ||
                (this.activeSongId > 0 && song.id === this.activeSongId)) {
                item.classList.add('active');
            }
            this.container.appendChild(item);
        }

        this.renderedStart = startIdx;
        this.renderedEnd = endIdx;
    }

    filter(keyword) {
        this.filteredIndices = [];
        const kw = (keyword || '').toLowerCase();
        for (let i = 0; i < this.allSongs.length; i++) {
            if (!kw) {
                this.filteredIndices.push(i);
                continue;
            }
            const s = this.allSongs[i];
            const title = (s.title || '').toLowerCase();
            const artist = (s.artist || '').toLowerCase();
            if (title.includes(kw) || artist.includes(kw)) {
                this.filteredIndices.push(i);
            }
        }
        this._updateSpacerHeight();
        this.container.scrollTop = 0;
        this._clearRenderedItems();
        this.render();
    }

    scrollToItem(originalIndex, songId, options) {
        const force = !!(options && options.force);
        const normSongId = songId || -1;

        // 歌曲未变化时仅确保高亮正确，不滚动、不重建（修复 songloft-org/songloft#369）
        if (!force &&
            originalIndex === this.activeOriginalIndex &&
            normSongId === this.activeSongId) {
            this._ensureHighlight(originalIndex, normSongId);
            return;
        }

        this.activeOriginalIndex = originalIndex;
        this.activeSongId = normSongId;

        // Remove old highlights
        this.container.querySelectorAll('.song-item.active').forEach(el => el.classList.remove('active'));

        // Find display index — try songId first for robustness
        let displayIdx = -1;
        if (songId) {
            for (let vi = 0; vi < this.filteredIndices.length; vi++) {
                if (this.allSongs[this.filteredIndices[vi]].id === songId) {
                    displayIdx = vi;
                    break;
                }
            }
        }
        if (displayIdx < 0) {
            displayIdx = this.filteredIndices.indexOf(originalIndex);
        }
        if (displayIdx < 0) return;

        // Scroll to center the item
        const targetTop = displayIdx * ITEM_STRIDE;
        const viewportHeight = this.container.clientHeight;
        this.container.scrollTop = Math.max(0, targetTop - viewportHeight / 2 + ITEM_HEIGHT / 2);

        // Force re-render then highlight
        this._clearRenderedItems();
        this.render();

        // Highlight the target
        let target = this.container.querySelector('.song-item[data-song-id="' + songId + '"]');
        if (!target) {
            target = this.container.querySelector('.song-item[data-index="' + originalIndex + '"]');
        }
        if (target) target.classList.add('active');
    }

    _ensureHighlight(originalIndex, songId) {
        const items = this.container.querySelectorAll('.song-item');
        items.forEach(el => {
            const matchById = songId > 0 && el.getAttribute('data-song-id') === String(songId);
            const matchByIdx = el.getAttribute('data-index') === String(originalIndex);
            el.classList.toggle('active', matchById || matchByIdx);
        });
    }

    _clearRenderedItems() {
        cancelQueuedCovers(this.container);
        const items = this.container.querySelectorAll('.song-item');
        items.forEach(el => el.remove());
        this.renderedStart = -1;
        this.renderedEnd = -1;
    }

    destroy() {
        this.container.removeEventListener('scroll', this._onScroll);
        if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
        cancelQueuedCovers(this.container);
        this.container.innerHTML = '';
        this.container.classList.remove('virtual-scroll');
        this.enabled = false;
        this.allSongs = [];
        this.filteredIndices = [];
    }
}

/**
 * HTML 转义辅助函数
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的安全 HTML 文本
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 检查错误信息是否与服务器地址配置相关
 * @param {string} message - 错误信息
 * @returns {boolean}
 */
function isServerHostError(message) {
    if (!message) return false;
    const keywords = ['服务器地址', 'server host', '回环地址', 'localhost', 'loopback'];
    const lowerMsg = message.toLowerCase();
    return keywords.some(kw => lowerMsg.includes(kw.toLowerCase()));
}

/**
 * 打开/关闭歌单选择弹出层
 * @param {HTMLElement} trigger - 触发元素
 */
export function togglePlaylistSelectPanel(trigger) {
    const panel = document.getElementById('playlistSelectPanel');
    const backdrop = document.getElementById('playlistSelectBackdrop');
    const arrow = document.querySelector('.playlist-selector-arrow');

    if (panel.classList.contains('show')) {
        closePlaylistSelectPanel();
        return;
    }

    // 定位面板在选择栏下方
    const rect = trigger.getBoundingClientRect();
    panel.style.top = rect.bottom + 'px';

    backdrop.style.display = 'block';
    panel.classList.add('show');
    if (arrow) arrow.classList.add('expanded');

    const searchInput = document.getElementById('playlistSearchInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
        // 不自动聚焦搜索框：避免打开歌单下拉时调起输入法，导致下拉面板被压缩不便选择
        // (songloft-org/songloft#320)
    }
}

/**
 * 关闭歌单选择弹出层
 */
export function closePlaylistSelectPanel() {
    const panel = document.getElementById('playlistSelectPanel');
    const backdrop = document.getElementById('playlistSelectBackdrop');
    const arrow = document.querySelector('.playlist-selector-arrow');

    panel.classList.remove('show');
    backdrop.style.display = 'none';
    if (arrow) arrow.classList.remove('expanded');
}

/**
 * 选择歌单后更新显示并加载歌曲
 * @param {string|number} id - 歌单 ID
 * @param {string} name - 歌单名称
 * @param {number} count - 歌曲数量
 */
export function selectPlaylist(id, name, count) {
    // 更新隐藏 select 的值
    const playlistSelect = document.getElementById('playlistSelect');
    if (playlistSelect) playlistSelect.value = id;

    // 更新显示文本
    const selectorText = document.getElementById('playlistSelectorText');
    if (selectorText) {
        selectorText.textContent = name + ' (' + (count || 0) + ')';
    }

    // 高亮选中项
    document.querySelectorAll('.playlist-select-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-id') == id);
    });

    // 关闭面板
    closePlaylistSelectPanel();

    // 加载歌曲
    loadPlaylistSongs(id);
}

/**
 * 加载歌单列表
 * @returns {Promise} 歌单加载 Promise
 */
export function loadPlaylists() {
    showLoading();
    return apiGet('/playlists').then(data => {
        hideLoading();
        if (!data.success || !data.data) {
            showResult(data);
            const errMsg = data.error || data.message || '未知错误';
            if (isServerHostError(errMsg)) {
                showSnackbar('加载歌单失败：' + errMsg + ' 请切换到「设置」页面配置服务器地址。', 'error');
            } else {
                showSnackbar('加载歌单失败：' + errMsg, 'error');
            }
            return;
        }

        // 歌单为空且有提示消息时，显示 snackbar
        if (data.data.length === 0 && data.message) {
            if (isServerHostError(data.message)) {
                showSnackbar(data.message + ' 请切换到「设置」页面配置服务器地址。', 'warning');
            } else {
                showSnackbar(data.message, 'warning');
            }
        }

        const select = document.getElementById('playlistSelect');
        if (!select) return;

        select.innerHTML = '<option value="">请选择歌单</option>';

        data.data.forEach(playlist => {
            const option = document.createElement('option');
            option.value = playlist.id;
            const isBuiltIn = playlist.labels && playlist.labels.includes('built_in');
            option.textContent = playlist.name + (isBuiltIn ? ' [内置]' : '') + ' (' + (playlist.song_count || 0) + ')';
            select.appendChild(option);
        });

        // 渲染弹出面板列表
        const playlistSelectList = document.getElementById('playlistSelectList');
        if (playlistSelectList) {
            playlistSelectList.innerHTML = '';
            data.data.forEach(playlist => {
                const item = document.createElement('div');
                item.className = 'playlist-select-item';
                item.setAttribute('data-id', playlist.id);

                item.innerHTML = `
                    <span class="material-symbols-outlined">queue_music</span>
                    <div class="playlist-select-item-info">
                        <div class="playlist-select-item-name">${escapeHtml(playlist.name)}</div>
                        <div class="playlist-select-item-count">${playlist.song_count || 0} 首歌曲</div>
                    </div>
                `;

                item.addEventListener('click', () => {
                    selectPlaylist(playlist.id, playlist.name, playlist.song_count);
                });

                playlistSelectList.appendChild(item);
            });
        }

        initPlaylistSearch();

        // 上报歌单加载事件
        if (window.tracely) {
            window.tracely.reportEvent('playlist_load', { playlist_count: data.data.length });
        }

        showResult(data);
    }).catch(error => {
        hideLoading();
        showResult({ error: error.message });
        if (isServerHostError(error.message)) {
            showSnackbar('加载歌单失败：' + error.message + ' 请切换到「设置」页面配置服务器地址。', 'error');
        } else {
            showSnackbar('加载歌单失败：' + error.message, 'error');
        }
    });
}

/**
 * 加载歌单歌曲列表
 * @param {string} playlistId - 歌单 ID
 * @param {Object} [options]
 * @param {boolean} [options.silent=false] - 静默刷新：不弹「已加载 N 首歌曲」提示，也不上报歌单选择事件
 */
export function loadPlaylistSongs(playlistId, options) {
    const silent = !!(options && options.silent);
    const songList = document.getElementById('songList');
    if (!songList) return Promise.resolve();

    if (!playlistId) {
        songList.innerHTML = '<div class="song-list-empty">请选择歌单</div>';
        return Promise.resolve();
    }

    showLoading();
    return apiGet('/playlists/' + playlistId + '/songs').then(data => {
        hideLoading();
        if (!data.success || !data.data) {
            showResult(data);
            showSnackbar('加载歌曲失败：' + (data.error || data.message || '未知错误'), 'error');
            return;
        }

        if (data.expired) {
            songList.innerHTML = '<div class="song-list-empty">该临时歌单已过期</div>';
            loadPlaylists();
            return;
        }

        if (virtualSongList) {
            virtualSongList.destroy();
            virtualSongList = null;
        }

        cancelQueuedCovers(songList);
        songList.innerHTML = '';

        if (data.data.length >= VS_THRESHOLD) {
            virtualSongList = new VirtualSongList(songList);
            virtualSongList.init(data.data);
        } else {
            data.data.forEach((song, index) => {
                const item = createSongItem(song, index, index);
                songList.appendChild(item);
            });
        }

        initSongSearch();

        // 上报歌单选择事件
        if (window.tracely && !silent) {
            const playlistSelect = document.getElementById('playlistSelect');
            const selectedOption = playlistSelect ? playlistSelect.options[playlistSelect.selectedIndex] : null;
            window.tracely.reportEvent('playlist_select', {
                playlist_id: playlistId,
                playlist_name: selectedOption ? selectedOption.textContent : '',
                song_count: data.data.length,
            });
        }

        showResult(data);
        if (!silent) {
            showSnackbar('已加载 ' + data.data.length + ' 首歌曲', 'success');
        }
    }).catch(error => {
        hideLoading();
        showResult({ error: error.message });
        showSnackbar('加载歌曲失败：' + error.message, 'error');
        if (window.tracely) {
            window.tracely.reportEvent('api_error', { path: '/playlists/' + playlistId + '/songs', error: error.message });
        }
    });
}

/**
 * 播放指定索引的歌曲
 * @param {number} index - 歌曲在当前列表中的索引
 * @param {number} [songId] - 歌曲 ID；传入时服务端按 ID 定位起播歌曲（下标仅作兜底）
 */
export function playSongAtIndex(index, songId) {
    const accountId = getAccountId();
    if (!accountId) return;
    const deviceId = getDeviceId();
    if (!deviceId) return;

    const playlistSelect = document.getElementById('playlistSelect');
    const playlistId = playlistSelect ? playlistSelect.value : '';
    if (!playlistId) {
        showSnackbar('请先选择歌单', 'error');
        return;
    }

    const playModeBtn = document.getElementById('playModeBtn');
    const playMode = playModeBtn ? (playModeBtn.getAttribute('data-mode') || 'loop') : 'loop';

    showLoading();
    apiPost('/player/play', {
        account_id: accountId,
        device_id: deviceId,
        playlist_id: parseInt(playlistId),
        start_index: index,
        song_id: songId || 0,
        play_mode: playMode
    }).then(data => {
        hideLoading();
        showResult(data);
        if (data.success) {
            showSnackbar('开始播放', 'success');
            // 高亮当前歌曲；服务端解析出的下标与本地不一致说明本地列表已过期，重新拉一遍再高亮
            const serverIndex = data.data && typeof data.data.current_index === 'number'
                ? data.data.current_index : index;
            if (serverIndex !== index) {
                console.warn('歌单列表已过期，重新加载：本地 index=' + index + ' 服务端 index=' + serverIndex);
                loadPlaylistSongs(playlistId, { silent: true }).then(() => highlightSongItem(serverIndex));
            } else {
                highlightSongItem(serverIndex);
            }
            if (window.tracely) {
                window.tracely.reportEvent('song_play', {
                    playlist_id: playlistId,
                    start_index: index,
                    play_mode: playMode,
                });
            }
            loadDeviceStatus();
        } else {
            const errMsg = data.error || data.message || '未知错误';
            if (isServerHostError(errMsg)) {
                showSnackbar('播放失败：' + errMsg + ' 请切换到「设置」页面配置服务器地址。', 'error');
            } else {
                showSnackbar('播放失败：' + errMsg, 'error');
            }
        }
    }).catch(error => {
        hideLoading();
        showResult({ error: error.message });
        showSnackbar('播放失败：' + error.message, 'error');
    });
}

/**
 * 高亮指定索引的歌曲项
 * @param {number} index - 歌曲索引（服务端下标，基于它自己拉取的歌单顺序）
 * @param {number} [songId] - 歌曲 ID；下标对不上时按 ID 命中真实那一行（本地列表过期时更可靠）
 * @param {Object} [options]
 * @param {boolean} [options.force] - 强制滚动到目标位置（用户主动触发时）
 */
export function highlightSongItem(index, songId, options) {
    if (virtualSongList && virtualSongList.enabled) {
        virtualSongList.scrollToItem(index, songId, options);
        return;
    }
    const songList = document.getElementById('songList');
    if (!songList) return;
    // 移除所有 active
    songList.querySelectorAll('.song-item.active').forEach(el => el.classList.remove('active'));
    // 添加 active
    let target = songList.querySelector(`.song-item[data-index="${index}"]`);
    if (songId && (!target || target.getAttribute('data-song-id') !== String(songId))) {
        target = songList.querySelector(`.song-item[data-song-id="${songId}"]`) || target;
    }
    if (target) {
        target.classList.add('active');
        if (options && options.force) {
            target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }
}

/**
 * 滚动歌曲列表到当前播放歌曲（用户主动触发）
 */
export function scrollToCurrentSong() {
    if (virtualSongList && virtualSongList.enabled) {
        const idx = virtualSongList.activeOriginalIndex;
        const sid = virtualSongList.activeSongId;
        if (idx >= 0 || sid > 0) {
            virtualSongList.scrollToItem(idx, sid, { force: true });
        }
        return;
    }
    const songList = document.getElementById('songList');
    if (!songList) return;
    const active = songList.querySelector('.song-item.active');
    if (active) {
        active.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}

/**
 * 播放歌单（从头开始）
 */
export function playPlaylist() {
    const accountId = getAccountId();
    if (!accountId) return;
    const deviceId = getDeviceId();
    if (!deviceId) return;

    const playlistSelect = document.getElementById('playlistSelect');
    const playlistId = playlistSelect ? playlistSelect.value : '';
    if (!playlistId) {
        showSnackbar('请先选择歌单', 'error');
        return;
    }

    const playModeBtn = document.getElementById('playModeBtn');
    const playMode = playModeBtn ? (playModeBtn.getAttribute('data-mode') || 'loop') : 'loop';

    showLoading();
    apiPost('/player/play', {
        account_id: accountId,
        device_id: deviceId,
        playlist_id: parseInt(playlistId),
        start_index: 0,
        play_mode: playMode
    }).then(data => {
        hideLoading();
        showResult(data);
        if (data.success) {
            showSnackbar('开始播放歌单', 'success');
            // 上报歌曲播放事件
            if (window.tracely) {
                window.tracely.reportEvent('song_play', {
                    playlist_id: playlistId,
                    start_index: 0,
                    play_mode: playMode,
                });
            }
            loadDeviceStatus();
        } else {
            const errMsg = data.error || data.message || '未知错误';
            if (isServerHostError(errMsg)) {
                showSnackbar('播放失败：' + errMsg + ' 请切换到「设置」页面配置服务器地址。', 'error');
            } else {
                showSnackbar('播放失败：' + errMsg, 'error');
            }
            if (window.tracely) {
                window.tracely.reportEvent('api_error', { path: '/player/play', error: data.error || data.message || '未知错误' });
            }
        }
    }).catch(error => {
        hideLoading();
        showResult({ error: error.message });
        showSnackbar('播放失败：' + error.message, 'error');
        if (window.tracely) {
            window.tracely.reportEvent('api_error', { path: '/player/play', error: error.message });
        }
    });
}

/**
 * 播放指定 URL
 */
export function playUrl() {
    const accountId = getAccountId();
    if (!accountId) return;
    const deviceId = getDeviceId();
    if (!deviceId) return;

    const playUrlInput = document.getElementById('playUrlInput');
    const url = playUrlInput ? playUrlInput.value.trim() : '';
    if (!url) {
        showSnackbar('请输入音频 URL', 'error');
        return;
    }

    showLoading();
    apiPost('/mina/play-url', { account_id: accountId, device_id: deviceId, url: url }).then(data => {
        hideLoading();
        showResult(data);
        if (data.success) {
            showSnackbar('URL 播放开始', 'success');
            // 上报 URL 播放事件
            if (window.tracely) {
                window.tracely.reportEvent('url_play', { url: url });
            }
        } else {
            showSnackbar('URL 播放失败：' + (data.error || data.message || '未知错误'), 'error');
            if (window.tracely) {
                window.tracely.reportEvent('api_error', { path: '/mina/play-url', error: data.error || data.message || '未知错误' });
            }
        }
    }).catch(error => {
        hideLoading();
        showResult({ error: error.message });
        showSnackbar('URL 播放失败：' + error.message, 'error');
        if (window.tracely) {
            window.tracely.reportEvent('api_error', { path: '/mina/play-url', error: error.message });
        }
    });
}

/**
 * 让音箱播报指定文字（TTS）
 */
export function playTTS() {
    const accountId = getAccountId();
    if (!accountId) return;
    const deviceId = getDeviceId();
    if (!deviceId) return;

    const ttsInput = document.getElementById('ttsInput');
    const text = ttsInput ? ttsInput.value.trim() : '';
    if (!text) {
        showSnackbar('请输入要播报的文字', 'error');
        return;
    }

    console.info('[MIoT TTS] sending request', {
        account_id: accountId,
        device_id: deviceId,
        text_length: text.length,
    });

    showLoading();
    apiPost('/mina/tts', { account_id: accountId, device_id: deviceId, text: text }).then(data => {
        hideLoading();
        showResult(data);
        console.info('[MIoT TTS] response', {
            success: !!data.success,
            error: data.error || data.message || '',
        });
        if (data.success) {
            showSnackbar('已开始播报', 'success');
            if (window.tracely) {
                window.tracely.reportEvent('tts_play', {});
            }
        } else {
            showSnackbar('播报失败：' + (data.error || data.message || '未知错误'), 'error');
            if (window.tracely) {
                window.tracely.reportEvent('api_error', { path: '/mina/tts', error: data.error || data.message || '未知错误' });
            }
        }
    }).catch(error => {
        hideLoading();
        showResult({ error: error.message });
        console.warn('[MIoT TTS] request failed', error);
        showSnackbar('播报失败：' + error.message, 'error');
        if (window.tracely) {
            window.tracely.reportEvent('api_error', { path: '/mina/tts', error: error.message });
        }
    });
}
