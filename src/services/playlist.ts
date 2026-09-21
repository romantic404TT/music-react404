import { apiGet } from '@/lib/http';
import type { PlaylistTracksResponse, UserPlaylistsResponse } from '@/types/api';
import type { Playlist, Provider, Track } from '@/types/track';

/** 歌单列表与曲目分页水合（对应原版 queueHydrationState 那一套） */

const PLAYLIST_PATH: Record<Provider, string> = {
  netease: '/api/user/playlists',
  qq: '/api/qq/user/playlists',
  kugou: '/api/kugou/user/playlists',
  qishui: '/api/qishui/user/playlists',
  spotify: '/api/spotify/user/playlists',
  local: '/api/local/user/playlists',
};

const TRACKS_PATH: Record<Provider, string> = {
  netease: '/api/playlist/tracks',
  qq: '/api/qq/playlist/tracks',
  kugou: '/api/kugou/playlist/tracks',
  qishui: '/api/qishui/playlist/tracks',
  spotify: '/api/spotify/playlist/tracks',
  local: '/api/local/playlist/tracks',
};

export interface HydratedPage {
  playlist: Playlist;
  tracks: Track[];
  offset: number;
  nextOffset: number;
  hasMore: boolean;
  total: number;
  partial: boolean;
}

export async function fetchUserPlaylists(
  provider: Provider,
  opts: { paged?: boolean; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<UserPlaylistsResponse> {
  return apiGet<UserPlaylistsResponse>(
    PLAYLIST_PATH[provider],
    { paged: opts.paged ? '1' : undefined, limit: opts.limit, offset: opts.offset },
    signal,
  );
}

export async function fetchPlaylistTracks(
  provider: Provider,
  playlistId: string,
  limit = 30,
  offset = 0,
  signal?: AbortSignal,
): Promise<HydratedPage> {
  const res = await apiGet<PlaylistTracksResponse>(
    TRACKS_PATH[provider],
    { id: playlistId, limit, offset },
    signal,
  );
  const total = res.total ?? res.playlist?.trackCount ?? res.tracks.length;
  return {
    playlist: res.playlist,
    tracks: res.tracks ?? [],
    offset: res.offset ?? offset,
    nextOffset: res.nextOffset ?? offset + limit,
    hasMore: res.hasMore ?? false,
    total,
    partial: res.partial ?? false,
  };
}

/** 收藏到歌单弹窗的候选列表 */
export async function fetchCollectTargets(provider: Provider, signal?: AbortSignal): Promise<Playlist[]> {
  const res = await apiGet<{ code: number; playlist: Playlist[] }>('/api/playlist/subscribe', { provider }, signal);
  return res.playlist ?? [];
}
