import type { Playlist, PodcastChannel, Provider, Track } from '@/types/track';

/**
 * 合成曲库。
 *
 * 全部歌名/艺人名都是本文件内造出来的虚构数据，不指向任何真实发行、专辑或版权内容 ——
 * mock 的职责是让界面有东西可渲染，不是伪造真实音乐平台的返回。
 * 字段结构（qq 的 mid/songmid/mediaMid、酷狗的 fileHash/hqHash/sqHash、汽水的 track_id 等）
 * 则严格照 server.js 的 mapSongRecord / mapQQTrack / mapKugouSearchItem 产出，
 * 这样音源回退、队列去重这类逻辑才有真实的输入可以跑。
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rnd: () => number, arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
const int = (rnd: () => number, min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const hex = (rnd: () => number, len: number) =>
  Array.from({ length: len }, () => '0123456789abcdef'[int(rnd, 0, 15)]).join('');

const TITLE_A = [
  '霓虹', '夜航', '潮汐', '折光', '荒原', '尘埃', '回声', '深海', '雾灯', '玻璃',
  '轨道', '余震', '极光', '漂流', '静默', '焰火', '悬崖', '雨林', '砂金', '冷杉',
];
const TITLE_B = [
  '下的电台', '航线', '练习曲', '信箱', '俱乐部', '渐强', '协奏', '快照', '独白', '慢板',
  '日记', '变奏', '安可', '尾奏', '前奏', '变调', '回声位', '采样率', '底噪', '余像',
];
const ARTISTS = [
  '南屿 Nanyu', '陆拾九', 'Cassette Ghost', '许知野', '白噪乐队', 'Ivy Loop',
  '夜行动物馆', '沈砂', 'Kirin Bloom', '林深见鹿', 'Mono No Aware', '邱棠',
  'Static Harbour', '何所居', '雾都电报', '苏牧', 'Paper Lanterns', '陈默行',
];
const ALBUMS = [
  '夜间物理', '潮湿的机器', 'Second Skin', '十四行噪音', '远行备忘', 'Slow Static',
  '雪线以上', '无人电台', 'Concrete Bloom', '旧地图',
];
const TAGS = ['流行', '电子', '摇滚', '民谣', '嘻哈', '古典', '爵士', 'R&B', '氛围', '后摇'];

/** 确定性封面：渐变 + 同心环 + 首字母，避免任何外部图片依赖 */
export function makeCover(seedText: string, label: string): string {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rnd = mulberry32(h);
  const hue = int(rnd, 0, 359);
  const hue2 = (hue + int(rnd, 40, 300)) % 360;
  const c1 = `hsl(${hue} 62% 22%)`;
  const c2 = `hsl(${hue2} 70% 8%)`;
  const c3 = `hsl(${hue2} 88% 62%)`;
  const letter = (label || '?').replace(/^[\s'"(【《]+/, '').charAt(0) || '♪';
  const rings = Array.from({ length: 3 }, (_, i) => {
    const r = 26 + i * 17 + int(rnd, -3, 3);
    return `<circle cx="150" cy="150" r="${r}" fill="none" stroke="${c3}" stroke-opacity="${0.1 - i * 0.024}" stroke-width="${2 - i * 0.4}"/>`;
  }).join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` +
    `<rect width="300" height="300" fill="url(#g)"/>${rings}` +
    `<circle cx="150" cy="150" r="7" fill="${c3}" fill-opacity=".5"/>` +
    `<text x="150" y="182" text-anchor="middle" font-family="sans-serif" font-size="112" ` +
    `font-weight="700" fill="${c3}" fill-opacity=".26">${letter}</text></svg>`;

  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function baseTrack(rnd: () => number, provider: Provider, index: number): Track {
  const name = pick(rnd, TITLE_A) + pick(rnd, TITLE_B);
  const artist = pick(rnd, ARTISTS);
  const album = pick(rnd, ALBUMS);
  const duration = int(rnd, 96, 342);
  const id = `${provider}-${String(index).padStart(3, '0')}`;
  const cover = makeCover(id, name);

  const common: Track = {
    provider,
    type: 'song',
    id,
    name,
    artist,
    artists: [{ id: `a-${hex(rnd, 6)}`, name: artist }],
    album,
    cover,
    duration,
    durationMs: duration * 1000,
    dt: duration * 1000,
    playable: true,
    fee: rnd() < 0.18 ? 1 : 0,
    popularity: int(rnd, 20, 100),
  };

  /* 各平台专有标识 */
  switch (provider) {
    case 'netease':
      return {
        ...common,
        source: 'netease',
        artistId: String(int(rnd, 10000, 99999)),
        albumId: String(int(rnd, 100000, 999999)),
      };
    case 'qq': {
      const mid = hex(rnd, 16);
      return {
        ...common,
        source: 'qq',
        qqId: String(int(rnd, 100000, 999999)),
        mid,
        songmid: mid,
        mediaMid: hex(rnd, 16),
        artistMid: hex(rnd, 12),
        albumMid: hex(rnd, 12),
      };
    }
    case 'kugou': {
      const fileHash = hex(rnd, 32);
      return {
        ...common,
        source: 'kugou',
        audioId: String(int(rnd, 1000000, 9999999)),
        fileHash,
        hqHash: hex(rnd, 32),
        sqHash: hex(rnd, 32),
        resHash: rnd() < 0.3 ? hex(rnd, 32) : undefined,
        albumId: String(int(rnd, 100000, 999999)),
        albumAudioId: String(int(rnd, 1000000, 9999999)),
        mixSongId: `${fileHash.slice(0, 16)}00${int(rnd, 10, 99)}`,
        kugouRank: index,
      } as Track;
    }
    case 'qishui':
      return {
        ...common,
        source: 'qishui',
        providerSongId: String(int(rnd, 70000000, 79999999)),
        trackId: String(int(rnd, 70000000, 79999999)),
        playbackMode: 'recommend-match',
        qishuiRank: index,
      } as Track;
    case 'spotify':
    default:
      return { ...common, source: 'spotify', providerSongId: hex(rnd, 22) };
  }
}

export const PROVIDERS: Provider[] = ['netease', 'qq', 'kugou', 'qishui'];

/** 每平台 24 首，共 96 首；下标稳定，便于分页断言 */
export const CATALOG: Record<Provider, Track[]> = {
  netease: Array.from({ length: 24 }, (_, i) => baseTrack(mulberry32(1000 + i), 'netease', i)),
  qq: Array.from({ length: 24 }, (_, i) => baseTrack(mulberry32(2000 + i), 'qq', i)),
  kugou: Array.from({ length: 24 }, (_, i) => baseTrack(mulberry32(3000 + i), 'kugou', i)),
  qishui: Array.from({ length: 24 }, (_, i) => baseTrack(mulberry32(4000 + i), 'qishui', i)),
  spotify: Array.from({ length: 8 }, (_, i) => baseTrack(mulberry32(5000 + i), 'spotify', i)),
};

export const ALL_TRACKS: Track[] = PROVIDERS.flatMap((p) => CATALOG[p]);

export function findTrack(id: string): Track | undefined {
  return ALL_TRACKS.find((t) => t.id === id || t.providerSongId === id || t.fileHash === id || t.mid === id);
}

/**
 * 搜索命中：先按歌名/艺人/专辑子串匹配，无匹配时回退到该平台的稳定切片，
 * 保证界面在任意关键词下都有可渲染结果（真实平台也是模糊召回）。
 */
export function searchTracks(provider: Provider, keywords: string, limit: number, offset: number): Track[] {
  const pool = CATALOG[provider] ?? [];
  const kw = keywords.trim().toLowerCase();
  const matched = kw
    ? pool.filter(
        (t) =>
          t.name.toLowerCase().includes(kw) ||
          (t.artist ?? '').toLowerCase().includes(kw) ||
          (t.album ?? '').toLowerCase().includes(kw),
      )
    : [];
  const source = matched.length ? matched : pool;
  return source.slice(offset, offset + limit);
}

/** 跨平台聚合，对应原版 searchMode=all */
export function searchAll(keywords: string, limit: number, offset: number): Track[] {
  const merged = PROVIDERS.flatMap((p) => searchTracks(p, keywords, 99, 0)).sort((a, b) => {
    const sa = score(b, keywords);
    const sb = score(a, keywords);
    return sa - sb;
  });
  return merged.slice(offset, offset + limit);
}

function score(t: Track, kw: string): number {
  const k = kw.trim().toLowerCase();
  if (!k) return t.popularity ?? 0;
  let s = 0;
  if (t.name.toLowerCase().includes(k)) s += 100;
  if (t.artist?.toLowerCase().includes(k)) s += 60;
  if (t.album?.toLowerCase().includes(k)) s += 20;
  return s + (t.popularity ?? 0) / 10;
}

/* ===================== 歌单 ===================== */

const PLAYLIST_NAMES = [
  '夜间物理电台', '潮湿的机器', '雨声与底噪', '通勤白噪音', '深海下潜', '旧地图',
  '凌晨四点的合成器', '折光', '长时间工作', '后雨', '雪线以上', '无人电台',
];

export const USER_PLAYLISTS: Playlist[] = PLAYLIST_NAMES.map((name, i) => {
  const rnd = mulberry32(7000 + i);
  const provider = PROVIDERS[i % PROVIDERS.length]!;
  return {
    provider,
    source: provider,
    id: `pl-${provider}-${String(i).padStart(2, '0')}`,
    name,
    cover: makeCover(`playlist-${i}`, name),
    trackCount: int(rnd, 12, 68),
    playCount: int(rnd, 1200, 9_800_000),
    creator: { userId: 40400000 + i, nickname: pick(rnd, ARTISTS) },
    subscribed: i % 3 !== 0,
    specialType: 0,
    tag: [pick(rnd, TAGS)],
    description: `${name} —— 由 mock 曲库生成的演示歌单，曲目全部虚构。`,
  };
});

/** 歌单曲目：从对应平台曲库按稳定顺序取，长度用 trackCount 声明值 */
export function playlistTracks(playlistId: string, limit: number, offset: number): Track[] {
  const pl = USER_PLAYLISTS.find((p) => p.id === playlistId);
  const provider = pl?.provider ?? 'netease';
  const pool = CATALOG[provider] ?? CATALOG.netease!;
  const shift = Math.abs(playlistId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % pool.length;
  const looped = [...pool.slice(shift), ...pool.slice(0, shift), ...pool];
  return looped.slice(offset, offset + limit).map((t, i) => ({
    ...t,
    id: `${t.id}#${playlistId}#${offset + i}`,
    album: pl?.name ?? t.album,
  }));
}

