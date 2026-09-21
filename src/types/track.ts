/**
 * 音源提供商标识，取自 server.js 的 /api/platform/capabilities 与
 * 前端 05-playback/00-api-quality-output.js:30 的 normalizePlaybackProvider。
 *
 * 注意 spotify：server.js:4640 已把它硬短路成 404 PROVIDER_REMOVED，
 * 但前端仍保留引用。本工程按源码现状 mock（返回 404），不做"修复"。
 *
 * local 不是上游的音源，是本工程加的：用户自己放进 public/music 的文件，
 * 原版对应的是 type:'local' + localKey/localUrl 那套本地曲库概念。
 */
export type Provider = 'netease' | 'qq' | 'kugou' | 'qishui' | 'spotify' | 'local';

export type TrackType = 'song' | 'podcast' | 'local';

export type QualityLevel = 'jymaster' | 'hires' | 'lossless' | 'exhigh' | 'standard';

export type PlayMode = 'loop' | 'shuffle' | 'single';

/** 原版 playModeLabel() 的中文映射，未作改动 */
export const PLAY_MODE_LABEL: Record<PlayMode, string> = {
  loop: '顺序循环',
  shuffle: '随机播放',
  single: '单曲循环',
};

export const PLAY_MODE_ORDER: PlayMode[] = ['loop', 'shuffle', 'single'];

/**
 * PLAYBACK_QUALITY_OPTIONS（00-state/00-core-stores.js）。
 * 每平台可选档位与默认值都按原表照抄。
 */
export const QUALITY_OPTIONS: Record<Provider, QualityLevel[]> = {
  netease: ['jymaster', 'hires', 'lossless', 'exhigh', 'standard'],
  qq: ['hires', 'lossless', 'exhigh', 'standard'],
  kugou: ['hires', 'lossless', 'exhigh', 'standard'],
  qishui: ['standard'],
  spotify: ['standard'],
  local: ['standard'],
};

export const QUALITY_LABEL: Record<QualityLevel, string> = {
  jymaster: '超清母带',
  hires: '高清臻音',
  lossless: '无损 SQ',
  exhigh: '极高 HQ',
  standard: '标准',
};

/** qq / kugou 的同名档位文案不同，原版按平台分支渲染 */
export const QUALITY_LABEL_BY_PROVIDER: Partial<Record<Provider, Partial<Record<QualityLevel, string>>>> = {
  qq: { hires: 'Hi-Res FLAC', lossless: '无损 FLAC', exhigh: '320k MP3', standard: '128k MP3' },
  kugou: { hires: 'Hi-Res FLAC', lossless: '无损 FLAC', exhigh: '320k MP3', standard: '128k MP3' },
  qishui: { standard: '汽水匹配源' },
  spotify: { standard: 'Spotify 匹配源' },
  local: { standard: '本地文件' },
};

export const DEFAULT_QUALITY: Record<Provider, QualityLevel> = {
  netease: 'hires',
  qq: 'lossless',
  kugou: 'lossless',
  qishui: 'standard',
  spotify: 'standard',
  local: 'standard',
};

export function qualityLabel(provider: Provider, level: QualityLevel): string {
  return QUALITY_LABEL_BY_PROVIDER[provider]?.[level] ?? QUALITY_LABEL[level] ?? level;
}

export interface ArtistRef {
  id?: string | number;
  mid?: string;
  name: string;
}

/**
 * 曲目对象。字段集是原版 cloneSong / TRACK_FIELDS 白名单的子集，
 * 保留哪些平台专有 id 决定了 fallback 链路能否命中同一首歌。
 */
export interface Track {
  provider: Provider;
  /** 同一 provider 下的来源标记，如 'netease-same-track' 表示同曲回退命中 */
  source?: string;
  type?: TrackType;

  id: string;

  /* —— 平台专有标识 —— */
  qqId?: string;
  mid?: string;
  songmid?: string;
  mediaMid?: string;
  artistMid?: string;
  albumMid?: string;
  hash?: string;
  fileHash?: string;
  audioId?: string;
  albumId?: string;
  albumAudioId?: string;
  mixSongId?: string;
  hqHash?: string;
  sqHash?: string;
  resHash?: string;
  providerSongId?: string;
  trackId?: string;

  /* —— 展示字段 —— */
  name: string;
  title?: string;
  artist?: string;
  artists?: ArtistRef[];
  artistId?: string | number;
  album?: string;
  cover?: string;
  duration?: number;
  durationMs?: number;
  dt?: number;

  /* —— 可播性 / 权益 —— */
  fee?: number;
  playable?: boolean;
  playbackMode?: string;
  vipRequired?: boolean;
  needVip?: boolean;
  onlyVipPlayable?: boolean;
  privilege?: number;
  restriction?: string | null;

  /* —— 播客 —— */
  programId?: string;
  radioId?: string;
  radioName?: string;

  /* —— 本地 —— */
  localKey?: string;
  localUrl?: string;
  localPath?: string;

  /* —— 用户侧覆写 —— */
  customCover?: string;
  customCoverKey?: string;
  recommendationSource?: string;
  popularity?: number;
  searchRank?: number;
}

/** 00-core-stores.js 的 queueItemKey()：平台前缀 + id，缺 id 时退到 name|artist */
export function queueItemKey(song: Track | null | undefined): string {
  if (!song) return '';
  const prefix =
    song.provider === 'spotify' ? 'spotify:'
      : song.provider === 'qq' ? 'qq:'
        : song.provider === 'kugou' ? 'kugou:'
          : song.provider === 'qishui' ? 'qishui:'
            : song.type === 'podcast' ? 'podcast:'
              : song.type === 'local' ? 'local:'
                : 'song:';
  return song.id ? prefix + song.id : `${song.name}|${song.artist ?? ''}`;
}

export interface Playlist {
  provider: Provider;
  source?: string;
  type?: string;
  id: string;
  name: string;
  cover?: string;
  trackCount?: number;
  playCount?: number;
  creator?: { userId?: string | number; nickname?: string; avatarUrl?: string };
  subscribed?: boolean;
  specialType?: number;
  tag?: string[];
  description?: string;
}

export interface LyricLine {
  time: number;
  text: string;
  /** tlyric _translation 对齐后的译文 */
  trans?: string;
}

export interface PodcastProgram {
  id: string;
  name: string;
  desc?: string;
  cover?: string;
  duration?: number;
  listenerCount?: number;
  publishTime?: number;
  mainUrl?: string;
}

export interface PodcastChannel {
  id: string;
  name: string;
  cover?: string;
  desc?: string;
  programCount?: number;
  playCount?: number;
}
