import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LyricsOverlay } from '@/components/stage/LyricsOverlay';
import { IconChevron, IconImmersive, IconNext, IconPause, IconPlay, IconVisual } from '@/components/ui/Icons';
import { formatDuration } from '@/lib/format';
import { useFxStore } from '@/store/fxStore';
import { usePlayerStore } from '@/store/playerStore';
import { useUiStore } from '@/store/uiStore';

/**
 * 纯舞台页：只有粒子与歌词，没有标题栏、控制条、列表和面板。
 * 外壳（ShellLayout）在路由为 /stage 时会让位，音频与 WebGL 上下文不重建，
 * 所以进/出这一页播放不会断。
 *
 * 控件在闲置 2.5 秒后淡出，动鼠标或按键重新出现。
 */

const IDLE_MS = 2500;

export function StagePage() {
  const navigate = useNavigate();
  const song = usePlayerStore((s) => s.current());
  const playing = usePlayerStore((s) => s.playing);
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const toggle = usePlayerStore((s) => s.toggle);
  const next = usePlayerStore((s) => s.next);
  const toggleFx = useUiStore((s) => s.toggleFxPanel);
  const ambient = useFxStore((s) => s.fx.ambientLayer);
  const setParam = useFxStore((s) => s.setParam);

  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wake = useCallback(() => {
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), IDLE_MS);
  }, []);

  useEffect(() => {
    wake();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('/home');
      wake();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [navigate, wake]);

  return (
    <section
      className="relative h-full w-full"
      onMouseMove={wake}
      onPointerDown={wake}
      aria-label="纯舞台模式"
    >
      <LyricsOverlay mode="stage" />

      {/* 无音频时的引导：这一页本身不产生播放 */}
      {!song && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
          <p className="label-caps">Stage</p>
          <p className="text-[15px] text-[var(--fc-ink-2)]">还没有播放中的曲目</p>
          <div className="flex gap-2">
            <button className="btn btn--primary" onClick={() => navigate('/search')}>
              去搜索
            </button>
            <button className="btn" onClick={() => navigate('/library')}>
              本地音乐
            </button>
          </div>
        </div>
      )}

      <div
        className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 pb-9 transition-opacity duration-bar ease-mr"
        style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none' }}
      >
        <div className="w-[min(560px,80vw)]">
          <div className="progress-rail" aria-hidden="true">
            <div
              className="progress-fill"
              style={{ width: `${duration ? Math.min(100, (position / duration) * 100) : 0}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-[var(--fc-muted)]">
            <span className="truncate pr-3">{song ? `${song.name} · ${song.artist}` : '未在播放'}</span>
            <span>{formatDuration(position)} / {formatDuration(duration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="icon-btn" onClick={() => navigate('/home')} title="返回首页 (Esc)" aria-label="返回首页">
            <IconChevron dir="left" size={17} />
          </button>
          <button
            className="icon-btn"
            data-active={ambient}
            onClick={() => setParam('ambientLayer', !ambient)}
            title="背景星尘层"
            aria-label="背景星尘层"
          >
            <IconVisual size={17} />
          </button>
          <button className="icon-btn !h-[54px] !w-[54px]" onClick={() => void toggle()} aria-label={playing ? '暂停' : '播放'}>
            {playing ? <IconPause size={22} /> : <IconPlay size={22} />}
          </button>
          <button className="icon-btn" onClick={() => void next(true)} title="下一首" aria-label="下一首">
            <IconNext size={17} />
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void document.documentElement.requestFullscreen().catch(() => undefined);
            }}
            title="全屏"
            aria-label="全屏"
          >
            <IconImmersive size={17} />
          </button>
          <button className="icon-btn" onClick={() => toggleFx(true)} title="视觉控制台" aria-label="视觉控制台">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
              <circle cx="16" cy="7" r="2.2" /><circle cx="8" cy="17" r="2.2" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
