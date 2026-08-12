import { reactive } from 'vue';
import { resolveConfirm, state } from './store';

export const isWebFRuntime = typeof window !== 'undefined' && !!window.webf;

function hasNativeElement(tagName: string, property: string): boolean {
  if (!isWebFRuntime) return false;
  try {
    return property in document.createElement(tagName);
  } catch {
    return false;
  }
}

export const useNativeUI = hasNativeElement('flutter-cupertino-switch', 'checked');
export const useNativeList = hasNativeElement('webf-list-view', 'finishLoad');
export const useNativeSlider = hasNativeElement('songloft-slider', 'value');

export type AppPage = 'main' | 'settings' | 'player';

export const navigation = reactive({
  page: 'main' as AppPage,
  pageHistory: [] as AppPage[],
  settingsCategory: '',
  playerPopup: '',
  editorOpen: false,
  dialogOpen: false,
  devicePickerOpen: false,
});

export function openPage(page: AppPage): void {
  if (navigation.page === page) return;
  navigation.pageHistory.push(navigation.page);
  navigation.page = page;
  navigation.playerPopup = '';
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export function closePage(): void {
  navigation.playerPopup = '';
  navigation.page = navigation.pageHistory.pop() || 'main';
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

// 宿主返回键回调：按「最上层浮层 → 编辑器 → 设置子分类 → 页面」的顺序收起，
// 每层都真正关闭并吞掉这次返回；没有浮层时返回 false 交由宿主处理。
// 之前 dialogOpen/editorOpen 从未被置位，导致弹窗/编辑器打开时返回键会直接退出页面。
export function consumeBack(): boolean {
  if (state.confirm.open) {
    resolveConfirm(false);
    return true;
  }
  if (navigation.devicePickerOpen) {
    navigation.devicePickerOpen = false;
    return true;
  }
  if (navigation.playerPopup) {
    navigation.playerPopup = '';
    return true;
  }
  if (navigation.editorOpen) {
    navigation.editorOpen = false;
    return true;
  }
  if (navigation.page === 'settings' && navigation.settingsCategory && window.innerWidth < 600) {
    navigation.settingsCategory = '';
    return true;
  }
  if (navigation.page !== 'main') {
    if (navigation.page === 'settings') navigation.settingsCategory = '';
    closePage();
    return true;
  }
  return false;
}

export function installHostBack(): void {
  if (!isWebFRuntime) return;
  window.SongloftPlugin?.onHostBack?.(consumeBack);
  // common.js 在 IIFE 加载期注册 `requestBack`，那时 webf methodChannel 可能尚未就绪，
  // 导致 handler 没注册上、宿主返回键永远拿不到「已消费」、直接退出页面。
  // 这里在插件 mount（methodChannel 已就绪）时再注册一次作为兜底，handler 逻辑与
  // common.js 等价（consumeBack 优先，其次浏览器历史回退）。
  const mc = (window as unknown as { webf?: { methodChannel?: { addMethodCallHandler?: (n: string, f: () => unknown) => void } } }).webf?.methodChannel;
  if (mc && typeof mc.addMethodCallHandler === 'function') {
    mc.addMethodCallHandler('requestBack', () => {
      try {
        if (consumeBack()) return true;
      } catch {
        /* 不能因插件回调抛错卡死返回键 */
      }
      if (window.history && window.history.length > 1) {
        window.history.back();
        return true;
      }
      return false;
    });
  }
}

export const hostMode = reactive({ value: 'tab' as 'tab' | 'fullscreen' | 'browser' });

export function detectHostMode(): void {
  let available = false;
  try {
    available = !!window.SongloftPlugin?.host?.isAvailable?.();
  } catch {
    available = false;
  }
  if (!available) hostMode.value = 'browser';
  else if (document.documentElement.classList.contains('embed')) hostMode.value = 'fullscreen';
  else hostMode.value = 'tab';
  document.documentElement.classList.add(`miot-mode-${hostMode.value}`);
}
