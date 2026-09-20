import { useEffect, useState } from 'react';
import { EmptyState, TrackRow } from '@/components/ui/primitives';
import { formatPlayCount } from '@/lib/format';
import { useAccountStore } from '@/store/accountStore';
import { useFxStore } from '@/store/fxStore';
import { useLibraryStore } from '@/store/libraryStore';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore, type PanelTab } from '@/store/uiStore';
import { fetchHotPodcasts } from '@/services/discover';
import { podcastTrackFrom } from '@/services/content';
import { PLAY_MODE_LABEL, queueItemKey } from '@/types/track';
import { IconChevron, IconClose } from '@/components/ui/Icons';

/**
 * 右侧歌单面板。三页签与原版一致：#tab-queue / #tab-pl / #tab-podcast。
 * 队列页支持"跳到这首"与移出；歌单页展示内置 + 账号歌单；播客页列频道。
 */

const TABS: { key: PanelTab; label: string }[] = [
  { key: 'queue', label: '队列' },
  { key: 'playlists', label: '歌单' },
  { key: 'podcasts', label: '播客' },
];

export function PlaylistPanel() {
  const state = useUiStore((s) => s.playlistPanel);
  const setPanel = useUiStore((s) => s.setPanel);
  const tab = useUiStore((s) => s.queueViewTab);
  const setTab = useUiStore((s) => s.setQueueTab);
  const pinned = useSettingsStore((s) => s.playlistPanelPinned);
  const togglePinned = useSettingsStore((s) => s.toggleFlag);
  const openMs = useFxStore((s) => s.fx.playlistPanelOpenDuration) * 1000;
  const closeMs = useFxStore((s) => s.fx.playlistPanelCloseDuration) * 1000;
  const open = state === 'open';

  return (
    <aside
      data-ui-layer
      id="playlist-panel"
      className={`glass-panel absolute right-4 top-[68px] bottom-[132px] z-30 flex w-playlist flex-col overflow-hidden transition-all ${
        open ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-[110%] opacity-0'
      }`}
      style={{
        transitionDuration: `${(open ? openMs : closeMs) / 1000}s`,
        transitionTimingFunction: 'var(--ease-mr)',
      }}
      aria-hidden={!open}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--glass-border-soft)] px-3 py-2.5">
        <div className="seg" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" className="seg-item" data-active={tab === t.key} onClick={() => setTab(t.key)} aria-selected={tab === t.key}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="ctrl-btn h-7 w-7"
            id="playlist-pin-btn"
            data-active={pinned}
            title="钉住面板"
            onClick={() => togglePinned('playlistPanelPinned')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M9 4h6l-1 6 4 3H6l4-3z" /><path d="M12 13v7" />
            </svg>
          </button>
          <button className="ctrl-btn h-7 w-7" onClick={() => setPanel('closed')} aria-label="关闭面板">
            <IconClose size={14} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {tab === 'queue' && <QueuePane />}
        {tab === 'playlists' && <PlaylistPane onPicked={() => setPanel('open')} />}
        {tab === 'podcasts' && <PodcastPane />}
      </div>
    </aside>
  );
}

