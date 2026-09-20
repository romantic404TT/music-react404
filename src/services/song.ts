import { apiGet, apiPost } from '@/lib/http';
import type { LyricResponse } from '@/types/api';
import type { Provider, QualityLevel } from '@/types/track';
import { queueItemKey, type Track } from '@/types/track';

/**
 * 音源解析与跨平台同曲回退。
 *
 * 这是原版 11-provider-fallback.js（36KB）的收敛版：
 * 同一首歌在 A 平台无权益时，带 excludeIds 再问其他平台，命中后
 * 后端会回 sourceMatch / matchKind / matchedSong，用于在界面上标"换源播放"。
 */

const URL_PATH: Record<Provider, string> = {
  netease: '/api/song/url',
  qq: '/api/qq/song/url',
  kugou: '/api/kugou/song/url',
  qishui: '/api/qishui/song/url',
  spotify: '/api/spotify/song/url',
};

const LYRIC_PATH: Record<Provider, string> = {
  netease: '/api/lyric',
  qq: '/api/qq/lyric',
  kugou: '/api/kugou/lyric',
  qishui: '/api/qishui/lyric',
  spotify: '/api/spotify/lyric',
};

export interface ResolvedSource {
  url: string | null;
  playable: boolean;
  provider: Provider;
  /** 实际命中同一首歌的平台（回退时与原平台不同） */
  resolvedProvider?: Provider;
  sourceMatch?: boolean;
  matchKind?: string;
  reason?: string;
  message?: string;
  restriction?: string | null;
  trial?: boolean;
  level?: QualityLevel;
  quality?: string;
  br?: number;
  /** 合成底床的派生种子，mock 的 /api/audio 用它还原同一段节奏 */
  seed?: string;
}

const TRY_ORDER: Provider[] = ['netease', 'qq', 'kugou', 'qishui'];

function idParams(song: Track): Record<string, string | number | undefined> {
  return {
    id: song.id,
    name: song.name,
    artist: song.artist,
    artistId: song.artistId,
    album: song.album,
    duration: song.duration,
    mid: song.mid ?? song.songmid,
    mediaMid: song.mediaMid,
    hash: song.fileHash ?? song.hash,
    hqHash: song.hqHash,
    sqHash: song.sqHash,
    resHash: song.resHash,
    trackId: song.trackId ?? song.providerSongId,
    fee: song.fee,
    needVip: song.needVip ? 'true' : undefined,
    vipRequired: song.vipRequired ? 'true' : undefined,
  };
}

export async function resolveSongUrl(
  song: Track,
  quality: QualityLevel,
  signal?: AbortSignal,
): Promise<ResolvedSource> {
  const order = [song.provider, ...TRY_ORDER.filter((p) => p !== song.provider)] as Provider[];
  const tried: string[] = [];
  let lastFailure: ResolvedSource | null = null;

  for (const provider of order) {
    const res = await apiGet<ResolvedSource>(
      URL_PATH[provider],
      { ...idParams(song), quality, excludeIds: tried.join(',') },
      signal,
    ).catch(() => null);

    if (res?.url && res.playable !== false) {
      return { ...res, provider, resolvedProvider: provider };
    }

    tried.push(provider);
    lastFailure = {
      url: null,
      playable: false,
      provider,
      reason: res?.reason ?? 'NO_SOURCE',
      message: res?.message ?? '该音源暂无可用地址',
      restriction: res?.restriction ?? null,
      trial: Boolean(res?.trial),
    };
  }

  return lastFailure ?? { url: null, playable: false, provider: song.provider, reason: 'NO_SOURCE', message: '所有音源均不可用' };
}

export function fetchLyric(song: Track, signal?: AbortSignal): Promise<LyricResponse> {
  return apiGet<LyricResponse>(LYRIC_PATH[song.provider], { ...idParams(song) }, signal);
}

export function checkLiked(song: Track, signal?: AbortSignal): Promise<{ isLike: boolean }> {
  return apiGet<{ isLike: boolean }>('/api/song/like/check', { id: queueItemKey(song) }, signal).catch(() => ({ isLike: false }));
}

export function toggleLike(song: Track, like: boolean): Promise<{ liked: boolean }> {
  return apiGet<{ liked: boolean }>('/api/song/like', { id: queueItemKey(song), like: like ? 'true' : 'false' });
}

export interface CommentPage {
  code: number;
  data?: { total: number; comments: unknown[] };
}

export function fetchComments(song: Track, limit = 20): Promise<CommentPage> {
  return apiGet<CommentPage>('/api/song/comments', { id: song.id, limit });
}

export function createPlaylist(name: string): Promise<{ code: number; id?: string }> {
  return apiPost('/api/playlist/create', { name });
}

export function addToPlaylist(playlistId: string, song: Track): Promise<{ code: number; message?: string }> {
  return apiPost('/api/playlist/add-song', { playlistId, id: queueItemKey(song) });
}
