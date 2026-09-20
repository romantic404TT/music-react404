import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '@/lib/format';
import { useFxStore } from '@/store/fxStore';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { checkLiked, toggleLike } from '@/services/song';
import { PLAY_MODE_LABEL, QUALITY_OPTIONS, qualityLabel, queueItemKey } from '@/types/track';
import type { PlayMode, QualityLevel, Track } from '@/types/track';
import {
  IconCollect, IconHide, IconHeart, IconImmersive, IconLoading, IconLoop, IconNext,
  IconPause, IconPlay, IconPrev, IconQuality, IconQueue, IconShuffle, IconSingle, IconVolume,
} from '@/components/ui/Icons';

/**
 * 播放器控制条。按钮集合与原版 #bottom-bar 的三组 cluster 一一对应：
 *   .actions   封面 / 标题+角标 / 音质 / 艺人 / 红心 / 收藏
 *   .transport 播放模式 / AutoMix / 上一首 / 播放 / 下一首 / 迷你队列
 *   .modes     歌词(长按校准) / 音量+淡入淡出 / 自动隐藏 / 全沉浸式 / 全屏 / 时间
 * 进度条支持点击与拖拽 seek，和 #progress-bar 一致。
 */

function PlayModeIcon({ mode }: { mode: PlayMode }) {
  if (mode === 'shuffle') return <IconShuffle size={16} />;
  if (mode === 'single') return <IconSingle size={16} />;
  return <IconLoop size={16} />;
}

function ProgressBar() {
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const seek = usePlayerStore((s) => s.seek);
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const dur = duration || 1;
  const pct = Math.min(100, (Math.min(position, dur) / dur) * 100);

  const pick = (clientX: number) => {
    const el = track.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    seek(((clientX - rect.left) / rect.width) * dur);
  };

  return (
    <div className="px-5 pt-2">
      <div className="flex items-center gap-3">
        <span className="w-[42px] shrink-0 text-right font-mono text-[10.5px] text-[var(--fc-muted)]">
          {formatDuration(position)}
        </span>
        <div
          ref={track}
          className="progress-rail flex-1"
          data-dragging={dragging}
          role="slider"
          aria-label="播放进度"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(position)}
          tabIndex={0}
          onPointerDown={(e) => {
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
            pick(e.clientX);
          }}
          onPointerMove={(e) => dragging && pick(e.clientX)}
          onPointerUp={(e) => {
            setDragging(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') seek(Math.min(dur, position + 5));
            if (e.key === 'ArrowLeft') seek(Math.max(0, position - 5));
          }}
        >
          <div className="progress-fill" style={{ width: `${pct}%` }} />
          <div className="progress-thumb" style={{ left: `${pct}%` }} />
        </div>
        <span className="w-[42px] shrink-0 font-mono text-[10.5px] text-[var(--fc-muted)]">{formatDuration(duration)}</span>
      </div>
    </div>
  );
}