/** 内置歌单（原版 builtInPlaylists）：不依赖登录态，未登录也能播 */
export const BUILT_IN_PLAYLISTS: Playlist[] = [
  { provider: 'netease', id: 'builtin-daily', name: '每日推荐', cover: makeCover('builtin-daily', '每'), trackCount: 30, tag: ['推荐'] },
  { provider: 'netease', id: 'builtin-private', name: '私人雷达', cover: makeCover('builtin-private', '私'), trackCount: 20, tag: ['推荐'] },
  { provider: 'netease', id: 'builtin-history', name: '历史播放', cover: makeCover('builtin-history', '历'), trackCount: 50, tag: ['我的'] },
  { provider: 'netease', id: 'builtin-new', name: '平台新鲜事', cover: makeCover('builtin-new', '新'), trackCount: 40, tag: ['平台'] },
];

/* ===================== 播客 ===================== */

export const PODCAST_CHANNELS: PodcastChannel[] = [
  '长谈室', '夜航西飞', '声音切片', '城市底噪', '旧机器广播', '两点半实验室',
].map((name, i) => {
  const rnd = mulberry32(9000 + i);
  return {
    id: `dj-${1000 + i}`,
    name,
    cover: makeCover(`podcast-${i}`, name),
    desc: `${name} —— 虚构播客频道，用于演示播客页与 DJ 视觉模式。`,
    programCount: int(rnd, 24, 260),
    playCount: int(rnd, 8000, 4_600_000),
  };
});