function QueuePane() {
  const queue = usePlayerStore((s) => s.queue);
  const currentIdx = usePlayerStore((s) => s.currentIdx);
  const playAt = usePlayerStore((s) => s.playAt);
  const remove = usePlayerStore((s) => s.removeFromQueue);
  const playMode = usePlayerStore((s) => s.playMode);
  const label = usePlayerStore((s) => s.queueLabel);

  if (!queue.length) {
    return <EmptyState title="队列为空" hint="去首页或搜索里点一首歌，队列会在这里展开。" />;
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="truncate text-[11.5px] text-[var(--fc-muted)]">{label} · {queue.length} 首</span>
        <span className="chip" id="play-mode-chip">{PLAY_MODE_LABEL[playMode]}</span>
      </div>
      {queue.map((t, i) => (
        <div key={`${queueItemKey(t)}-${i}`} className="group flex items-center">
          <div className="min-w-0 flex-1">
            <TrackRow
              track={t}
              index={i}
              current={i === currentIdx}
              onPlay={() => void playAt(i)}
            />
          </div>
          <button
            className="ctrl-btn h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
            onClick={() => remove(i)}
            aria-label="从队列移除"
            title="移出队列"
          >
            <IconClose size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function PlaylistPane({ onPicked }: { onPicked: () => void }) {
  const provider = useAccountStore((s) => s.activeAccountProvider);
  const lists = useLibraryStore((s) => s.playlists[provider]);
  const builtIn = useLibraryStore((s) => s.builtIn);
  const load = useLibraryStore((s) => s.loadPlaylists);
  const openPlaylist = useLibraryStore((s) => s.openPlaylist);
  const loading = useLibraryStore((s) => s.loadingLists[provider]);
  const setTab = useUiStore((s) => s.setQueueTab);

  useEffect(() => {
    void load(provider);
  }, [provider, load]);

  const all = [...builtIn, ...lists];

  return (
    <div>
      <button className="pop-item mb-1 justify-start" onClick={() => { setTab('queue'); onPicked(); }}>
        <IconChevron dir="left" size={13} /> 回到队列
      </button>
      {loading && !all.length && <div className="skeleton m-1 h-[52px]" />}
      {!loading && !all.length && <EmptyState title="还没有歌单" hint="登录后会从对应平台拉取歌单；未登录时只有内置歌单。" />}
      {all.map((pl) => (
        <button
          key={pl.id}
          className="track-row !grid-cols-[42px_1fr] text-left"
          onClick={() => {
            void openPlaylist(pl.provider, pl.id, true);
            onPicked();
          }}
        >
          <img src={pl.cover} alt="" className="cover h-[42px] w-[42px]" />
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] text-[var(--fc-ink)]">{pl.name}</span>
            <span className="block truncate font-mono text-[10px] text-[var(--fc-muted)]">
              {pl.trackCount ?? 0} 首 · {formatPlayCount(pl.playCount)} 次播放
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function PodcastPane() {
  const [channels, setChannels] = useState<{ id: string; name: string; cover?: string; programCount?: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const setQueue = usePlayerStore((s) => s.setQueue);

  useEffect(() => {
    setLoading(true);
    void fetchHotPodcasts(12)
      .then((res) => setChannels(res.podcasts ?? res.categories ?? []))
      .finally(() => setLoading(false));
  }, []);

  const play = (ch: { id: string; name: string; cover?: string }) => {
    /* 取该频道 20 期，映射成播客曲目后进队列 */
    void import('@/services/content').then(({ fetchPodcastPrograms }) =>
      fetchPodcastPrograms(ch.id, 20, 0).then((res) => {
        const tracks = (res.programs ?? []).map((p) => podcastTrackFrom(p, { id: ch.id, name: ch.name, cover: ch.cover }));
        return setQueue(tracks, 0, ch.name);
      }),
    );
  };

  if (loading) return <div className="skeleton m-1 h-[52px]" />;
  if (!channels.length) return <EmptyState title="暂无播客" hint="来自 /api/podcast/hot。" />;

  return (
    <div>
      <p className="px-1 pb-2 text-[11px] leading-relaxed text-[var(--fc-muted)]">
        长音频会走同一套队列与视觉模式，对应原版的播客页签。
      </p>
      {channels.map((c) => (
        <div key={c.id} className="track-row group text-left" onClick={() => play(c)}>
          <img src={c.cover} alt="" className="cover h-[34px] w-[34px]" />
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] text-[var(--fc-ink)]">{c.name}</span>
            <span className="block truncate font-mono text-[10px] text-[var(--fc-muted)]">{c.programCount ?? 0} 期</span>
          </span>
          <span className="ctrl-btn h-6 w-6 opacity-0 group-hover:opacity-100">
            <IconChevron size={12} />
          </span>
        </div>
      ))}
    </div>
  );
}