function QualityMenu({ song }: { song: Track | null }) {
  const [open, setOpen] = useState(false);
  const qualityOf = useSettingsStore((s) => s.qualityOf);
  const setQuality = useSettingsStore((s) => s.setQuality);
  const source = usePlayerStore((s) => s.source);
  const provider = song?.provider ?? 'netease';
  const active = qualityOf(provider);

  if (!song) return null;
  return (
    <div className="relative" id="quality-control">
      <button
        className="chip hover:bg-white/10"
        data-glass="pill"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="音质"
      >
        <IconQuality size={12} />
        {qualityLabel(provider, active)}
      </button>
      {open && (
        <div className="pop-list glass-panel" onMouseLeave={() => setOpen(false)}>
          {QUALITY_OPTIONS[provider].map((q: QualityLevel) => (
            <button
              key={q}
              className="pop-item"
              data-active={q === active}
              onClick={() => {
                setQuality(provider, q);
                setOpen(false);
                useUiStore.getState().pushToast(`音质已切到 ${qualityLabel(provider, q)}，下一首生效`, 'info');
              }}
            >
              <span>{qualityLabel(provider, q)}</span>
              {q === active && source?.level === q ? <span className="font-mono text-[9px] opacity-70">{source.br}k</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VolumeControl() {
  const volume = useSettingsStore((s) => s.volume);
  const setVolume = useSettingsStore((s) => s.setVolume);
  const toggleMute = useSettingsStore((s) => s.toggleMute);
  const fade = useSettingsStore((s) => s.fade);
  const setFade = useSettingsStore((s) => s.setFade);
  const [open, setOpen] = useState(false);

  return (
    <div className="volume-wrap relative" id="volume-control" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="ctrl-btn" onClick={toggleMute} aria-label="音量" data-active={volume === 0}>
        <IconVolume size={17} muted={volume === 0} />
      </button>
      <div className="volume-pop glass-panel" data-open={open}>
        <span className="font-mono text-[10px] text-[var(--fc-muted)]">{Math.round(volume * 100)}</span>
        <input
          type="range"
          className="range volume-track"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="音量"
        />
        <div className="w-[132px] px-3 pb-1">
          <label className="mb-1 block text-[10px] text-[var(--fc-muted)]">淡入 {fade.fadeInMs}ms</label>
          <input
            type="range" className="range" min={0} max={3000} step={20} value={fade.fadeInMs}
            onChange={(e) => setFade({ fadeInMs: Number(e.target.value) })} aria-label="淡入"
          />
          <label className="mb-1 mt-3 block text-[10px] text-[var(--fc-muted)]">淡出 {fade.fadeOutMs}ms</label>
          <input
            type="range" className="range" min={0} max={3000} step={20} value={fade.fadeOutMs}
            onChange={(e) => setFade({ fadeOutMs: Number(e.target.value) })} aria-label="淡出"
          />
        </div>
      </div>
    </div>
  );
}

function LyricsButton() {
  const [popover, setPopover] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const song = usePlayerStore((s) => s.current());
  const position = usePlayerStore((s) => s.position);
  const offset = useLyricsOffset(song, position);

  const press = () => {
    holdTimer.current = setTimeout(() => setPopover(true), 520);
  };
  const release = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  };

  return (
    <div className="relative">
      <button
        className="ctrl-btn font-mono text-[12px] font-bold"
        data-active={offset.enabled}
        onPointerDown={press}
        onPointerUp={release}
        onPointerLeave={release}
        onClick={() => offset.toggle()}
        onContextMenu={(e) => { e.preventDefault(); setPopover((v) => !v); }}
        title="歌词开关（长按或右键做时间校准）"
        aria-label="歌词"
      >
        词
      </button>
      {popover && (
        <div className="pop-list glass-panel left-auto right-0 w-[196px]" id="lyric-timing-popover">
          <div className="px-2 pb-1 pt-1 text-[10.5px] text-[var(--fc-muted)]">歌词时间校准</div>
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <span className="font-mono text-[12px]">{offset.value >= 0 ? '+' : ''}{offset.value.toFixed(1)}s</span>
            <div className="flex gap-1">
              <button className="ctrl-btn h-7 w-7" onClick={() => offset.step(-0.1)} aria-label="提前 0.1 秒">−</button>
              <button className="ctrl-btn h-7 w-7" onClick={() => offset.step(0.1)} aria-label="延后 0.1 秒">＋</button>
            </div>
          </div>
          <button className="pop-item" onClick={() => { offset.reset(); setPopover(false); }}>恢复 0.0s</button>
        </div>
      )}
    </div>
  );
}

/* 复用 useLyrics 的持久化，避免两处各写一套存储 */
function useLyricsOffset(song: Track | null, position: number) {
  const [store] = useState(() => ({ current: new Map<string, number>() }));
  const key = song ? queueItemKey(song) : '';
  const [value, setValue] = useState(0);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem('mineradio-lyric-timing-offsets-v1');
    let items: Record<string, number> = {};
    try {
      items = (raw ? JSON.parse(raw) : { items: {} }).items ?? {};
    } catch { items = {}; }
    store.current = new Map(Object.entries(items));
    setValue(items[key] ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const persist = (next: Record<string, number>) => {
    localStorage.setItem('mineradio-lyric-timing-offsets-v1', JSON.stringify({ version: 1, savedAt: Date.now(), items: next }));
  };

  return {
    value,
    enabled,
    position,
    toggle: () => setEnabled((v) => !v),
    step: (d: number) => {
      setValue((prev) => {
        const n = Math.max(-30, Math.min(30, Math.round((prev + d) * 10) / 10));
        const next = Object.fromEntries(store.current.set(key, n));
        persist(next);
        return n;
      });
    },
    reset: () => {
      store.current.delete(key);
      persist(Object.fromEntries(store.current));
      setValue(0);
    },
  };
}

function MiniQueue() {
  const queue = usePlayerStore((s) => s.queue);
  const currentIdx = usePlayerStore((s) => s.currentIdx);
  const playAt = usePlayerStore((s) => s.playAt);
  const open = useUiStore((s) => s.miniQueueOpen);
  const setOpen = useUiStore((s) => s.setMiniQueue);
  const slice = queue.slice(Math.max(0, currentIdx), Math.max(0, currentIdx) + 12);

  return (
    <div className="relative" id="mini-queue-popover-wrap">
      <button className="ctrl-btn" id="mini-queue-btn" data-active={open} onClick={() => setOpen(!open)} aria-label="迷你队列">
        <IconQueue size={17} />
      </button>
      {open && (
        <div className="pop-list glass-panel left-auto right-0 max-h-[340px] w-[280px] overflow-y-auto">
          <div className="px-2 pb-1.5 pt-1 label-caps">正在播放 · {queue.length} 首</div>
          {slice.map((t, i) => {
            const idx = Math.max(0, currentIdx) + i;
            return (
              <button key={`${t.id}-${idx}`} className="pop-item" data-active={idx === currentIdx} onClick={() => { void playAt(idx); setOpen(false); }}>
                <span className="truncate">{t.name}</span>
                <span className="font-mono text-[9.5px] opacity-60">{formatDuration(t.duration)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BottomBar() {
  const song = usePlayerStore((s) => s.current());
  const playing = usePlayerStore((s) => s.playing);
  const resolving = usePlayerStore((s) => s.resolving);
  const toggle = usePlayerStore((s) => s.toggle);
  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const playMode = usePlayerStore((s) => s.playMode);
  const cycle = usePlayerStore((s) => s.cyclePlayMode);
  const source = usePlayerStore((s) => s.source);
  const controlsVisible = useUiStore((s) => s.controlsVisible);
  const setControlsVisible = useUiStore((s) => s.setControlsVisible);
  const controlsAutoHide = useSettingsStore((s) => s.controlsAutoHide);
  const toggleFlag = useSettingsStore((s) => s.toggleFlag);
  const toggleImmersive = useUiStore((s) => s.toggleImmersive);
  const openModal = useUiStore((s) => s.openModal);
  const setPanel = useUiStore((s) => s.setPanel);
  const fx = useFxStore((s) => s.fx);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (!song) { setLiked(false); return; }
    let alive = true;
    void checkLiked(song).then((r) => alive && setLiked(r.isLike));
    return () => { alive = false; };
  }, [song]);

  /* 原版规则：播放/切歌不主动弹控制条，只有热区或手动唤出才显示 */
  useEffect(() => {
    if (!controlsAutoHide) setControlsVisible(true);
  }, [controlsAutoHide, setControlsVisible]);

  const visible = !controlsAutoHide || controlsVisible;

  return (
    <>
      {!visible && (
        <div
          className="absolute bottom-0 left-1/2 z-30 h-[46px] w-[420px] -translate-x-1/2"
          id="bottom-handle"
          onMouseEnter={() => setControlsVisible(true)}
          title="唤出播放器控制台"
        />
      )}

      <div
        data-ui-layer
        data-glass="bar"
        className={`glass-saved-panel absolute bottom-4 left-1/2 z-40 w-bottombar -translate-x-1/2 transition-all duration-bar ease-mr ${
          visible ? 'opacity-[0.94] translate-y-0' : 'pointer-events-none translate-y-6 opacity-0'
        }`}
        id="bottom-bar"
        onMouseEnter={() => useUiStore.getState().setControlsHovering(true)}
        onMouseLeave={() => useUiStore.getState().setControlsHovering(false)}
      >
        <ProgressBar />

        <div className="flex items-center justify-between gap-3 px-4 pb-2.5 pt-1">
          {/* ---- .actions ---- */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <img
              src={song?.cover}
              alt=""
              id="control-cover"
              className={`cover h-[38px] w-[38px] ${playing ? 'cover-spin' : ''}`}
              onClick={() => setPanel('open')}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5" id="control-title">
                <span className="truncate text-[13px] font-medium text-[var(--fc-ink)]" id="control-title-text">
                  {song?.name ?? '未在播放'}
                </span>
                <span id="control-title-badges" className="flex shrink-0 items-center gap-1">
                  {source?.trial ? <span className="chip !h-[16px] !px-1.5 !text-[9px]">试听</span> : null}
                  {source?.sourceMatch ? <span className="chip !h-[16px] !px-1.5 !text-[9px] text-[var(--champagne)]">换源</span> : null}
                </span>
              </div>
              <div className="truncate text-[11px] text-[var(--fc-muted)]" id="control-artist">
                {song ? `${song.artist} · ${song.album}` : '从首页或搜索里选一首'}
              </div>
            </div>
            <QualityMenu song={song} />
            <button
              className="ctrl-btn"
              id="heart-btn"
              data-active={liked}
              style={liked ? { color: 'var(--source-netease)' } : undefined}
              title="红心"
              onClick={async () => {
                if (!song) return;
                const r = await toggleLike(song, !liked).catch(() => null);
                setLiked(Boolean(r?.liked));
              }}
            >
              <IconHeart size={17} filled={liked} />
            </button>
            <button className="ctrl-btn" id="collect-btn" title="收藏到歌单" onClick={() => openModal('collect', song)}>
              <IconCollect size={17} />
            </button>
          </div>

          {/* ---- .transport ---- */}
          <div className="flex shrink-0 items-center gap-1" id="controls">
            <button className="ctrl-btn" id="play-mode-btn" title={PLAY_MODE_LABEL[playMode]} onClick={cycle}>
              <PlayModeIcon mode={playMode} />
            </button>
            <button
              className="ctrl-btn"
              id="cuefield-automix-btn"
              title="AutoMix 跨曲过渡（本复刻未实现 cuefield 调度器）"
              style={{ opacity: 0.4 }}
              onClick={() => useUiStore.getState().pushToast('AutoMix / cuefield 过渡规划不在本次复刻范围内', 'warn')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <path d="M3 16c3 0 3-8 6-8s3 8 6 8 3-8 6-8" />
              </svg>
            </button>
            <button className="ctrl-btn" id="prev-btn" onClick={() => void prev()} aria-label="上一首">
              <IconPrev size={17} />
            </button>
            <button className="ctrl-btn ctrl-btn--play" id="play-btn" onClick={() => void toggle()} aria-label={playing ? '暂停' : '播放'}>
              {resolving ? <IconLoading size={18} style={{ animation: 'spin-slow 1s linear infinite' }} /> : playing ? <IconPause size={18} /> : <IconPlay size={18} />}
            </button>
            <button className="ctrl-btn" id="next-btn" onClick={() => void next(true)} aria-label="下一首">
              <IconNext size={17} />
            </button>
            <MiniQueue />
          </div>

          {/* ---- .modes ---- */}
          <div className="flex shrink-0 items-center justify-end gap-1" style={{ minWidth: 210 }}>
            <LyricsButton />
            <VolumeControl />
            <button
              className="ctrl-btn"
              id="controls-hide-btn"
              data-active={controlsAutoHide}
              title="控制条自动隐藏"
              onClick={() => toggleFlag('controlsAutoHide')}
            >
              <IconHide size={17} />
            </button>
            <button
              className="ctrl-btn"
              id="immersive-btn"
              title="全沉浸式"
              onClick={() => toggleImmersive({ shelf: fx.shelf, shelfPinnedOpen: fx.shelfPinnedOpen, lyrics: fx.particleLyrics, controlsAutoHide })}
            >
              <IconImmersive size={17} />
            </button>
            <button
              className="ctrl-btn font-mono text-[11px] font-bold fullscreen-toggle-btn"
              title="全屏 (F)"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void document.documentElement.requestFullscreen().catch(() => undefined);
              }}
            >
              F
            </button>
            <span className="ml-1 font-mono text-[10.5px] text-[var(--fc-muted)]" id="time-display">
              {PLAY_MODE_LABEL[playMode].slice(0, 2)}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
