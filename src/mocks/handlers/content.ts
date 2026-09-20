import type { Provider } from '@/types/track';
import type { RequestHandler } from 'msw';
import { lyricsFor } from '../data/lyrics';
import {
  CATALOG,
  DAILY_SONGS,
  PODCAST_CHANNELS,
  USER_PLAYLISTS,
  platformRecommendations,
  podcastPrograms,
  searchTracks,
} from '../data/catalog';
import { session } from '../session';
import { http, HttpResponse, NET } from './util';

/**
 * 首页聚合、天气电台、歌词、播客详情、听歌统计、节拍缓存。
 */

/* ---------------- 首页 ---------------- */

const discoverHome = http.get('/api/discover/home', async () => {
  await NET();
  const primary = session.status('netease');
  return HttpResponse.json({
    loggedIn: primary.loggedIn,
    user: primary.loggedIn
      ? { userId: primary.userId, nickname: primary.nickname, avatar: primary.avatar }
      : null,
    dailySongs: DAILY_SONGS.slice(0, 18),
    dailySongTotal: DAILY_SONGS.length,
    dailySongsComplete: true,
    playlists: [...USER_PLAYLISTS.slice(0, 8)],
    podcasts: PODCAST_CHANNELS.slice(0, 6),
    mode: primary.loggedIn ? 'personalized' : 'guest',
    updatedAt: Date.now(),
  });
});

/**
 * 天气电台（原版首页主卡片的入口，server.js:4894）。
 * 真实实现走 Open-Meteo，取不到坐标时返回临时电台队列 —— 这条兜底分支保留。
 */
const weatherRadio = http.get('/api/weather/radio', async ({ request }) => {
  await NET();
  const q = new URL(request.url).searchParams;
  const lat = Number(q.get('lat'));
  const lon = Number(q.get('lon'));
  const valid = Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);

  if (!valid) {
    return HttpResponse.json({
      ok: true,
      location: null,
      weather: null,
      fallback: true,
      queue: searchTracks('netease', '', 12, 0),
      reason: 'WEATHER_FALLBACK_TEMP_RADIO',
    });
  }

  /* 按经纬度确定性地挑一个"天气"，让同一个城市每次结果一致 */
  const buckets = ['晴', '多云', '阴', '小雨', '雷阵雨', '雪'] as const;
  const bucket = buckets[Math.abs(Math.round((lat + lon) * 10)) % buckets.length]!;
  const provider: Provider = bucket === '晴' ? 'netease' : bucket === '小雨' ? 'qishui' : 'qq';

  return HttpResponse.json({
    ok: true,
    location: { city: q.get('city') ?? '未知城市', lat, lon, resolvedBy: 'manual' },
    weather: {
      text: bucket,
      temperature: 12 + (Math.abs(Math.round(lat * 3)) % 18),
      windSpeed: 3 + (Math.abs(Math.round(lon * 5)) % 12),
      humidity: 40 + (Math.abs(Math.round(lat * lon)) % 55),
    },
    fallback: false,
    queue: platformRecommendations(provider, 14),
  });
});

const ipLocation = http.get('/api/weather/ip-location', async () => {
  await NET();
  /* 真实后端调 ip 库；离线环境直接给一个明确的默认城市，不假装有定位精度 */
  return HttpResponse.json({
    ok: true,
    city: '杭州',
    lat: 30.2741,
    lon: 120.1551,
    resolvedBy: 'mock-default',
  });
});

/* ---------------- 歌词 ---------------- */

function lyricRoute(p: Provider, path: string): RequestHandler {
  return http.get(path, async ({ request }) => {
    await NET();
    const q = new URL(request.url).searchParams;
    const id = q.get('id') ?? q.get('mid') ?? q.get('hash') ?? q.get('trackId') ?? '';
    const song = CATALOG[p]?.find((t) => t.id === id || t.mid === id || t.fileHash === id);
    const { lyric, tlyric } = lyricsFor(id || 'unknown', song?.duration ?? 210);

    if (p === 'netease') {
      return HttpResponse.json({ lyric, tlyric, yrc: '', ytlrc: '', romalrc: '', yromalrc: '', source: 'netease' });
    }
    if (p === 'qq') {
      return HttpResponse.json({ provider: 'qq', mid: q.get('mid') ?? id, id, lyric, tlyric, yrc: '', qrc: '', roma: '', source: 'qq' });
    }
    if (p === 'kugou') {
      return HttpResponse.json({ provider: 'kugou', hash: q.get('hash') ?? id, lyric, trans: tlyric });
    }
    return HttpResponse.json({ provider: 'qishui', track_id: id, lyric, tlyric, yrc: '', ytlrc: '', source: 'qishui' });
  });
}

/* ---------------- 播客 ---------------- */

