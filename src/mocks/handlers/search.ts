import type { Provider, Track } from '@/types/track';
import type { RequestHandler } from 'msw';
import {
  PODCAST_CHANNELS,
  platformRecommendations,
  podcastPrograms,
  searchAll,
  searchTracks,
} from '../data/catalog';
import { session } from '../session';
import { http, HttpResponse, NET } from './util';

/**
 * 搜索与推荐。
 *
 * 每个平台的返回外壳不完全一样（qq / kugou 带 provider，汽水带 configured），
 * 分页字段 nextOffset / hasMore 是原版队列水合 queueHydrationState 依赖的，
 * 所以这里按 server.js 的实际差异分别构造，而不是统一成一个形状。
 */

const clamp = (v: string | null, min: number, max: number, dft: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.trunc(n))) : dft;
};

function page(fields: Record<string, unknown>, songs: Track[], offset: number, limit: number, total: number) {
  const nextOffset = offset + limit;
  return {
    songs,
    offset,
    limit,
    nextOffset,
    hasMore: nextOffset < total,
    ...fields,
  };
}

const neteaseSearch = http.get('/api/search', async ({ request }) => {
  await NET();
  const q = new URL(request.url).searchParams;
  const keywords = q.get('keywords') ?? q.get('keyword') ?? '';
  const limit = clamp(q.get('limit'), 1, 50, 20);
  const offset = clamp(q.get('offset'), 0, 100_000, 0);
  const songs = searchAll(keywords, limit, offset);
  return HttpResponse.json(
    page({}, songs, offset, limit, searchAll(keywords, 1000, 0).length),
  );
});

const qqSearch = http.get('/api/qq/search', async ({ request }) => {
  await NET();
  const q = new URL(request.url).searchParams;
  const keywords = q.get('keywords') ?? '';
  const limit = clamp(q.get('limit'), 4, 30, 12);
  const offset = clamp(q.get('offset'), 0, 100_000, 0);
  const songs = searchTracks('qq', keywords, limit, offset);
  return HttpResponse.json(page({ provider: 'qq' }, songs, offset, limit, 24));
});

const kugouSearch = http.get('/api/kugou/search', async ({ request }) => {
  await NET();
  const q = new URL(request.url).searchParams;
  const keywords = q.get('keywords') ?? '';
  const limit = clamp(q.get('limit'), 1, 50, 20);
  const offset = clamp(q.get('offset'), 0, 100_000, 0);
  const songs = searchTracks('kugou', keywords, limit, offset);
  return HttpResponse.json(page({ provider: 'kugou' }, songs, offset, limit, 24));
});

const qishuiSearch = http.get('/api/qishui/search', async ({ request }) => {
  await NET();
  const q = new URL(request.url).searchParams;
  const keywords = q.get('keywords') ?? '';
  const limit = clamp(q.get('limit'), 1, 50, 20);
  const offset = clamp(q.get('offset'), 0, 100_000, 0);
  const songs = searchTracks('qishui', keywords, limit, offset);
  return HttpResponse.json({
    provider: 'qishui',
    configured: session.status('qishui').configured === true,
    songs,
    offset,
    limit,
    nextOffset: offset + limit,
    hasMore: offset + limit < 24,
  });
});

const kugouRecommendations = http.get('/api/kugou/recommendations', async () => {
  await NET();
  return HttpResponse.json({ ok: true, provider: 'kugou', songs: platformRecommendations('kugou', 12) });
});

const qishuiFeed = http.get('/api/qishui/feed', async () => {
  await NET();
  return HttpResponse.json({
    ok: true,
    provider: 'qishui',
    configured: true,
    songs: platformRecommendations('qishui', 12),
  });
});

const podcastSearch = http.get('/api/podcast/search', async ({ request }) => {
  await NET();
  const q = new URL(request.url).searchParams;
  const kw = (q.get('keywords') ?? '').trim().toLowerCase();
  const categories = kw
    ? PODCAST_CHANNELS.filter((c) => c.name.toLowerCase().includes(kw))
    : PODCAST_CHANNELS;
  return HttpResponse.json({
    code: 200,
    categories,
    podcasts: categories,
    hasMore: false,
    limit: clamp(q.get('limit'), 1, 50, 20),
    offset: clamp(q.get('offset'), 0, 100_000, 0),
  });
});

const podcastHot = http.get('/api/podcast/hot', async ({ request }) => {
  await NET();
  const limit = clamp(new URL(request.url).searchParams.get('limit'), 1, 50, 12);
  return HttpResponse.json({
    code: 200,
    cats: [{ name: '热门' }],
    podcasts: PODCAST_CHANNELS.slice(0, limit),
  });
});

const podcastProgramsRoute = http.get('/api/podcast/programs', async ({ request }) => {
  await NET();
  const q = new URL(request.url).searchParams;
  const rid = q.get('rid') ?? '';
  const limit = clamp(q.get('limit'), 1, 100, 20);
  const offset = clamp(q.get('offset'), 0, 100_000, 0);
  const programs = podcastPrograms(rid, limit, offset);
  return HttpResponse.json({
    code: 200,
    programs,
    offset,
    limit,
    nextOffset: offset + limit,
    hasMore: offset + limit < 40,
  });
});

/** 歌手 / 专辑详情：原版 artist 详情页会给每首歌挂「播放下一首」「收藏到歌单」 */
const artistDetail = (provider: Provider, path: string) =>
  http.get(path, async ({ request }) => {
    await NET();
    const q = new URL(request.url).searchParams;
    const id = q.get('id') ?? q.get('artistId') ?? '';
    const songs = searchTracks(provider, '', 20, 0).map((t) => ({ ...t, artistId: id }));
    return HttpResponse.json({
      ok: true,
      provider,
      artist: { id, name: songs[0]?.artist ?? '未知艺人', picUrl: songs[0]?.cover },
      songs,
    });
  });

const albumDetail = (provider: Provider, path: string) =>
  http.get(path, async ({ request }) => {
    await NET();
    const q = new URL(request.url).searchParams;
    const id = q.get('id') ?? q.get('albumId') ?? '';
    const songs = searchTracks(provider, '', 12, 0);
    return HttpResponse.json({
      ok: true,
      provider,
      album: { id, name: songs[0]?.album ?? '未知专辑', cover: songs[0]?.cover, songs },
      songs,
    });
  });

export const searchHandlers: RequestHandler[] = [
  neteaseSearch,
  qqSearch,
  kugouSearch,
  qishuiSearch,
  kugouRecommendations,
  qishuiFeed,
  podcastSearch,
  podcastHot,
  podcastProgramsRoute,
  artistDetail('netease', '/api/artist/detail'),
  artistDetail('qq', '/api/qq/artist/detail'),
  albumDetail('netease', '/api/album/detail'),
  albumDetail('qq', '/api/qq/album/detail'),
];
