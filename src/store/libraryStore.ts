import { create } from 'zustand';
import type { Playlist, Provider, Track } from '@/types/track';
import { fetchCollectTargets, fetchPlaylistTracks, fetchUserPlaylists, type HydratedPage } from '@/services/playlist';
import { queueItemKey } from '@/types/track';
import { usePlayerStore } from './playerStore';

/**
 * 歌单缓存与队列水合。
 *
 * 对应原版 09-queue-snapshot-autoplay.js 的 queueHydrationState：
 * 一个 token + 分页游标，切歌单时旧请求必须作废，否则两首歌的结果会叠在一起。
 * 原版还有 warmPagesRemaining（后台预热下一页），这里保留同名的 prefetch 动作。
 */

interface Hydration {
  token: number;
  active: boolean;
  loading: boolean;
  provider: Provider | null;
  playlistId: string | null;
  title: string;
  total: number;
  nextOffset: number;
  hasMore: boolean;
  loaded: number;
  error: string | null;
}

interface LibraryState {
  playlists: Record<Provider, Playlist[]>;
  builtIn: Playlist[];
  loadingLists: Partial<Record<Provider, boolean>>;
  hydration: Hydration;
  /** 详情页当前展开的歌单 */
  openPlaylistId: string | null;
  detailTracks: Track[];
  detailLoading: boolean;
  collectTargets: Playlist[];

  loadPlaylists(provider: Provider, force?: boolean): Promise<Playlist[]>;
  loadBuiltIn(list: Playlist[]): void;
  openPlaylist(provider: Provider, id: string, replaceQueue: boolean): Promise<Track[]>;
  loadMore(signal?: AbortSignal): Promise<Track[]>;
  prefetchNextPage(): Promise<void>;
  fetchCollect(provider: Provider): Promise<Playlist[]>;
}

const emptyLists = (): Record<Provider, Playlist[]> => ({
  netease: [], qq: [], kugou: [], qishui: [], spotify: [], local: [],
});

export const useLibraryStore = create<LibraryState>((set, get) => ({
  playlists: emptyLists(),
  builtIn: [],
  loadingLists: {},
  openPlaylistId: null,
  detailTracks: [],
  detailLoading: false,
  collectTargets: [],
  hydration: {
    token: 0, active: false, loading: false, provider: null, playlistId: null,
    title: '', total: 0, nextOffset: 0, hasMore: false, loaded: 0, error: null,
  },

  loadPlaylists: async (provider, force = false) => {
    const cached = get().playlists[provider];
    if (cached.length && !force) return cached;
    set((s) => ({ loadingLists: { ...s.loadingLists, [provider]: true } }));

    const res = await fetchUserPlaylists(provider, { paged: true, limit: 40 }).catch(() => null);
    const lists = res?.playlists ?? [];
    set((s) => ({
      playlists: { ...s.playlists, [provider]: lists },
      loadingLists: { ...s.loadingLists, [provider]: false },
    }));
    return lists;
  },

  loadBuiltIn: (list) => set({ builtIn: list }),

  /**
   * 打开歌单：先取第一页。replaceQueue 为真时直接把整首歌单变成播放队列，
   * 与原版点歌单封面的行为一致；为假时只填详情页，不动当前队列。
   */
  openPlaylist: async (provider, id, replaceQueue) => {
    const token = get().hydration.token + 1;
    set((s) => ({
      openPlaylistId: id,
      detailLoading: true,
      detailTracks: [],
      hydration: { ...s.hydration, token, active: true, loading: true, provider, playlistId: id, error: null },
    }));

    const page = await fetchPlaylistTracks(provider, id, 30, 0).catch(() => null);

    if (get().hydration.token !== token) return [];

    const tracks = page?.tracks ?? [];
    set((s) => ({
      detailTracks: tracks,
      detailLoading: false,
      hydration: {
        ...s.hydration,
        loading: false,
        title: page?.playlist?.name ?? '',
        total: page?.total ?? tracks.length,
        nextOffset: page?.nextOffset ?? tracks.length,
        hasMore: page?.hasMore ?? false,
        loaded: tracks.length,
        error: page ? null : '歌单加载失败',
      },
    }));

    if (replaceQueue && tracks.length) {
      await usePlayerStore.getState().setQueue(tracks, 0, page?.playlist?.name ?? '歌单');
    }
    return tracks;
  },

  loadMore: async (signal) => {
    const { hydration } = get();
    if (!hydration.provider || !hydration.playlistId || !hydration.hasMore) return [];
    const token = hydration.token;
    set((s) => ({ hydration: { ...s.hydration, loading: true } }));

    const page: HydratedPage | null = await fetchPlaylistTracks(
      hydration.provider, hydration.playlistId, 30, hydration.nextOffset, signal,
    ).catch(() => null);

    if (get().hydration.token !== token || !page) {
      set((s) => ({ hydration: { ...s.hydration, loading: false } }));
      return [];
    }

    const fresh = page.tracks.filter((t) => !get().detailTracks.some((e) => queueItemKey(e) === queueItemKey(t)));
    set((s) => ({
      detailTracks: [...s.detailTracks, ...fresh],
      hydration: {
        ...s.hydration,
        loading: false,
        nextOffset: page.nextOffset,
        hasMore: page.hasMore,
        loaded: s.hydration.loaded + page.tracks.length,
      },
    }));
    return fresh;
  },

  /** 原版会预热下一页，让「加载更多」几乎瞬时 */
  prefetchNextPage: async () => {
    const { hydration } = get();
    if (!hydration.hasMore || hydration.loading) return;
    const { provider, playlistId, nextOffset } = hydration;
    if (!provider || !playlistId) return;
    await fetchPlaylistTracks(provider, playlistId, 30, nextOffset).catch(() => null);
  },

  fetchCollect: async (provider) => {
    const list = await fetchCollectTargets(provider).catch(() => []);
    set({ collectTargets: list });
    return list;
  },
}));
