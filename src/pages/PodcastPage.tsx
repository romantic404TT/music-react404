import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/primitives';
import { IconChevron, IconLoading, IconMic, IconPlay } from '@/components/ui/Icons';
import { fetchHotPodcasts } from '@/services/discover';
import { fetchMyPodcasts, fetchPodcastPrograms, podcastTrackFrom, type PodcastProgramDto } from '@/services/content';
import { formatDuration, formatPlayCount, relativeTime } from '@/lib/format';
import { usePlayerStore } from '@/store/playerStore';
import { useUiStore } from '@/store/uiStore';
import type { PodcastChannel, Track } from '@/types/track';
import { queueItemKey } from '@/types/track';

/**
 * 播客页。订阅走 /api/podcast/my（未登录时后端就返回空集合），热门走 /api/podcast/hot。
 *
 * 点频道后拉 30 期灌进右栏，映射出的 Track 仍然进同一套队列，
 * 所以 DJ 视觉模式、歌词层与控制条对长音频一视同仁 —— 和原版一致。
 */

const PROGRAM_PAGE = 30;

interface ChannelSelection {
  channel: PodcastChannel;
  programs: PodcastProgramDto[];
}

function reasonText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : '加载失败';
}

export function PodcastPage() {
  const [mine, setMine] = useState<PodcastChannel[]>([]);
  const [hot, setHot] = useState<PodcastChannel[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [selection, setSelection] = useState<ChannelSelection | null>(null);
  const [programLoading, setProgramLoading] = useState(false);
  const [programError, setProgramError] = useState<string | null>(null);

  const queue = usePlayerStore((s) => s.queue);
  const currentIdx = usePlayerStore((s) => s.currentIdx);
  const queueLabel = usePlayerStore((s) => s.queueLabel);
  const pushToast = useUiStore((s) => s.pushToast);

  const currentKey = queueItemKey(queue[currentIdx] ?? null);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;
    setListLoading(true);
    setListError(null);

    void Promise.all([
      fetchMyPodcasts(ac.signal).catch(() => null),
      fetchHotPodcasts(12, ac.signal).catch(() => null),
    ])
      .then(([my, popped]) => {
        if (!alive) return;
        if (!my && !popped) {
          setListError('播客列表接口没有响应');
          return;
        }
        setMine((my?.subscribe ?? []).map((c) => ({ id: c.id, name: c.name, cover: c.cover })));
        setHot(popped?.podcasts ?? popped?.categories ?? []);
      })
      .catch((e: unknown) => {
        if (alive) setListError(reasonText(e));
      })
      .finally(() => {
        if (alive) setListLoading(false);
      });

    return () => {
      alive = false;
      ac.abort();
    };
  }, [reloadKey]);

  const tracks = useMemo<Track[]>(() => {
    if (!selection) return [];
    const { channel, programs } = selection;
    return programs.map((p) => podcastTrackFrom(p, { id: channel.id, name: channel.name, cover: channel.cover }));
  }, [selection]);

  const openChannel = useCallback(
    (channel: PodcastChannel) => {
      setProgramLoading(true);
      setProgramError(null);
      void fetchPodcastPrograms(channel.id, PROGRAM_PAGE, 0)
        .then((res) => setSelection({ channel, programs: res.programs ?? [] }))
        .catch((e: unknown) => {
          setSelection(null);
          setProgramError(reasonText(e));
        })
        .finally(() => setProgramLoading(false));
    },
    [],
  );

  const playAt = useCallback(
    (index: number) => {
      if (!selection || !tracks.length) return;
      void usePlayerStore.getState().setQueue(tracks, index, selection.channel.name);
      pushToast(`队列换成「${selection.channel.name}」· 从第 ${index + 1} 期开始`, 'ok');
    },
    [selection, tracks, pushToast],
  );

  const playingHere = Boolean(selection) && queueLabel === selection?.channel.name;

  const mergedIds = new Set(mine.map((c) => c.id));
  const sections: { title: string; items: PodcastChannel[] }[] = [
    { title: '我的订阅', items: mine },
    { title: '热门频道', items: hot.filter((c) => !mergedIds.has(c.id)) },
  ];

  return (
    <div className="mx-auto w-home max-w-full pb-[150px] pt-16">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-[20px] font-semibold tracking-wide text-[var(--fc-ink)]">播客</h1>
            <span className="label-caps">podcast / dj</span>
          </div>
          <p className="mt-1 text-[11.5px] text-[var(--fc-muted)]">
            长音频与歌曲共用一套队列与视觉模式，每页 {PROGRAM_PAGE} 期。
          </p>
        </div>
        <span className="ctrl-btn pointer-events-none hidden h-9 w-9 md:inline-flex">
          <IconMic size={16} />
        </span>
      </header>

      {listError ? (
        <div className="glass-panel mt-4 rounded-tile">
          <EmptyState
            title="播客列表没取到"
            hint={listError}
            action={
              <button className="btn" onClick={() => setReloadKey((k) => k + 1)}>
                重新加载
              </button>
            }
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        {/* ---- 频道卡 ---- */}
        <div className="flex min-w-0 flex-col gap-5">
          {listLoading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="skeleton h-[120px]" />
              ))}
            </div>
          ) : null}

          {!listLoading
            ? sections.map((sec) =>
                sec.items.length ? (
                  <section key={sec.title}>
                    <div className="mb-2 flex items-center justify-between">
                      <h2 className="label-caps">{sec.title}</h2>
                      <span className="font-mono text-[10px] text-[var(--fc-muted)]">{sec.items.length}</span>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
                      {sec.items.map((ch) => {
                        const picked = selection?.channel.id === ch.id;
                        return (
                          <button
                            key={ch.id}
                            className="glass-card overflow-hidden rounded-[16px] p-3 text-left transition-transform duration-bar ease-mr hover:-translate-y-[3px]"
                            style={picked ? { borderColor: 'var(--glass-border)' } : undefined}
                            onClick={() => openChannel(ch)}
                          >
                            {ch.cover ? (
                              <img src={ch.cover} alt="" className="cover h-[92px] w-full !rounded-[11px]" />
                            ) : (
                              <div className="cover flex h-[92px] w-full items-end p-2 !rounded-[11px]">
                                <span className="label-caps">audio</span>
                              </div>
                            )}
                            <p className="mt-2.5 truncate text-[13px] font-medium text-[var(--fc-ink)]">{ch.name}</p>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--fc-muted)]">{ch.desc}</p>
                            <p className="mt-1.5 font-mono text-[10px] text-[var(--fc-muted)]">
                              {ch.programCount ?? 0} 期 · {formatPlayCount(ch.playCount)} 次
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : null,
              )
            : null}

          {!listLoading && !mine.length ? (
            <p className="text-[11.5px] leading-relaxed text-[var(--fc-muted)]">
              「我的订阅」为空：网易云登录后 /api/podcast/my 才会返回订阅的频道，这里只列了热门。
            </p>
          ) : null}
        </div>

        {/* ---- 节目单 ---- */}
        <aside className="glass-panel min-h-[320px] rounded-tile p-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <h2 className="label-caps truncate">{selection ? selection.channel.name : '节目单'}</h2>
            {tracks.length ? (
              <button className="btn !h-7 px-3 text-[11px]" onClick={() => playAt(0)}>
                <IconPlay size={12} />
                连续播放
              </button>
            ) : null}
          </div>

          {programLoading ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="skeleton h-[52px]" />
              ))}
            </div>
          ) : null}

          {!programLoading && programError ? (
            <EmptyState title="节目单没取到" hint={programError} />
          ) : null}

          {!programLoading && !programError && !tracks.length ? (
            <EmptyState title="先挑一个频道" hint="左侧点频道后，这里会列出最近 30 期，点一期就整列进队列。" />
          ) : null}

          {!programLoading && tracks.length ? (
            <div className="flex flex-col">
              {tracks.map((t, i) => {
                const program = selection?.programs[i];
                const current = queueItemKey(t) === currentKey;
                return (
                  <div key={`${t.id}-${i}`} className="track-row !grid-cols-[26px_1fr_auto] text-left" onClick={() => playAt(i)} data-current={current}>
                    <span className="track-row__index">{current ? '▶' : String(i + 1).padStart(2, '0')}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] text-[var(--fc-ink)]">{t.name}</span>
                      {program?.desc ? <span className="mt-0.5 block truncate text-[10.5px] text-[var(--fc-muted)]">{program.desc}</span> : null}
                      <span className="mt-1 flex items-center gap-2 font-mono text-[9.5px] text-[var(--fc-muted)]">
                        <i className="source-dot" data-provider="podcast" />
                        <span>{formatPlayCount(program?.listenerCount)} 次播放</span>
                        {program?.publishTime ? <span className="opacity-70">{relativeTime(program.publishTime)}</span> : null}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-[10.5px] text-[var(--fc-muted)]">{formatDuration(t.duration)}</span>
                      <IconChevron size={12} />
                    </span>
                  </div>
                );
              })}
              {playingHere ? (
                <p className="mt-3 flex items-center gap-2 px-2 font-mono text-[10px] text-[var(--home-accent)]">
                  <IconLoading size={11} style={{ animation: 'spin-slow 1.4s linear infinite' }} />
                  该频道正在队列里
                </p>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
