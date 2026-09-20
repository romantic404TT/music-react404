import type { Provider } from '@/types/track';
import type { LoginStatus } from '@/types/api';

/**
 * mock 侧的「服务端会话」。
 *
 * 真实后端把 cookie 存在本机用户数据目录，登录态会改变后续接口的返回；
 * 所以 mock 也必须是有状态的，否则登录流程演示不出来。
 * 这里用模块级可变对象模拟，刷新页面即回到初始态。
 */

export type ProviderLogin = LoginStatus & { provider: Provider };

const ACCOUNT_FIXTURES: Record<Provider, ProviderLogin> = {
  netease: {
    provider: 'netease',
    loggedIn: false,
    configured: true,
    nickname: '',
    avatar: '',
    userId: undefined,
    vipType: null,
    vipLevel: 0,
    isVip: false,
    isSvip: false,
    vipLabel: null,
  },
  qq: {
    provider: 'qq',
    loggedIn: false,
    configured: true,
    nickname: '',
    avatar: '',
    vipType: null,
    vipLevel: 0,
    isVip: false,
    isSvip: false,
    vipLabel: null,
    playbackKeyReady: false,
  },
  kugou: {
    provider: 'kugou',
    loggedIn: false,
    configured: true,
    nickname: '',
    avatar: '',
    isVip: false,
    isSvip: false,
    vipLevel: 0,
    vipLabel: null,
    hasCookie: false,
    playbackReady: false,
    playbackKeyReady: false,
    membershipKnown: false,
  },
  qishui: {
    provider: 'qishui',
    loggedIn: false,
    configured: true,
    nickname: '',
    avatar: '',
    isVip: false,
    isSvip: false,
    vipLevel: 0,
    vipLabel: null,
    playbackMode: 'recommend-match',
    playbackKeyReady: false,
    membershipKnown: false,
    capabilities: { search: true, lyric: true, playableUrl: true, userPlaylists: true, login: true },
  },
  spotify: {
    provider: 'spotify',
    loggedIn: false,
    configured: false,
    nickname: '',
    avatar: '',
  },
};

/** 登录成功后写入的账号画像（昵称/头像/VIP 档位），全部虚构 */
const DEMO_ACCOUNT: Record<Provider, Partial<ProviderLogin>> = {
  netease: {
    loggedIn: true, nickname: 'Mineradio 演示账号', userId: 40400101,
    isVip: true, isSvip: true, vipType: 'vip', vipLevel: 3, vipLabel: '黑 VIP 年乐迷',
  },
  qq: {
    loggedIn: true, nickname: '演示 QQ 账号', userId: 40400102,
    isVip: true, isSvip: false, vipType: 'vip', vipLevel: 8, vipLabel: '绿钻豪华版', playbackKeyReady: true,
  },
  kugou: {
    loggedIn: true, nickname: '演示酷狗账号', userId: 40400103,
    isVip: true, isSvip: true, vipLevel: 6, vipLabel: '超级会员', hasCookie: true,
    playbackReady: true, playbackKeyReady: true, membershipKnown: true,
  },
  qishui: {
    loggedIn: true, nickname: '演示汽水账号', userId: 40400104,
    isVip: true, isSvip: false, vipLevel: 2, vipLabel: 'VIP', playbackKeyReady: true, membershipKnown: true,
  },
  spotify: { loggedIn: false },
};

export const session = {
  login: structuredClone(ACCOUNT_FIXTURES) as Record<Provider, ProviderLogin>,
  /** 红心集合：queueItemKey 之外的展示用 id 集 */
  liked: new Set<string>(),
  /** 本会话内用户新建的歌单 */
  createdPlaylists: [] as import('@/types/track').Playlist[],
  /** 扫码登录的一次性票据 */
  qrKeys: new Map<string, { provider: Provider; created: number }>(),
  /** 听歌统计的内存累加（原版存本机 + POST /api/listen/report） */
  listenTotalMs: 0,
  listenSessions: 0,

  setLoggedIn(provider: Provider, on: boolean): void {
    const base = ACCOUNT_FIXTURES[provider];
    this.login[provider] = on
      ? ({ ...structuredClone(base), ...structuredClone(DEMO_ACCOUNT[provider]), provider } as ProviderLogin)
      : structuredClone(base);
  },

  status(provider: Provider): ProviderLogin {
    return this.login[provider];
  },

  anyLoggedIn(): boolean {
    return (Object.keys(this.login) as Provider[]).some((p) => this.login[p]!.loggedIn);
  },
};

export const CURRENT_VERSION = '2.2.0';
