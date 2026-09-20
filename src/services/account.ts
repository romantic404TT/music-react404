import { apiGet, apiPost } from '@/lib/http';
import type { LoginStatus, QrCheckResponse } from '@/types/api';
import type { Provider } from '@/types/track';

/**
 * 账号与登录。
 *
 * 网易云与 QQ / 酷狗 走 /api/login/qr/* 那套 code 轮询；
 * 汽水走自己的 token 流程（/api/qishui/login/qrcode + /check）。
 * 三种方式在原版都是"弹窗里可切换的入口"，这里保持同样的接口面。
 */

export const ACCOUNT_PROVIDERS: Provider[] = ['netease', 'qq', 'kugou', 'qishui', 'spotify'];

const statusPath = (p: Provider) => (p === 'netease' ? '/api/login/status' : `/api/${p}/login/status`);
const logoutPath = (p: Provider) => (p === 'netease' ? '/api/logout' : `/api/${p}/logout`);
const cookiePath = (p: Provider) => (p === 'netease' ? '/api/login/cookie' : `/api/${p}/login/cookie`);

export function fetchLoginStatus(provider: Provider, signal?: AbortSignal): Promise<LoginStatus> {
  return apiGet<LoginStatus>(statusPath(provider), undefined, signal);
}

export function logout(provider: Provider): Promise<{ ok: boolean }> {
  return apiGet(logoutPath(provider));
}

/** Cookie 粘贴登录：原版 #login-auth-drawer 里那条路 */
export function loginWithCookie(provider: Provider, cookie: string): Promise<LoginStatus & { ok: boolean }> {
  return apiPost(cookiePath(provider), { cookie });
}

export async function createQr(provider: Provider, signal?: AbortSignal): Promise<{ key: string; img: string; url: string }> {
  const { key } = await apiGet<{ key: string }>('/api/login/qr/key', { provider }, signal);
  const created = await apiGet<{ img: string; url: string }>('/api/login/qr/create', { key }, signal);
  return { key, ...created };
}

export function checkQr(key: string, signal?: AbortSignal): Promise<QrCheckResponse> {
  return apiGet<QrCheckResponse>('/api/login/qr/check', { key }, signal);
}

export interface QishuiQr {
  ok: boolean;
  token: string;
  qrcodeImg: string;
}

export function createQishuiQr(signal?: AbortSignal): Promise<QishuiQr> {
  return apiGet<QishuiQr>('/api/qishui/login/qrcode', undefined, signal);
}

export function checkQishuiQr(token: string, signal?: AbortSignal): Promise<{ ok: boolean; status: string } & LoginStatus> {
  return apiGet('/api/qishui/login/check', { token }, signal);
}

export interface PlatformCapabilities {
  ok: boolean;
  platforms: Record<Provider, { enabled: boolean; removed?: boolean; reason?: string }>;
}

export function fetchCapabilities(signal?: AbortSignal): Promise<PlatformCapabilities> {
  return apiGet<PlatformCapabilities>('/api/platform/capabilities', undefined, signal);
}
