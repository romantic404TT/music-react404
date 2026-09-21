import type { RequestHandler } from 'msw';
import { BUILT_IN_PLAYLISTS, CATALOG } from '../data/catalog';
import { LOCAL_LYRICS, findLocalTrack } from '../data/local-tracks';
import { session } from '../session';
import { http, HttpResponse, NET } from './util';

/**
 * 本地曲目端点。
 *
 * 与合成音源的根本区别：这里返回的 url 指向 public/music 下的真实文件，
 * 响应带 local:true，播放引擎据此改用元素自身的 duration/currentTime。
 * 歌词返回用户提供的 .lrc 原文，不再是模板合成。
 */

const clamp = (v: string | null, min: number, max: number, dft: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.trunc(n))) : dft;
};

const LOCAL_PLAYLIST = BUILT_IN_PLAYLISTS.find((p) => p.id === 'builtin-local')!;

const localSongUrl = http.get('/api/local/song/url', async ({ request }) => {
  await NET();
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const track = CATALOG.local.find((t) => t.id === id);
  const def = findLocalTrack(id);

  if (!track || !def) {
    return HttpResponse.json({
      provider: 'local',
      url: null,
      playable: false,
      reason: 'LOCAL_FILE_MISSING',
      message: 'public/music 下找不到这个曲目对应的文件',
    });
  }

  return HttpResponse.json({
    provider: 'local',
    source: 'local',
    url: def.audioUrl,
    local: true,
    playable: true,
    trial: false,
    level: 'standard',
    quality: '本地文件',
    br: 192,
    loggedIn: session.status('local').loggedIn,
  });
});

const localLyric = http.get('/api/local/lyric', async ({ request }) => {
  await NET();
  const id = new URL(request.url).searchParams.get('id') ?? '';
  return HttpResponse.json({
    provider: 'local',
    lyric: LOCAL_LYRICS[id] ?? '',
    tlyric: '',
    source: 'local-file',
  });
});

const localSearch = http.get('/api/local/search', async ({ request }) => {
  await NET();
  const q = new URL(request.url).searchParams;
  const kw = (q.get('keywords') ?? '').trim().toLowerCase();
  const limit = clamp(q.get('limit'), 1, 50, 20);
  const offset = clamp(q.get('offset'), 0, 10_000, 0);
  const matched = kw
    ? CATALOG.local.filter(
        (t) =>
          t.name.toLowerCase().includes(kw) ||
          (t.artist ?? '').toLowerCase().includes(kw) ||
          (t.album ?? '').toLowerCase().includes(kw),
      )
    : CATALOG.local;
  const songs = matched.slice(offset, offset + limit);
  return HttpResponse.json({
    provider: 'local',
    songs,
    offset,
    limit,
    nextOffset: offset + limit,
    hasMore: offset + limit < matched.length,
  });
});

const localPlaylists = http.get('/api/local/user/playlists', async () => {
  await NET();
  return HttpResponse.json({ loggedIn: true, playlists: [LOCAL_PLAYLIST], total: 1 });
});

const localPlaylistTracks = http.get('/api/local/playlist/tracks', async ({ request }) => {
  await NET();
  const q = new URL(request.url).searchParams;
  const limit = clamp(q.get('limit'), 1, 200, 50);
  const offset = clamp(q.get('offset'), 0, 10_000, 0);
  const tracks = CATALOG.local.slice(offset, offset + limit);
  return HttpResponse.json({
    playlist: LOCAL_PLAYLIST,
    tracks,
    offset,
    limit,
    nextOffset: offset + limit,
    hasMore: offset + limit < CATALOG.local.length,
    total: CATALOG.local.length,
    partial: false,
  });
});

export const localHandlers: RequestHandler[] = [
  localSongUrl,
  localLyric,
  localSearch,
  localPlaylists,
  localPlaylistTracks,
];
