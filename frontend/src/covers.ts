import type { Song } from './types';
import { hostPathPrefix } from './api';

const MAX_CONCURRENT_COVERS = 3;

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
