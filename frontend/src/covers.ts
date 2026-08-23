import { computed, onMounted, onUnmounted, ref, watch, type ComputedRef } from 'vue';
import type { Song } from './types';
import { hostPathPrefix } from './api';

const MAX_CONCURRENT_COVERS = 3;

/** 同一首歌最多自动重试几次加载失败的封面。 */
const MAX_COVER_RETRIES = 2;
/** 自动重试的间隔，避开「失败瞬间立刻重试还是同样失败」。 */
const COVER_RETRY_DELAY_MS = 1200;

interface CoverTask {
  cancelled: boolean;
  granted: boolean;
  resolve: () => void;
}

export interface CoverSlot {
  promise: Promise<void>;
  release: () => void;
}

let activeCovers = 0;
const coverQueue: CoverTask[] = [];

function appendQuery(url: string, name: string, value: string): string {
  if (new RegExp(`(?:\\?|&)${name}=`).test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${name}=${encodeURIComponent(value)}`;
}

/** Build an image URL that works in both the browser and WebF image elements. */
export function songCoverUrl(song: Song | null | undefined, width: number): string {
  let url = song?.cover_url?.trim() || '';
  if (!url) return '';

  // Preview/test data and external CDNs do not use Songloft resource authentication.
  if (/^(?:data:|blob:)/i.test(url)) return url;
  if (/^https?:\/\//i.test(url)) {
    try {
      if (new URL(url).origin !== window.location.origin) return url;
    } catch {
      return '';
    }
  } else {
    if (!url.startsWith('/')) url = `/${url}`;
    // 反代 BASE_PATH 子路径部署下，绝对路径会绕过 BASE_PATH 直接打到域名根
    // （songloft-org/songloft#407），补上从当前页面路径推出的 BASE_PATH 前缀。
    url = `${hostPathPrefix()}${url}`;
  }

  url = appendQuery(url, 'w', String(Math.max(1, Math.round(width))));
  const token = window.SongloftPlugin?.getAuthToken?.() || '';
  return token ? appendQuery(url, 'access_token', token) : url;
}

export interface SongCover {
  /** 绑到 `<img :src>`；为空串时说明该显示占位图。 */
  src: ComputedRef<string>;
  /** 绑到 `<img @error>`。 */
  onError: () => void;
  /** 绑到 `<img @load>`。重试预算是「每段连续失败」而非「每首歌」，靠它归零。 */
  onLoad: () => void;
}

/**
 * 播放器封面（PlayerBar / FullscreenPlayer 共用）。
 *
 * 这里的两条设计都是 songloft-org/songloft-plugin-miot#86「切标签回来封面永久
 * 丢失」的直接产物，改动前请先读完：
 *
 * ① **失败标记不能是粘滞闩锁。** 以前是 `coverFailed=true` 之后只有「换歌」能复位，
 *    于是任何一次瞬时失败都等于「这首歌的封面这一整个会话都没了」。而 WebF 的
 *    `ImageElement._onImageError` **重试成功也照样派发 `error` 事件**
 *    （`hadTryReload` 是元素级、永不复位），所以这个闩锁被无谓扣上的概率很高。
 *
 * ② **复位必须真正换掉 `src`，光清标记不够。** WebF 的 `_loadNormalImage` 会
 *    `evict(BoxFitImageKey(url, ImageConfiguration.empty), includeLive: true)`
 *    紧接着又用同一个 key 去 resolve，且宿主的 `imageCache` 是**和 Flutter 侧曲库
 *    封面共用同一个池子**——切到曲库刷一屏封面正好加剧它的周转。结果是切回来时
 *    可能画着一个已 dispose 的 `ui.Image`：**空白，但不发 error 事件**。这种情况下
 *    `src` 不变就不会重新解码，清标记完全无效。带一个自增的 `_r` 参数换掉 URL，
 *    才能让 WebF 走 `set src` → 新 provider → 新 stream → 重新解码。
 *
 * `visibilitychange` 由宿主推：WebF 自己只在 App 级前后台切换时派发它，Tab 切换
 * 在 JS 侧完全不可见，所以客户端补了 `PluginRenderController.setPageVisible`。
 * 老客户端不推这个事件时，本 composable 退化为「② 之外仍有 ① 的有限次重试」。
 */
export function useSongCover(getSong: () => Song | null | undefined, width: number): SongCover {
  const failed = ref(false);
  // 0 表示「原始 URL」，不加 `_r` 参数，避免给正常路径也带上无意义的查询串。
  const nonce = ref(0);
  let retries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function clearRetryTimer(): void {
    if (retryTimer === null) return;
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  const src = computed(() => {
    if (failed.value) return '';
    const url = songCoverUrl(getSong(), width);
    if (!url || nonce.value === 0) return url;
    return appendQuery(url, '_r', String(nonce.value));
  });

  /** 强制重新拉取：清失败态 + 换 URL，让 WebF 重新解码（见函数注释 ②）。 */
  function reload(): void {
    clearRetryTimer();
    failed.value = false;
    nonce.value += 1;
  }

  function onError(): void {
    if (retries >= MAX_COVER_RETRIES) {
      // 重试用尽才落到占位图。真 404 的封面不该无限重试下去。
      // `clearRetryTimer()` 不能省：上一次失败排的定时器还在飞，不撤掉的话它会在
      // 1.2s 后把已经放弃的图又复活一次（浏览器实测过，见 #86）。
      clearRetryTimer();
      failed.value = true;
      return;
    }
    retries += 1;
    // 先摘掉 `<img>` 再换 URL 重挂，确保拿到的是全新的 ImageElement
    // （WebF 的 `hadTryReload` 是元素级的，复用旧元素等于放弃它自己那次重试）。
    failed.value = true;
    clearRetryTimer();
    retryTimer = setTimeout(reload, COVER_RETRY_DELAY_MS);
  }

  /**
   * 加载成功就把重试预算还回去，让预算的含义是「每段连续失败」而非「每首歌」。
   *
   * 这条对本 bug 的场景很实在：插件 Tab 靠 Offstage 无限期保活，同一个组件实例可能
   * 活好几个小时。没有它的话，早上偶发失败两次就把额度耗光，之后整天都只能靠
   * 「换歌」或「重新可见」才救得回来。
   */
  function onLoad(): void {
    retries = 0;
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible' || !document.hidden) {
      // 重置重试预算：这是一次新的展示机会，不该受上一次可见期的失败次数拖累。
      retries = 0;
      reload();
    }
  }

  // 换歌时回到干净状态：URL 本来就变了，不需要 `_r`。
  watch(
    () => {
      const song = getSong();
      return [song?.id, song?.cover_url];
    },
    () => {
      clearRetryTimer();
      retries = 0;
      failed.value = false;
      nonce.value = 0;
    },
  );

  onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange));
  onUnmounted(() => {
    clearRetryTimer();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  return { src, onError, onLoad };
}

function pumpCoverQueue(): void {
  while (activeCovers < MAX_CONCURRENT_COVERS && coverQueue.length) {
    const task = coverQueue.shift();
    if (!task || task.cancelled) continue;
    activeCovers += 1;
    task.granted = true;
    task.resolve();
  }
}

/** Limit WebF image requests so fast list scrolling cannot saturate the host. */
export function acquireCoverSlot(): CoverSlot {
  let resolvePromise = (): void => undefined;
  const task: CoverTask = {
    cancelled: false,
    granted: false,
    resolve: () => resolvePromise(),
  };
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  if (activeCovers < MAX_CONCURRENT_COVERS) {
    activeCovers += 1;
    task.granted = true;
    task.resolve();
  } else {
    coverQueue.push(task);
  }

  return {
    promise,
    release() {
      if (task.cancelled) return;
      task.cancelled = true;
      if (task.granted) {
        activeCovers = Math.max(0, activeCovers - 1);
        pumpCoverQueue();
      }
    },
  };
}
