import type { ApiEnvelope } from './types';

const PLUGIN_BASE = '/api/v1/jsplugin/miot';

export class ApiError extends Error {
  constructor(message: string, public readonly status = 0) {
    super(message);
    this.name = 'ApiError';
  }
}

function pluginApi() {
  return window.SongloftPlugin;
}

async function browserRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const token = pluginApi()?.getAuthToken?.();
  const response = await fetch(`${PLUGIN_BASE}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return decodePayload<T>(payload, response.status, response.ok);
}

async function browserEnvelope<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const token = pluginApi()?.getAuthToken?.();
  const response = await fetch(`${PLUGIN_BASE}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json()) as { success?: boolean; error?: string } & T;
  if (!response.ok || payload.success !== true) {
    throw new ApiError(payload.error || `请求失败 (${response.status})`, response.status);
  }
  return payload;
}

export function unwrap<T>(value: unknown): T {
  return decodePayload<T>(value, 0, true);
}

function decodePayload<T>(value: unknown, status: number, ok: boolean): T {
  const payload = value as Partial<ApiEnvelope<T>> | null;
  if (payload && typeof payload === 'object' && 'success' in payload) {
    if (payload.success === true) {
      return payload.data as T;
    }
    throw new ApiError(payload.error || '请求失败，请稍后重试', status);
  }
  if (!ok) {
    const detail = (payload as { error?: string; message?: string } | null)?.error
      || (payload as { error?: string; message?: string } | null)?.message
      || `请求失败 (${status})`;
    throw new ApiError(detail, status);
  }
  return value as T;
}

export async function get<T>(path: string): Promise<T> {
  const api = pluginApi();
  if (api?.apiGet) return decodePayload<T>(await api.apiGet(path), 0, true);
  return browserRequest<T>('GET', path);
}

export async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const api = pluginApi();
  if (api?.apiPost) return decodePayload<T>(await api.apiPost(path, body), 0, true);
  return browserRequest<T>('POST', path, body);
}

export async function postEnvelope<T>(path: string, body: unknown = {}): Promise<T> {
  const api = pluginApi();
  if (api?.apiPost) {
    const payload = (await api.apiPost(path, body)) as { success?: boolean; error?: string } & T;
    if (!payload || payload.success !== true) {
      throw new ApiError(payload?.error || '请求失败，请稍后重试');
    }
    return payload;
  }
  return browserEnvelope<T>('POST', path, body);
}

export async function del<T>(path: string): Promise<T> {
  const api = pluginApi();
  if (api?.apiDelete) return decodePayload<T>(await api.apiDelete(path), 0, true);
  return browserRequest<T>('DELETE', path);
}

export function query(params: Record<string, string | number | boolean | undefined>): string {
  const values: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      values.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return values.length ? `?${values.join('&')}` : '';
}

export function pluginWebSocketUrl(path: string): string {
  const location = window.location;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = pluginApi()?.getAuthToken?.() || '';
  return `${protocol}//${location.host}${PLUGIN_BASE}${path}${
    path.includes('?') ? '&' : '?'
  }${token ? `access_token=${encodeURIComponent(token)}` : ''}`;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '未知错误');
}