const podcastDetail = http.get('/api/podcast/detail', async ({ request }) => {
  await NET();
  const rid = new URL(request.url).searchParams.get('id') ?? '';
  const ch = PODCAST_CHANNELS.find((c) => c.id === rid) ?? PODCAST_CHANNELS[0]!;
  return HttpResponse.json({
    code: 200,
    podcast: { ...ch, id: ch.id, name: ch.name },
    programs: podcastPrograms(ch.id, 20, 0),
  });
});

const podcastMy = http.get('/api/podcast/my', async () => {
  await NET();
  return HttpResponse.json({
    code: 200,
    /* 未登录时原版返回空集合，这里保持同样语义 */
    subscribe: session.status('netease').loggedIn ? PODCAST_CHANNELS.slice(0, 3) : [],
    count: session.status('netease').loggedIn ? 3 : 0,
  });
});

const podcastMyItems = http.get('/api/podcast/my/items', async ({ request }) => {
  await NET();
  const q = new URL(request.url).searchParams;
  const rid = q.get('rid') ?? PODCAST_CHANNELS[0]!.id;
  const limit = Number(q.get('limit')) || 20;
  const offset = Number(q.get('offset')) || 0;
  const programs = podcastPrograms(rid, limit, offset);
  return HttpResponse.json({
    code: 200,
    programs,
    more: offset + limit < 40,
    offset,
    limit,
    lastTime: Date.now() - (offset + limit) * 3_600_000,
  });
});

/**
 * DJ 长音频离线锁拍（/api/podcast/dj-beatmap，server.js:6127 → {ok,map}）。
 * 真实实现走 dj-analyzer.js + music-tempo；这里给一个按 BPM 均匀分布的拍点图，
 * 足够驱动 DJ 视觉模式的锁拍与过渡提示。
 */
const djBeatmap = http.get('/api/podcast/dj-beatmap', async ({ request }) => {
  await NET();
  const q = new URL(request.url).searchParams;
  const duration = Number(q.get('duration')) || 1800;
  const intro = Number(q.get('intro')) || 0;
  const url = q.get('url') ?? '';
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
  const bpm = 84 + (h % 40);
  const period = 60 / bpm;

  const beats: number[] = [];
  for (let t = intro; t < duration; t += period) beats.push(Math.round(t * 1000) / 1000);

  return HttpResponse.json({
    ok: true,
    map: {
      bpm,
      duration,
      intro,
      beats,
      strong: beats.filter((_, i) => i % 4 === 0),
      generatedBy: 'mock-deterministic',
    },
  });
});

/* ---------------- 听歌统计 ---------------- */

const listenReport = http.post('/api/listen/report', async ({ request }) => {
  await NET();
  const body = (await request.json().catch(() => ({}))) as { listenMs?: number; completed?: boolean };
  session.listenTotalMs += Math.max(0, Math.min(4200, Number(body.listenMs) || 0));
  if (body.completed) session.listenSessions += 1;
  return HttpResponse.json({ ok: true, totalListenMs: session.listenTotalMs });
});

const listenTotal = http.get('/api/listen/total', async ({ request }) => {
  await NET();
  const provider = (new URL(request.url).searchParams.get('provider') ?? 'all') as string;
  const daily: Record<string, { listenMs: number; sessions: number; completed: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    daily[key] = {
      listenMs: 60_000 * (7 + ((i * 37) % 55)),
      sessions: 1 + (i % 6),
      completed: i % 4,
    };
  }
  const total = Object.values(daily).reduce((a, b) => a + b.listenMs, 0) + session.listenTotalMs;
  return HttpResponse.json({
    ok: true,
    provider,
    totalListenMs: total,
    sessions: session.listenSessions + Object.values(daily).reduce((a, b) => a + b.sessions, 0),
    daily,
    updatedAt: Date.now(),
  });
});

/* ---------------- 节拍缓存 ---------------- */

const beatCacheStatus = http.get('/api/beatmap/cache/status', () =>
  HttpResponse.json({ ok: true, enabled: false, entries: 0, bytes: 0, dir: 'mock' }),
);

const beatCacheGet = http.get('/api/beatmap/cache', ({ request }) => {
  const key = new URL(request.url).searchParams.get('key') ?? '';
  return HttpResponse.json({ ok: false, hit: false, key });
});

const beatCachePut = http.post('/api/beatmap/cache', async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as { key?: string };
  return HttpResponse.json({ ok: true, stored: Boolean(body.key) });
});

export const contentHandlers: RequestHandler[] = [
  discoverHome,
  weatherRadio,
  ipLocation,
  lyricRoute('netease', '/api/lyric'),
  lyricRoute('qq', '/api/qq/lyric'),
  lyricRoute('kugou', '/api/kugou/lyric'),
  lyricRoute('qishui', '/api/qishui/lyric'),
  podcastDetail,
  podcastMy,
  podcastMyItems,
  djBeatmap,
  listenReport,
  listenTotal,
  beatCacheStatus,
  beatCacheGet,
  beatCachePut,
];