export function podcastPrograms(channelId: string, limit: number, offset: number) {
  const ch = PODCAST_CHANNELS.find((c) => c.id === channelId) ?? PODCAST_CHANNELS[0]!;
  const rnd = mulberry32(ch.id.charCodeAt(ch.id.length - 1) * 31);
  return Array.from({ length: limit }, (_, i) => {
    const n = offset + i;
    const dur = int(rnd, 1400, 6200);
    return {
      id: `${ch.id}-p-${n}`,
      name: `${ch.name} EP.${String(n + 1).padStart(3, '0')} ${pick(rnd, TITLE_A)}${pick(rnd, TITLE_B)}`,
      desc: '单集简介由 mock 生成，仅供长时长音频视觉模式演示。',
      cover: ch.cover,
      duration: dur,
      listenerCount: int(rnd, 300, 90000),
      publishTime: Date.now() - n * 86_400_000 * 3,
      mainUrl: `/api/audio?url=mock:podcast:${ch.id}:${n}`,
    };
  });
}

/** 播客曲目对象：type=podcast，走同一套队列 */
export function podcastTrack(channelId: string, index: number): Track {
  const [p] = podcastPrograms(channelId, 1, index);
  const ch = PODCAST_CHANNELS.find((c) => c.id === channelId) ?? PODCAST_CHANNELS[0]!;
  return {
    provider: 'netease',
    source: 'podcast',
    type: 'podcast',
    id: p!.id,
    name: p!.name,
    artist: ch.name,
    album: ch.name,
    cover: ch.cover,
    duration: p!.duration,
    durationMs: p!.duration * 1000,
    programId: p!.id,
    radioId: ch.id,
    radioName: ch.name,
    playable: true,
  };
}

/* ===================== 每日推荐 / 平台推荐 ===================== */

export const DAILY_SONGS: Track[] = Array.from({ length: 30 }, (_, i) => {
  const t = CATALOG.netease![i % CATALOG.netease!.length]!;
  return { ...t, id: `daily-${t.id}`, recommendationSource: 'daily' };
});

/** 平台推荐（原版「平台推荐」弹窗，数据来自 /api/kugou/recommendations 与 /api/qishui/feed） */
export function platformRecommendations(provider: Provider, limit: number): Track[] {
  return searchTracks(provider, '', limit, 0).map((t, i) => ({
    ...t,
    id: `rec-${t.id}`,
    recommendationSource: 'platform',
    searchRank: i,
  }));
}
