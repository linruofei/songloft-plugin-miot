/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

interface Window {
  webf?: unknown;
  flutter_inappwebview?: unknown;
  SongloftPlugin?: {
    apiGet(path: string): Promise<unknown>;
    apiPost(path: string, body?: unknown): Promise<unknown>;
    apiDelete(path: string): Promise<unknown>;
    getAuthToken?(): string;
    onHostBack?(handler: () => boolean): void;
    host?: {
      isAvailable?(): boolean;
      openUrl?(params: { url: string }): Promise<unknown>;
    };
  };
}
