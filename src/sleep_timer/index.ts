/// <reference types="@songloft/plugin-sdk" />

export type SleepTimerMode = 'time' | 'songs';

export interface SleepTimerState {
  active: boolean;
  mode: SleepTimerMode;
  /** time 模式：剩余毫秒；songs 模式：剩余曲目数 */
  remaining: number;
  /** 定时器创建的时间戳(ms) */
  startedAt: number;
  /** time 模式：总时长(ms)；songs 模式：总曲目数 */
  total: number;
}

/**
 * SleepTimer - 睡眠定时器
 * 支持两种模式：
 * - time：N 分钟后停止播放（基于 setTimeout）
 * - songs：再播 N 首后停止（由外部每切一首调 onSongAdvanced）
 */
export class SleepTimer {
  private timer: any = null;
  private mode: SleepTimerMode = 'time';
  private totalMs: number = 0;
  private startedAt: number = 0;
  private songsRemaining: number = 0;
  private songsTotal: number = 0;
  private active: boolean = false;
  private onExpire: () => void;

  constructor(onExpire: () => void) {
    this.onExpire = onExpire;
  }

  /**
   * 设置时间模式定时器
   * @param minutes 分钟数（>0）
   */
  setTime(minutes: number): void {
    this.cancel();
    this.mode = 'time';
    this.totalMs = minutes * 60000;
    this.startedAt = Date.now();
    this.active = true;

    this.timer = setTimeout(() => {
      this.active = false;
      this.timer = null;
      songloft.log.info(`[SleepTimer] 时间到期 (${minutes}分钟)，执行停止`);
      this.onExpire();
    }, this.totalMs);

    songloft.log.info(`[SleepTimer] 已设置时间定时器: ${minutes}分钟后停止`);
  }

  /**
   * 设置曲目模式定时器
   * @param count 曲目数（>0）
   */
  setSongs(count: number): void {
    this.cancel();
    this.mode = 'songs';
    this.songsRemaining = count;
    this.songsTotal = count;
    this.startedAt = Date.now();
    this.active = true;

    songloft.log.info(`[SleepTimer] 已设置曲目定时器: 再播${count}首后停止`);
  }

  /**
   * 切歌时调用，仅 songs 模式有效
   * @returns true 表示计数归零已到期（调用方应停止播放）
   */
  onSongAdvanced(): boolean {
    if (!this.active || this.mode !== 'songs') {
      return false;
    }

    this.songsRemaining--;
    songloft.log.info(`[SleepTimer] 曲目计数递减: 剩余${this.songsRemaining}首`);

    if (this.songsRemaining <= 0) {
      this.active = false;
      songloft.log.info(`[SleepTimer] 曲目到期，执行停止`);
      this.onExpire();
      return true;
    }
    return false;
  }

  /**
   * 取消定时器
   */
  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.active = false;
    this.songsRemaining = 0;
    this.totalMs = 0;
    this.startedAt = 0;
  }

  /**
   * 查询当前状态
   */
  getState(): SleepTimerState {
    if (!this.active) {
      return { active: false, mode: 'time', remaining: 0, startedAt: 0, total: 0 };
    }

    if (this.mode === 'time') {
      const elapsed = Date.now() - this.startedAt;
      const remaining = Math.max(0, this.totalMs - elapsed);
      return { active: true, mode: 'time', remaining, startedAt: this.startedAt, total: this.totalMs };
    }

    return { active: true, mode: 'songs', remaining: this.songsRemaining, startedAt: this.startedAt, total: this.songsTotal };
  }

  isActive(): boolean {
    return this.active;
  }
}

/**
 * 从语音文本中解析时间（分钟数）
 * 支持："30分钟"、"半小时"、"一个半小时"、"1.5小时"、"2小时"、"90分"
 * @returns 分钟数，解析失败返回 0
 */
export function parseTimeDuration(text: string): number {
  // "一个半小时" → 90
  if (/一个半\s*小时/.test(text)) return 90;
  // "半小时" / "半个小时" → 30
  if (/半个?\s*小时/.test(text)) return 30;
  // "N.N小时" → N.N * 60
  const hourFloat = text.match(/(\d+(?:\.\d+)?)\s*小时/);
  if (hourFloat) return Math.round(parseFloat(hourFloat[1]) * 60);
  // "N分钟" / "N分" → N
  const min = text.match(/(\d+)\s*分(?:钟)?/);
  if (min) return parseInt(min[1], 10);
  // 纯数字兜底（上下文已确认是时间类指令时）
  const num = text.match(/(\d+)/);
  if (num) return parseInt(num[1], 10);
  return 0;
}

/**
 * 从语音文本中解析曲目数
 * 支持："3首歌"、"再听2首"、"5首"
 * @returns 曲目数，解析失败返回 0
 */
export function parseSongsCount(text: string): number {
  const m = text.match(/(\d+)\s*首/);
  if (m) return parseInt(m[1], 10);
  return 0;
}

/**
 * 判断语音文本是时间类还是曲目类
 * @returns 'time' | 'songs' | null
 */
export function detectSleepTimerMode(text: string): SleepTimerMode | null {
  if (/首/.test(text)) return 'songs';
  if (/分钟|分|小时|半/.test(text)) return 'time';
  return null;
}

/**
 * 格式化剩余时间为友好文案
 */
export function formatRemaining(state: SleepTimerState): string {
  if (!state.active) return '当前没有定时任务';
  if (state.mode === 'songs') {
    return `还剩${state.remaining}首后停止`;
  }
  const remainMin = Math.ceil(state.remaining / 60000);
  if (remainMin >= 60) {
    const h = Math.floor(remainMin / 60);
    const m = remainMin % 60;
    return m > 0 ? `还剩${h}小时${m}分钟后停止` : `还剩${h}小时后停止`;
  }
  return `还剩${remainMin}分钟后停止`;
}
