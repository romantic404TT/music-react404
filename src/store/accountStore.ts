import { create } from 'zustand';
import type { LoginStatus, QrCheckResponse } from '@/types/api';
import type { Provider } from '@/types/track';
import {
  checkQr,
  checkQishuiQr,
  createQishuiQr,
  createQr,
  fetchCapabilities,
  fetchLoginStatus,
  loginWithCookie,
  logout as logoutApi,
} from '@/services/account';
import { useUiStore } from './uiStore';

/**
 * 四平台账号状态。
 *
 * 原版是 loginStatus / qqLoginStatus / kugouLoginStatus / qishuiLoginStatus 四个全局 var
 * 加 loginProvider、activeAccountProvider、dualAccountMode。
 * 这里收敛成 statuses[provider] + activeAccountProvider，语义不变：
 * 听谁的源由 activeAccountProvider 决定，不是"最后登录的那个"。
 */

const TRACKED: Provider[] = ['netease', 'qq', 'kugou', 'qishui'];

export type QrPhase = 'idle' | 'creating' | 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'error';

interface AccountState {
  statuses: Record<Provider, LoginStatus | null>;
  loading: boolean;
  activeAccountProvider: Provider;
  /** 弹窗当前停在哪个平台的登录 */
  loginProvider: Provider;
  qr: { key: string; img: string; url: string; phase: QrPhase; message: string } | null;
  qrBusy: boolean;
  cookieBusy: boolean;
  spotifyRemoved: boolean;

  refreshAll(): Promise<void>;
  refresh(provider: Provider): Promise<void>;
  setActiveProvider(p: Provider): void;
  setLoginProvider(p: Provider): void;
  startQr(): Promise<void>;
  pollQr(): Promise<'pending' | 'confirmed' | 'expired'>;
  submitCookie(cookie: string): Promise<boolean>;
  logout(provider: Provider): Promise<void>;
}

const emptyStatuses = (): Record<Provider, LoginStatus | null> => ({
  netease: null, qq: null, kugou: null, qishui: null, spotify: null, local: null,
});

let qrTimer: ReturnType<typeof setInterval> | null = null;

