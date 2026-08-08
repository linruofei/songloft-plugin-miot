import { reactive } from 'vue';

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

export function consumeBack(): boolean {
  if (navigation.dialogOpen) return false;
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
