import { apiGet } from '@/lib/http';
import type { SearchMode, SearchResponse } from '@/types/api';
import type { Provider, Track } from '@/types/track';
import { SEARCH_MODES } from '@/types/api';

/**
 * 搜索客户端。
 *
 * 原版把 5 个平台分散在 07-search.js 的多个函数里，"全部"模式是并发打各平台再合并。
 * 这里保持同样的调度：all → 各平台并取，再按 provider 交错合并，
 * 因为原版搜索结果列表就是按平台混排的。
 */

const PATH: Record<Provider, string> = {
  netease: '/api/search',
  qq: '/api/qq/search',
  kugou: '/api/kugou/search',
  qishui: '/api/qishui/search',
  spotify: '/api/spotify/search',
  local: '/api/local/search',
};

export interface SearchPage {
  songs: Track[];
  hasMore: boolean;
  nextOffset: number;
}

export async function search(
  mode: SearchMode,
  keywords: string,
  limit = 20,
  offset = 0,
  signal?: AbortSignal,
): Promise<SearchPage> {
  if (mode === 'all') {
    /* 四个远端音源 + 本地曲目各取一页再交错合并；本地不是"平台"，
       但它对用户来说就是能搜到的东西，所以并进全部。 */
    const providers: Provider[] = ['netease', 'qq', 'kugou', 'qishui'];
    const per = Math.max(4, Math.ceil(limit / (providers.length + 1)));
    const results = await Promise.all([
      ...providers.map((p) => apiGet<SearchResponse>(PATH[p], { keywords, limit: per, offset }, signal).catch(() => null)),
      apiGet<SearchResponse>(PATH.local, { keywords, limit: per, offset }, signal).catch(() => null),
    ]);
    const buckets = results.map((r) => r?.songs ?? []);
    /* 交错合并，避免同一平台连排 20 条 */
    const merged: Track[] = [];
    for (let i = 0; i < per; i++) {
      for (const b of buckets) {
        const t = b[i];
        if (t) merged.push(t);
      }
    }
    return { songs: merged.slice(0, limit), hasMore: buckets.some((b) => b.length >= per), nextOffset: offset + limit };
  }

  if (mode === 'podcast') {
    const res = await apiGet<{ podcasts?: Track[]; categories?: { id: string }[] }>(
      '/api/podcast/search', { keywords, limit, offset }, signal,
    );
    const songs = (res.podcasts ?? []) as unknown as Track[];
    return { songs, hasMore: false, nextOffset: offset + limit };
  }

  const res = await apiGet<SearchResponse>(PATH[mode], { keywords, limit, offset }, signal);
  return { songs: res.songs ?? [], hasMore: res.hasMore ?? false, nextOffset: res.nextOffset ?? offset + limit };
}

export function searchModeLabel(mode: SearchMode): string {
  return SEARCH_MODES.find((m) => m.key === mode)?.label ?? '全部';
}