export const useAccountStore = create<AccountState>((set, get) => ({
  statuses: emptyStatuses(),
  loading: false,
  activeAccountProvider: 'netease',
  loginProvider: 'netease',
  qr: null,
  qrBusy: false,
  cookieBusy: false,
  spotifyRemoved: false,

  refreshAll: async () => {
    set({ loading: true });
    const results = await Promise.all(
      TRACKED.map((p) => fetchLoginStatus(p).catch(() => null)),
    );
    const statuses = { ...get().statuses };
    TRACKED.forEach((p, i) => {
      const r = results[i];
      if (r) statuses[p] = r;
    });
    set({ statuses, loading: false });

    const caps = await fetchCapabilities().catch(() => null);
    if (caps) set({ spotifyRemoved: caps.platforms.spotify?.removed === true });
  },

  refresh: async (provider) => {
    const res = await fetchLoginStatus(provider).catch(() => null);
    if (res) set((s) => ({ statuses: { ...s.statuses, [provider]: res } }));
  },

  setActiveProvider: (p) => set({ activeAccountProvider: p }),
  setLoginProvider: (p) => {
    stopPolling();
    set({ loginProvider: p, qr: null });
  },

  startQr: async () => {
    const p = get().loginProvider;
    set({ qrBusy: true, qr: { key: '', img: '', url: '', phase: 'creating', message: '正在生成二维码…' } });
    try {
      const created = p === 'qishui'
        ? await createQishuiQr().then((r) => ({ key: r.token, img: r.qrcodeImg, url: '' }))
        : await createQr(p);
      set({
        qrBusy: false,
        qr: { ...created, phase: 'waiting', message: p === 'qishui' ? '请用汽水音乐 App 扫码' : '请用对应音乐 App 扫码' },
      });
    } catch {
      set({ qrBusy: false, qr: { key: '', img: '', url: '', phase: 'error', message: '二维码获取失败，请重试' } });
    }
  },

  /**
   * 轮询一次。返回 pending 让调用方继续等；
   * 803 时写登录态并刷新，800 时标过期。
   */
  pollQr: async () => {
    const { qr, loginProvider } = get();
    if (!qr?.key) return 'pending' as const;

    const p = loginProvider;
    if (p === 'qishui') {
      const res = await checkQishuiQr(qr.key).catch(() => null);
      if (!res) return 'pending' as const;
      if (res.status === 'confirmed') {
        set((s) => ({ statuses: { ...s.statuses, qishui: res }, qr: { ...qr, phase: 'confirmed', message: '登录成功' } }));
        stopPolling();
        useUiStore.getState().pushToast('汽水音乐已登录', 'ok');
        return 'confirmed' as const;
      }
      if (res.status === 'expired') {
        set({ qr: { ...qr, phase: 'expired', message: '二维码已失效，点击刷新' } });
        stopPolling();
        return 'expired' as const;
      }
      set({ qr: { ...qr, phase: res.status === 'scanned' ? 'scanned' : 'waiting', message: res.status === 'scanned' ? '已扫码，请在手机上确认' : '等待扫码' } });
      return 'pending' as const;
    }

    const res = await checkQr(qr.key).catch(() => null);
    if (!res) return 'pending' as const;
    return applyQrCode(res, qr, p, set, get);
  },

  submitCookie: async (cookie) => {
    const p = get().loginProvider;
    set({ cookieBusy: true });
    const res = await loginWithCookie(p, cookie).catch(() => null);
    set({ cookieBusy: false });
    if (!res?.ok) {
      useUiStore.getState().pushToast('Cookie 无效或已过期', 'error');
      return false;
    }
    set((s) => ({ statuses: { ...s.statuses, [p]: res } }));
    useUiStore.getState().pushToast(`${p} 已通过 Cookie 登录`, 'ok');
    return true;
  },

  logout: async (provider) => {
    await logoutApi(provider).catch(() => null);
    await get().refresh(provider);
    useUiStore.getState().pushToast(`${provider} 已退出`, 'info');
  },
}));

function applyQrCode(
  res: QrCheckResponse,
  qr: NonNullable<AccountState['qr']>,
  provider: Provider,
  set: (partial: Partial<AccountState>) => void,
  get: () => AccountState,
): 'pending' | 'confirmed' | 'expired' {
  if (res.code === 803) {
    const merged: LoginStatus = {
      provider,
      loggedIn: true,
      nickname: res.nickname,
      avatar: res.avatar,
      userId: (res.loginInfo as { userId?: string | number } | undefined)?.userId,
      vipType: (res.loginInfo as { vipType?: string } | undefined)?.vipType,
      vipLabel: (res.loginInfo as { vipLabel?: string } | undefined)?.vipLabel,
    };
    set({ statuses: { ...get().statuses, [provider]: merged }, qr: { ...qr, phase: 'confirmed', message: '登录成功' } });
    stopPolling();
    useUiStore.getState().pushToast(`${provider} 已登录`, 'ok');
    return 'confirmed';
  }

  if (res.code === 800) {
    set({ qr: { ...qr, phase: 'expired', message: res.message } });
    stopPolling();
    return 'expired';
  }

  set({ qr: { ...qr, phase: res.code === 802 ? 'scanned' : 'waiting', message: res.message } });
  return 'pending';
}

function stopPolling(): void {
  if (qrTimer) {
    clearInterval(qrTimer);
    qrTimer = null;
  }
}

/** 由登录弹窗在可见时启动，关闭时停止 */
export function startQrPolling(intervalMs = 1500): void {
  stopPolling();
  qrTimer = setInterval(() => {
    void useAccountStore.getState().pollQr();
  }, intervalMs);
}

export { stopPolling };
