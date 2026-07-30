/**
 * 歌曲/歌单索引管理模块
 * 负责索引状态显示和刷新操作
 */

const { apiGet, apiPost } = SongloftPlugin;
import { showSnackbar } from './utils.js';

/**
 * 初始化索引管理 UI 事件
 */
export function initIndexingUI() {
    const refreshIndexBtn = document.getElementById('refreshIndexBtn');
    if (refreshIndexBtn) {
        refreshIndexBtn.addEventListener('click', refreshSongIndex);
    }
}

/**
 * 加载索引状态
 */
export function loadIndexStatus() {
    apiGet('/indexing/status').then(data => {
        if (data.success && data.data) {
            updateIndexStatus(data.data);
        }
    }).catch(err => console.error('加载索引状态失败:', err));
}

/**
 * 更新索引状态显示
 */
function updateIndexStatus(status) {
    const textEl = document.getElementById('indexStatusText');
    if (!textEl || !status) return;

    if (status.ready) {
        // 歌单歌曲缓存（歌曲→所在歌单位置）是后台加载的，它没就绪时语音搜歌只能退化为
        // 「独立歌曲直推」——播完即停、没有歌单上下文。把进度显示出来，避免用户把这段
        // 加载窗口误当成「搜不到本地歌」的 bug（songloft-org/songloft-plugin-miot#62）。
        if (status.playlist_cache_ready === false) {
            textEl.textContent = `索引就绪（${status.playlist_count} 个歌单，${status.song_count} 首歌曲）·`
                + ` 歌单位置缓存加载中 ${status.playlist_cache_loaded || 0}/${status.playlist_count}`;
            textEl.style.color = 'var(--md-warning, #ff9800)';
            return;
        }
        textEl.textContent = `索引就绪（${status.playlist_count} 个歌单，${status.song_count} 首歌曲）`;
        textEl.style.color = 'var(--md-success, #4caf50)';
    } else {
        textEl.textContent = '索引未就绪';
        textEl.style.color = 'var(--md-on-surface-variant)';
    }
}

/**
 * 刷新歌曲/歌单索引
 */
function refreshSongIndex() {
    showSnackbar('正在重建索引...', 'info');
    apiPost('/indexing/refresh', {})
        .then(data => {
            if (data.success) {
                showSnackbar('索引重建已启动', 'success');
                // 延迟 3 秒后刷新状态
                setTimeout(loadIndexStatus, 3000);
            } else {
                showSnackbar('索引重建失败：' + (data.error || '未知错误'), 'error');
            }
        })
        .catch(error => {
            showSnackbar('索引重建失败：' + error.message, 'error');
        });
}
