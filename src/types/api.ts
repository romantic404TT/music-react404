import type { PlayMode, Provider, QualityLevel, Track } from './track';

/* ===================== 搜索 ===================== */

/** /api/search?keywords=&limit=&offset= → { songs, offset, limit, nextOffset, hasMore } */
export interface PageResult<T> {
  provider?: Provider;
  offset: number;
  limit: number;
  nextOffset: number;
  hasMore: boolean;
  total?: number;
  partial?: boolean;
  items: T[];
}

export interface SearchResponse {
  provider?: Provider;
  songs: Track[];
  offset: number;
  limit: number;
  nextOffset: number;
  hasMore: boolean;
  /** qishui 专有：后端是否配置了该音源 */
  configured?: boolean;
}

export type SearchMode = 'all' | Provider | 'podcast';

export const SEARCH_MODES: { key: SearchMode; short: string; label: string; provider: Provider | null }[] = [
  { key: 'all', short: 'All', label: '全部', provider: null },
  { key: 'netease', short: 'NE', label: '网易云', provider: 'netease' },
  { key: 'qq', short: 'QQ', label: 'QQ 音乐', provider: 'qq' },
  { key: 'kugou', short: 'KG', label: '酷狗', provider: 'kugou' },
  { key: 'qishui', short: 'QS', label: '汽水音乐', provider: 'qishui' },
  { key: 'podcast', short: 'Podcast', label: '播客', provider: null },
];

/* ===================== 播放地址 ===================== */

/**
 * /api/song/url 的成功与失败分支都在源码里（server.js:4096-4151 / :6079）。
 * 失败时 url 为 null 并带 reason / message / restriction / probeFailures，
 * 前端据此决定是否走 provider fallback。
 */
export interface SongUrlResult {
  provider: Provider;
  source?: string;
  url: string | null;
  /** 无版权时的试听片段 */
  trial?: boolean;
  playable: boolean;
  level?: QualityLevel;
  quality?: string;
  br?: number;
  requestedQuality?: QualityLevel;
  probeStatus?: number;
  probeBytes?: number;
  probeMagic?: string | null;
  /** 同曲回退命中的证据 */
  sourceMatch?: boolean;
  matchKind?: string;
  resolvedSongId?: string;
  matchedSong?: Track;
  matchScore?: number;
  originalRestriction?: string | null;
  /** 失败分支 */
  reason?: string;
  message?: string;
  restriction?: string | null;
  lastCode?: number;
  fee?: number;
  probeFailures?: unknown[];
  /** 账号上下文 */
  loggedIn?: boolean;
  vipType?: string | null;
  vipLevel?: number;
  isVip?: boolean;
  isSvip?: boolean;
  vipLabel?: string | null;
}

/* ===================== 歌词 ===================== */

/** /api/lyric 原样返回多语言轨道，yrc / tlyric 决定逐字与译文模式 */
export interface LyricResponse {
  lyric?: string;
  tlyric?: string;
  yrc?: string;
  ytlrc?: string;
  romalrc?: string;
  yromalrc?: string;
  source?: string;
  provider?: Provider;
}

/* ===================== 歌单 ===================== */

export interface UserPlaylistsResponse {
  loggedIn: boolean;
  userId?: string | number;
  playlists: import('./track').Playlist[];
  total?: number;
  offset?: number;
  limit?: number;
  nextOffset?: number;
  hasMore?: boolean;
  partial?: boolean;
}

export interface PlaylistTracksResponse {
  playlist: import('./track').Playlist;
  tracks: Track[];
  offset?: number;
  limit?: number;
  nextOffset?: number;
  hasMore?: boolean;
  total?: number;
  partial?: boolean;
}

/* ===================== 首页 ===================== */

/** /api/discover/home 的真实字段（server.js:1699 / :1280） */
export interface DiscoverHomeResponse {
  loggedIn: boolean;
  user: { userId?: string | number; nickname?: string; avatar?: string } | null;
  dailySongs: Track[];
  dailySongTotal: number;
  dailySongsComplete: boolean;
  playlists: import('./track').Playlist[];
  podcasts: import('./track').PodcastChannel[];
  mode: string;
  updatedAt: number;
}

/* ===================== 账号 ===================== */

/**
 * /api/login/status 与三个平台变体的公共形状。
 * 酷狗/汽水还带 playbackKeyReady / membershipKnown 之类播放票据证据，一并保留可选。
 */
export interface LoginStatus {
  provider?: Provider;
  loggedIn: boolean;
  configured?: boolean;
  userId?: string | number;
  nickname?: string;
  avatar?: string;
  vipType?: string | null;
  vipLevel?: number;
  isVip?: boolean;
  isSvip?: boolean;
  vipLabel?: string | null;
  hasCookie?: boolean;
  playbackReady?: boolean;
  playbackKeyReady?: boolean;
  playbackMode?: string;
  membershipKnown?: boolean;
  expiresAt?: number;
  capabilities?: {
    search: boolean;
    lyric: boolean;
    playableUrl: boolean;
    userPlaylists: boolean;
    login: boolean;
  };
}

/** /api/login/qr/check 的 code 语义来自 server.js:6171-6224 */
export type QrCheckCode = 800 | 801 | 802 | 803;

export interface QrCheckResponse {
  code: QrCheckCode;
  message: string;
  nickname?: string;
  avatar?: string;
  cookie?: string;
  loginInfo?: Record<string, unknown>;
  hasCookie?: boolean;
}

/* ===================== 其他 ===================== */

export interface ListenTotalResponse {
  ok: boolean;
  provider?: Provider;
  totalListenMs: number;
  sessions: number;
  daily: Record<string, { listenMs: number; sessions: number; completed: number }>;
  updatedAt: number;
}

export interface PlatformCapabilitiesResponse {
  ok: boolean;
  platforms: Record<Provider, { enabled: boolean; removed?: boolean; reason?: string }>;
}

export interface WeatherRadioResponse {
  ok: boolean;
  location: { city: string; lat: number; lon: number; resolvedBy?: string } | null;
  weather: Record<string, unknown> | null;
  queue: Track[];
  fallback?: boolean;
}

export interface AppVersionResponse {
  ok: boolean;
  version: string;
  name?: string;
}

export interface UpdateLatestResponse {
  ok: boolean;
  hasUpdate: boolean;
  latestVersion?: string;
  currentVersion: string;
  body?: string;
  releaseUrl?: string;
  downloadPages?: { label: string; url: string }[];
}

/** /api/update/download 与 /patch 在 2.0.3+ 一律 410，本工程照抄该行为 */
export interface UpdateExternalOnlyError {
  ok: false;
  externalOnly: true;
  error: 'UPDATE_EXTERNAL_ONLY';
}

export type PlayModeState = PlayMode;
export type QualityPrefs = Partial<Record<Provider, QualityLevel>>;
