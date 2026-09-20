import type { Provider } from '@/types/track';
import type { RequestHandler } from 'msw';
import { BUILT_IN_PLAYLISTS, USER_PLAYLISTS, playlistTracks } from '../data/catalog';
import { session } from '../session';
import { http, HttpResponse, NET } from './util';

/**
 * 歌单：列表、曲目分页水合、新建、加歌、收藏到歌单。
 *
 * 原版队列水合（queueHydrationState）依赖 nextOffset / hasMore / partial 三个字段，
 * 「加载更多」也是靠它们判断的，所以这里分页语义必须真。
 * 未登录时 user/playlists 退到内置歌单 —— 与原版「不登录也能听」的行为一致。
 */

const clamp = (v: string | null, min: number, max: number, dft: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.trunc(n))) : dft;
};

function playlistsFor(p: Provider) {
  const own = USER_PLAYLISTS.filter((pl) => pl.provider === p);
  return [...BUILT_IN_PLAYLISTS, ...own, ...session.createdPlaylists.filter((pl) => pl.provider === p)];
}

function userPlaylistsRoute(p: Provider, path: string): RequestHandler {
  return http.get(path, async ({ request }) => {
    await NET();
    const q = new URL(request.url).searchParams;
    const loggedIn = session.status(p).loggedIn;
    const paged = q.get('paged') === '1';
    const limit = clamp(q.get('limit'), 1, 100, 30);
    const offset = clamp(q.get('offset'), 0, 10_000, 0);
    const all = loggedIn ? playlistsFor(p) : BUILT_IN_PLAYLISTS;

    if (!paged) {
      return HttpResponse.json({
        loggedIn,
        userId: loggedIn ? session.status(p).userId : undefined,
        playlists: all,
      });
    }

    const slice = all.slice(offset, offset + limit);
    return HttpResponse.json({
      loggedIn,
      userId: loggedIn ? session.status(p).userId : undefined,
      playlists: slice,
      total: all.length,
      offset,
      limit,
      nextOffset: offset + limit,
      hasMore: offset + limit < all.length,
      partial: false,
    });
  });
}

function playlistTracksRoute(p: Provider, path: string): RequestHandler {
  return http.get(path, async ({ request }) => {
    await NET();
    const q = new URL(request.url).searchParams;
    const id = q.get('id') ?? '';
    const limit = clamp(q.get('limit'), 1, 200, 30);
    const offset = clamp(q.get('offset'), 0, 100_000, 0);
    const paged = q.get('paged') !== '0';

    const playlist =
      playlistsFor(p).find((pl) => pl.id === id) ??
      BUILT_IN_PLAYLISTS.find((pl) => pl.id === id) ?? {
        provider: p,
        id,
        name: '未知歌单',
        trackCount: 40,
      };

    const declared = playlist.trackCount ?? 30;
    const tracks = playlistTracks(id, limit, offset);

    /* 原版有 playlist_track_all -> playlist_detail 的降级；越界时返回 partial 而不是报错 */
    if (offset >= declared) {
      return HttpResponse.json({
        playlist,
        tracks: [],
        offset,
        limit,
        nextOffset: offset,
        hasMore: false,
        total: declared,
        partial: true,
      });
    }

    return HttpResponse.json(
      paged
        ? {
            playlist,
            tracks,
            offset,
            limit,
            nextOffset: offset + limit,
            hasMore: offset + limit < declared,
            total: declared,
            partial: false,
          }
        : { playlist, tracks: playlistTracks(id, declared, 0) },
    );
  });
}

const createPlaylist = http.post('/api/playlist/create', async ({ request }) => {
  await NET();
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? '').trim();
  if (!name) {
    return HttpResponse.json({ code: 400, message: '歌单名称不能为空' }, { status: 400 });
  }
  const id = `local-pl-${Date.now().toString(36)}`;
  session.createdPlaylists.push({
    provider: 'netease',
    id,
    name,
    cover: '',
    trackCount: 0,
    subscribed: true,
    tag: ['创建'],
  });
  return HttpResponse.json({ code: 200, id, playlist: { id, name } });
});

const addSong = http.post('/api/playlist/add-song', async ({ request }) => {
  await NET();
  const body = (await request.json().catch(() => ({}))) as { playlistId?: string; id?: string };
  const target = session.createdPlaylists.find((pl) => pl.id === body.playlistId);
  if (!target) {
    return HttpResponse.json({ code: 404, message: '歌单不存在' }, { status: 404 });
  }
  target.trackCount = (target.trackCount ?? 0) + 1;
  return HttpResponse.json({ code: 200, message: '已添加到歌单', trackCount: target.trackCount });
});

/** 专辑订阅（原版艺人/详情页的收藏入口） */
const subscribe = http.post('/api/album/subscribe', async ({ request }) => {
  await NET();
  const body = (await request.json().catch(() => ({}))) as { id?: string; add?: boolean };
  return HttpResponse.json({ code: 200, subscribed: body.add !== false, id: body.id ?? '' });
});

const subscribeCheck = http.get('/api/album/subscribe/check', async () => {
  await NET();
  return HttpResponse.json({ code: 200, subscribed: false });
});

/** 收藏到歌单弹窗要的列表：未登录时给内置的，登录后给全部 */
const collectTargets = http.get('/api/playlist/subscribe', async ({ request }) => {
  await NET();
  const q = new URL(request.url).searchParams;
  const provider = (q.get('provider') ?? 'netease') as Provider;
  const loggedIn = session.status(provider).loggedIn;
  const list = loggedIn ? [...BUILT_IN_PLAYLISTS, ...USER_PLAYLISTS, ...session.createdPlaylists] : BUILT_IN_PLAYLISTS;
  return HttpResponse.json({ code: 200, playlist: list.map((pl) => ({ id: pl.id, name: pl.name, cover: pl.cover })) });
});

export const libraryHandlers: RequestHandler[] = [
  userPlaylistsRoute('netease', '/api/user/playlists'),
  userPlaylistsRoute('qq', '/api/qq/user/playlists'),
  userPlaylistsRoute('kugou', '/api/kugou/user/playlists'),
  userPlaylistsRoute('qishui', '/api/qishui/user/playlists'),
  playlistTracksRoute('netease', '/api/playlist/tracks'),
  playlistTracksRoute('qq', '/api/qq/playlist/tracks'),
  playlistTracksRoute('kugou', '/api/kugou/playlist/tracks'),
  playlistTracksRoute('qishui', '/api/qishui/playlist/tracks'),
  createPlaylist,
  addSong,
  subscribe,
  subscribeCheck,
  collectTargets,
];
