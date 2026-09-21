import { useCallback, useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/primitives';
import { IconChevron } from '@/components/ui/Icons';
import { formatDateStamp, formatListenMs, relativeTime } from '@/lib/format';
import { useStatsStore } from '@/store/statsStore';
import { useUiStore } from '@/store/uiStore';
import type { Provider } from '@/types/track';

/**
 * 听歌画像。数据全部来自本地 localStorage（mineradio-listen-stats-v1 / rollup-v2），
 * 所以这一页不打任何接口：画像记的是「你在这台设备上听了多久」，与账号无关。
 *
 * 有效收听的口径沿用原版：完播、或听满 45 秒、或进度过半，由 statsStore.flush 判定。
 */

const SOURCE_COLOR: Record<Provider, string> = {
  netease: 'var(--source-netease)',
  qq: 'var(--source-qq)',
  kugou: 'var(--source-qq)',
  qishui: 'var(--source-qishui)',
  spotify: 'var(--source-spotify)',
  local: 'var(--source-local)',
};

export function StatsPage() {
  const stats = useStatsStore((s) => s.stats);
  const rollup = useStatsStore((s) => s.rollup);
  const pendingMs = useStatsStore((s) => s.pendingMs);
  const topSongs = useStatsStore((s) => s.topSongs);
  const topArtists = useStatsStore((s) => s.topArtists);
  const weekDaily = useStatsStore((s) => s.weekDaily);
  const reset = useStatsStore((s) => s.reset);
  const pushToast = useUiStore((s) => s.pushToast);

  const [tick, setTick] = useState(0);

  const week = useMemo(() => weekDaily(), [weekDaily, stats, rollup, pendingMs, tick]);
  const songs = useMemo(() => topSongs(10), [topSongs, stats, tick]);
  const artists = useMemo(() => topArtists(8), [topArtists, stats, tick]);

  const maxDay = Math.max(1, ...week.map((d) => d.listenMs));
  const maxArtist = Math.max(1, ...artists.map((a) => a.listenMs));
  const todayStamp = formatDateStamp();
  const activeDays = Object.values(rollup.daily).filter((d) => d.listenMs > 0).length;
  const hasData = rollup.totalListenMs > 0 || Object.keys(stats.songs).length > 0;

  const wipe = useCallback(() => {
    const ok = window.confirm('清空后本机画像不可恢复（不影响任何平台的账号数据）。确定要清空吗？');
    if (!ok) return;
    reset();
    setTick((t) => t + 1);
    pushToast('听歌画像已清空', 'info');
  }, [reset, pushToast]);

  return (
    <div className="mx-auto w-home max-w-full pb-[150px] pt-16">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-[20px] font-semibold tracking-wide text-[var(--fc-ink)]">听歌画像</h1>
            <span className="label-caps">listening profile</span>
          </div>
          <p className="mt-1 max-w-[640px] text-[11.5px] leading-relaxed text-[var(--fc-muted)]">
            只记在这台设备上：完播、听满 45 秒、或进度过半算一次有效收听。数据存在 localStorage，不上传，也不与账号同步。
          </p>
        </div>
        <button className="btn" onClick={wipe} disabled={!hasData}>
          清空画像
        </button>
      </header>

      {/* ---- 汇总三格 ---- */}
      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <SummaryCell label="总时长" value={formatListenMs(rollup.totalListenMs + pendingMs)} hint={`更新于 ${relativeTime(rollup.updatedAt) || '尚未开始'}`} />
        <SummaryCell label="有效收听" value={`${rollup.sessions} 次`} hint={`其中最近 7 天 ${week.reduce((a, b) => a + b.sessions, 0)} 次`} />
        <SummaryCell label="活跃天数" value={`${activeDays} 天`} hint={`记录到 ${Object.keys(stats.songs).length} 首歌 / ${Object.keys(stats.artists).length} 位艺人`} />
      </section>

      {/* ---- 7 天柱状 ---- */}
      <section className="glass-panel mt-4 rounded-tile p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="label-caps">WEEK · 最近七天</h2>
          <span className="font-mono text-[10px] text-[var(--fc-muted)]">峰值 {formatListenMs(maxDay)}</span>
        </div>

        <div className="mt-5 flex h-[148px] items-end gap-2">
          {week.map((d) => {
            const ratio = d.listenMs / maxDay;
            const isToday = d.date === todayStamp;
            return (
              <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <span className="font-mono text-[9.5px] text-[var(--fc-muted)]">
                  {d.listenMs > 0 ? formatListenMs(d.listenMs) : '—'}
                </span>
                <div className="progress-rail flex h-[96px] w-full items-end !rounded-[8px]" title={`${d.date} · ${d.sessions} 次有效收听`}>
                  <div
                    className="w-full transition-[height] duration-home ease-mr"
                    style={{
                      height: `${Math.max(ratio * 100, d.listenMs > 0 ? 4 : 1.5)}%`,
                      borderRadius: 8,
                      background: isToday
                        ? 'linear-gradient(180deg, rgba(255,255,255,.82), var(--home-accent))'
                        : 'linear-gradient(180deg, rgba(var(--home-accent-rgb), .48), rgba(var(--home-accent-rgb), .10))',
                      boxShadow: d.listenMs > 0 ? '0 0 18px rgba(var(--home-accent-rgb), .22)' : 'none',
                    }}
                  />
                </div>
                <span className={`truncate font-mono text-[10px] ${isToday ? 'text-[var(--home-accent)]' : 'text-[var(--fc-muted)]'}`}>
                  {d.date.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {!hasData ? (
        <div className="glass-panel mt-4 rounded-tile">
          <EmptyState
            title="画像还是空的"
            hint="放一首歌听超过 45 秒，这里就会出现第一条记录。清空后同样需要重新积累。"
            action={
              <button
                className="btn btn--primary"
                onClick={() => pushToast('去首页或搜索里点一首，回来这里就有数据了', 'info')}
              >
                知道了
              </button>
            }
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,1fr)]">
          {/* ---- 常听曲目 ---- */}
          <section className="glass-panel rounded-tile p-4">
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="label-caps">TOP SONGS · 常听的歌</h2>
              <span className="font-mono text-[10px] text-[var(--fc-muted)]">按时长排序</span>
            </div>
            {songs.length ? (
              songs.map((s, i) => (
                <div key={s.key} className="track-row !grid-cols-[26px_38px_1fr_auto]">
                  <span className="track-row__index">{String(i + 1).padStart(2, '0')}</span>
                  {s.cover ? (
                    <img src={s.cover} alt="" className="cover h-[38px] w-[38px]" />
                  ) : (
                    <span className="cover flex h-[38px] w-[38px] items-center justify-center">
                      <i className="source-dot" style={{ background: SOURCE_COLOR[s.source] }} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-[var(--fc-ink)]">{s.name}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--fc-muted)]">
                      <i className="source-dot" data-provider={s.source} />
                      <span className="truncate">{s.artist || '未知艺人'}</span>
                      <span className="opacity-70">· {relativeTime(s.lastPlayedAt)}</span>
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-[11.5px] text-[var(--fc-ink-2)]">{formatListenMs(s.listenMs)}</span>
                    <span className="block font-mono text-[10px] text-[var(--fc-muted)]">{s.plays} 次</span>
                  </span>
                </div>
              ))
            ) : (
              <p className="px-2 py-6 text-[11.5px] text-[var(--fc-muted)]">还没有记到任何一首歌。</p>
            )}
          </section>

          {/* ---- 常听艺人 ---- */}
          <section className="glass-panel rounded-tile p-4">
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 className="label-caps">TOP ARTISTS · 常听的艺人</h2>
              <span className="font-mono text-[10px] text-[var(--fc-muted)]">前 {artists.length}</span>
            </div>
            {artists.length ? (
              <div className="flex flex-col gap-2.5">
                {artists.map((a, i) => (
                  <div key={a.name}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12.5px] text-[var(--fc-ink)]">
                        <span className="mr-2 font-mono text-[10px] text-[var(--fc-muted)]">{String(i + 1).padStart(2, '0')}</span>
                        {a.name}
                      </span>
                      <span className="shrink-0 font-mono text-[10.5px] text-[var(--fc-muted)]">
                        {formatListenMs(a.listenMs)} · {a.plays} 次
                      </span>
                    </div>
                    <div className="progress-rail mt-1.5">
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.max(3, (a.listenMs / maxArtist) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-1 py-6 text-[11.5px] text-[var(--fc-muted)]">
                艺人名按「, 、 &」与空格拆分统计，和原版一致。
              </p>
            )}

            <p className="mt-4 flex items-center gap-1.5 border-t border-[var(--fc-hair)] pt-3 font-mono text-[10px] text-[var(--fc-muted)]">
              <IconChevron size={11} />
              最近一次写入 {relativeTime(stats.updatedAt) || '—'}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

function SummaryCell({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="glass-panel rounded-tile p-4">
      <p className="label-caps">{label}</p>
      <p className="mt-2 font-mono text-[22px] leading-none text-[var(--home-accent)]">{value}</p>
      <p className="mt-2 truncate text-[11px] text-[var(--fc-muted)]">{hint}</p>
    </div>
  );
}
