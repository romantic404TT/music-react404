import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EmptyState, SourceBadge, TrackRow } from '@/components/ui/primitives';
import { IconChevron, IconLoading, IconPlay } from '@/components/ui/Icons';
import { formatDuration, formatPlayCount } from '@/lib/format';
import { useLibraryStore } from '@/store/libraryStore';
import { usePlayerStore } from '@/store/playerStore';
import type { Playlist, Provider } from '@/types/track';
import { queueItemKey } from '@/types/track';

/**
 * 歌单详情。/playlist/:provider/:id，第一页与后续分页都走 libraryStore 的水合状态，
 * 那里有 hydration.token 保证换歌单时旧请求不会把结果叠到新歌单上。
 *
 * 封面 / 创建者这类头部元数据不在 tracks 响应里，所以从音乐库缓存（含首页喂进来的
 * 内置列表）按 id 反查；直接粘链接进来时查不到就退到歌单名与占位封面。
 */

const PROVIDER_KEYS: string[] = ['netease', 'qq', 'kugou', 'qishui', 'spotify', 'local'];

function asProvider(raw: string | undefined): Provider | null {
  return raw && (PROVIDER_KEYS as string[]).includes(raw) ? (raw as Provider) : null;
}

export function PlaylistDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  const provider = asProvider(params.provider);
  const id = params.id ?? '';

  const openPlaylist = useLibraryStore((s) => s.openPlaylist);
  const loadMore = useLibraryStore((s) => s.loadMore);
  const prefetchNextPage = useLibraryStore((s) => s.prefetchNextPage);
  const loadPlaylists = useLibraryStore((s) => s.loadPlaylists);
  const detailTracks = useLibraryStore((s) => s.detailTracks);
  const detailLoading = useLibraryStore((s) => s.detailLoading);
  const hydration = useLibraryStore((s) => s.hydration);
  const builtIn = useLibraryStore((s) => s.builtIn);
  const allLists = useLibraryStore((s) => s.playlists);

  const queue = usePlayerStore((s) => s.queue);
  const currentIdx = usePlayerStore((s) => s.currentIdx);
  const [failed, setFailed] = useState(false);

  const currentKey = queueItemKey(queue[currentIdx] ?? null);

  useEffect(() => {
    const p = asProvider(params.provider);
    if (!p || !params.id) {
      setFailed(true);
      return;
    }
    let alive = true;
    setFailed(false);
    /* 元数据依赖歌单列表，顺手拉一次（store 内有缓存，不会重复打接口） */
    void loadPlaylists(p);

    void openPlaylist(p, params.id, false).then((tracks) => {
      if (!alive) return;
      setFailed(tracks.length === 0);
      /* 原版会预热下一页，让「加载更多」几乎瞬时 */
      void prefetchNextPage();
    });

    return () => {
      alive = false;
    };
  }, [params.provider, params.id, openPlaylist, prefetchNextPage, loadPlaylists]);

  const meta: Playlist | undefined = useMemo(() => {
    const pool: Playlist[] = [...builtIn, ...allLists.netease, ...allLists.qq, ...allLists.kugou, ...allLists.qishui, ...allLists.spotify, ...allLists.local];
    return pool.find((pl) => pl.id === id);
  }, [builtIn, allLists, id]);

  const name = meta?.name || hydration.title || '歌单';
  const total = hydration.total || meta?.trackCount || detailTracks.length;
  const creator = meta?.creator?.nickname ?? provider ?? '';
  const loadedSeconds = detailTracks.reduce((acc, t) => acc + (t.duration ?? 0), 0);

  if (!provider || !id) {
    return (
      <div className="mx-auto w-home max-w-full pb-[150px] pt-16">
        <div className="glass-panel rounded-tile">
          <EmptyState
            title="链接不完整"
            hint="歌单地址要形如 /playlist/netease/1234567890，从音乐库点进来即可。"
            action={<button className="btn btn--primary" onClick={() => navigate('/library')}>回音乐库</button>}
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="mx-auto w-home max-w-full pb-[150px] pt-16">
      <button className="ctrl-btn mb-3 !w-auto gap-1.5 px-3 text-[12px]" onClick={() => navigate('/library')}>
        <IconChevron dir="left" size={13} />
        音乐库
      </button>

      {/* ---- 头部 ---- */}
      <header className="glass-panel flex flex-col gap-5 rounded-tile p-5 md:flex-row">
        {meta?.cover ? (
          <img src={meta.cover} alt="" className="cover h-[168px] w-[168px] shrink-0 !rounded-[14px]" />
        ) : (
          <div
            className="cover flex h-[168px] w-[168px] shrink-0 items-end justify-end !rounded-[14px] p-3"
            style={{ background: 'linear-gradient(140deg, rgba(var(--home-accent-rgb), .18), #0b0e11 70%)' }}
          >
            <span className="label-caps">no cover</span>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <SourceBadge provider={provider} />
            <span className="label-caps">playlist</span>
            {meta?.tag?.length ? <span className="chip !h-[18px] !px-2 !text-[9.5px]">{meta.tag[0]}</span> : null}
          </div>

          <h1 className="mt-2 truncate text-[24px] font-semibold leading-tight text-[var(--fc-ink)]">{name}</h1>

          <p className="mt-1.5 font-mono text-[11px] text-[var(--fc-muted)]">
            共 {total} 首 · 已载入 {detailTracks.length} 首
            {loadedSeconds ? ` · 约 ${formatDuration(loadedSeconds)}` : ''}
            {meta?.playCount !== undefined ? ` · ${formatPlayCount(meta.playCount)} 次播放` : ''}
          </p>
          <p className="mt-1 truncate text-[11.5px] text-[var(--fc-ink-2)]">
            {creator ? `创建者 ${creator}` : '创建者未知'}
          </p>
          {meta?.description ? (
            <p className="mt-2 line-clamp-3 text-[11.5px] leading-relaxed text-[var(--fc-muted)]">{meta.description}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              className="btn btn--primary"
              disabled={!detailTracks.length}
              onClick={() => void usePlayerStore.getState().setQueue(detailTracks, 0, name)}
            >
              <IconPlay size={14} />
              播放全部
            </button>
            <button className="btn" onClick={() => rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              回到顶部
            </button>
          </div>
        </div>
      </header>

      {/* ---- 曲目 ---- */}
      <section className="glass-panel mt-4 rounded-tile p-3">
        {detailLoading && !detailTracks.length ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="skeleton h-[46px]" />
            ))}
          </div>
        ) : null}

        {!detailLoading && failed && !detailTracks.length ? (
          <EmptyState
            title={hydration.error ?? '这个歌单是空的'}
            hint={
              provider === 'qishui'
                ? '汽水的歌单接口只回匹配到的曲目，取不到时这里就是空的。'
                : '可能是未登录导致该平台的歌单不可读，或者 id 不属于当前账号。'
            }
            action={
              <button className="btn" onClick={() => navigate('/library')}>
                换个歌单
              </button>
            }
          />
        ) : null}

        {detailTracks.length ? (
          <>
            {detailTracks.map((t, i) => (
              <TrackRow
                key={`${queueItemKey(t)}-${i}`}
                track={t}
                index={i}
                current={queueItemKey(t) === currentKey}
                onPlay={() => void usePlayerStore.getState().setQueue(detailTracks, i, name)}
              />
            ))}

            <div className="mt-3 flex items-center justify-center gap-3">
              {hydration.hasMore ? (
                <button className="btn" disabled={hydration.loading} onClick={() => void loadMore()}>
                  {hydration.loading ? (
                    <>
                      <IconLoading size={12} style={{ animation: 'spin-slow 1s linear infinite' }} />
                      加载中
                    </>
                  ) : (
                    '加载更多'
                  )}
                </button>
              ) : (
                <span className="font-mono text-[10.5px] text-[var(--fc-muted)]">
                  已载入 {detailTracks.length} / {total} 首
                </span>
              )}
              <button
                className="ctrl-btn h-8 w-8"
                title="回到顶部"
                onClick={() => rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                <IconChevron dir="up" size={14} />
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
