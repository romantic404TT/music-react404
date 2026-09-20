import { useEffect, type ReactNode } from 'react';
import { formatDuration } from '@/lib/format';
import { useUiStore } from '@/store/uiStore';
import { qualityLabel } from '@/types/track';
import type { Track } from '@/types/track';
import { IconClose } from './Icons';

export function Slider({
  value, min = 0, max = 1, step = 0.01, onChange, className = '', label, format,
}: {
  value: number; min?: number; max?: number; step?: number;
  onChange: (v: number) => void; className?: string; label?: string; format?: (v: number) => string;
}) {
  return (
    <div className={className}>
      {label && (
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] text-[var(--fc-muted)]">{label}</span>
          <span className="font-mono text-[10.5px] text-[var(--fc-ink-2)]">
            {format ? format(value) : value.toFixed(2)}
          </span>
        </div>
      )}
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Segmented<T extends string>({
  value, options, onChange, className = '',
}: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div className={`seg ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className="seg-item"
          data-active={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  title, onClose, children, width, footer,
}: {
  title: string; onClose: () => void; children: ReactNode; width?: 'wide' | 'fx'; footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-mask" onClick={onClose}>
      <div
        className={`modal ${width === 'wide' ? 'modal--wide' : width === 'fx' ? 'modal--fx' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-[15px] font-semibold tracking-wide text-[var(--fc-ink)]">{title}</h2>
          <button className="ctrl-btn -mr-2 -mt-1 h-8 w-8" onClick={onClose} aria-label="关闭">
            <IconClose size={15} />
          </button>
        </div>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

const TONE_COLOR: Record<string, string> = {
  info: 'var(--fc-ink)',
  ok: 'var(--home-accent)',
  warn: 'var(--champagne)',
  error: 'var(--source-netease)',
};

export function ToastLayer() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-[74px] z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className="glass-panel pointer-events-auto max-w-[70vw] rounded-full px-4 py-2 text-[12px] animate-fade-rise"
          style={{ color: TONE_COLOR[t.tone], borderRadius: 999 }}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}

export function SourceBadge({ provider }: { provider: string }) {
  const label = provider === 'netease' ? 'NE' : provider === 'qishui' ? 'QS' : provider.slice(0, 2).toUpperCase();
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className="source-dot" data-provider={provider} />
      <span className="font-mono text-[9.5px] tracking-widest text-[var(--fc-muted)]">{label}</span>
    </span>
  );
}

export function TrackRow({
  track, index, current, onPlay, onCollect,
}: {
  track: Track; index: number; current: boolean; onPlay: () => void; onCollect?: () => void;
}) {
  return (
    <div className="track-row group" data-current={current} onClick={onPlay}>
      <span className="track-row__index">{current ? '▶' : String(index + 1).padStart(2, '0')}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] text-[var(--fc-ink)]">{track.name}</span>
          {track.fee ? <span className="chip !h-[16px] !px-1.5 !text-[9px] text-[var(--champagne)]">VIP</span> : null}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--fc-muted)]">
          <SourceBadge provider={track.provider} />
          <span className="truncate">{track.artist}</span>
          <span className="truncate opacity-60">· {track.album}</span>
        </span>
      </span>
      <span className="flex items-center gap-2">
        {onCollect && (
          <button
            className="ctrl-btn h-7 w-7 opacity-0 transition group-hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); onCollect(); }}
            aria-label="收藏到歌单"
            title="收藏到歌单"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
        <span className="font-mono text-[10.5px] text-[var(--fc-muted)]">{formatDuration(track.duration)}</span>
      </span>
    </div>
  );
}

export function QualityName({ track }: { track: Track }) {
  return <span className="font-mono text-[10px] text-[var(--fc-muted)]">{qualityLabel(track.provider, 'standard')}</span>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-[13px] text-[var(--fc-ink-2)]">{title}</p>
      {hint && <p className="max-w-[320px] text-[11.5px] leading-relaxed text-[var(--fc-muted)]">{hint}</p>}
      {action}
    </div>
  );
}
