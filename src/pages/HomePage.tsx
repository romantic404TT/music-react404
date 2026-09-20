import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, Modal, TrackRow } from '@/components/ui/primitives';
import { IconChevron, IconLoading, IconPlay, IconRefresh, IconSearch } from '@/components/ui/Icons';
import { fetchListenTotal, type ListenTotal } from '@/services/content';
import {
  fetchDiscoverHome,
  fetchIpLocation,
  fetchPlatformRecommendations,
  fetchWeatherRadio,
  type WeatherRadio,
} from '@/services/discover';
import { formatChineseDate, formatClock, formatDateStamp, formatListenMs } from '@/lib/format';
import { useLibraryStore } from '@/store/libraryStore';
import { usePlayerStore } from '@/store/playerStore';
import { useStatsStore } from '@/store/statsStore';
import { useUiStore } from '@/store/uiStore';
import type { DiscoverHomeResponse } from '@/types/api';
import type { Track } from '@/types/track';
import { queueItemKey } from '@/types/track';

/**
 * 首页。对应原版 #home-overlay 的三段结构：
 *   左列 = 主卡片（每日心情 + 天气电台入口）+ 四张快捷卡
 *   右列 = 洞察栏（今日聆听 / 接下来播放 / 为你挑选 / 平台推荐）
 *
 * 数据只在挂载时打一次 /api/discover/home 与 /api/weather/radio；
 * 天气电台失败不算错误（原版也会静默退到临时电台），所以只降级不弹错。
 */

const MOOD_LINES = [
  '今天适合把音量拧到刚好盖过说话声。',
  '先听三首再说，判断交给耳朵。',
  '留一点空白给长前奏，反正没人催你。',
  '同一首歌循环两次以上，就不算浪费了。',
  '阴天的时候，低频会显得更诚实。',
  '把灯调暗，粒子舞台会自己找到节奏。',
];

const TONE_COLOR = {
  search: 'var(--home-accent)',
  library: 'var(--champagne)',
  mix: 'var(--chill-cyan)',
  playlist: 'var(--visual-tint)',
} as const;

type Tone = keyof typeof TONE_COLOR;

function reasonText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : '加载失败';
}

export function HomePage() {
  const navigate = useNavigate();

  const [home, setHome] = useState<DiscoverHomeResponse | null>(null);
  const [weather, setWeather] = useState<WeatherRadio | null>(null);
  const [listen, setListen] = useState<ListenTotal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [moodIdx, setMoodIdx] = useState(() => Math.floor(Math.random() * MOOD_LINES.length));
  const [now, setNow] = useState(() => new Date());
  const [picksOpen, setPicksOpen] = useState(false);
  const [picks, setPicks] = useState<{ kugou: Track[]; qishui: Track[] } | null>(null);
  const [picksLoading, setPicksLoading] = useState(false);
  const [picksError, setPicksError] = useState<string | null>(null);

  const queue = usePlayerStore((s) => s.queue);
  const currentIdx = usePlayerStore((s) => s.currentIdx);
  const rollup = useStatsStore((s) => s.rollup);
  const pendingMs = useStatsStore((s) => s.pendingMs);
  const pushToast = useUiStore((s) => s.pushToast);
  const setPanel = useUiStore((s) => s.setPanel);
  const setQueueTab = useUiStore((s) => s.setQueueTab);

  const currentKey = queueItemKey(queue[currentIdx] ?? null);

  /* ---------- 数据加载 ---------- */

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;
    setLoading(true);
    setError(null);

    void fetchDiscoverHome(ac.signal)
      .then((res) => {
        if (!alive) return;
        setHome(res);
        /* 推荐歌单同时喂给音乐库的内置列表，两个页面共用一份缓存 */
        useLibraryStore.getState().loadBuiltIn(res.playlists ?? []);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setHome(null);
        setError(reasonText(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    void fetchListenTotal(undefined, ac.signal)
      .then((res) => alive && setListen(res))
      .catch(() => undefined);

    return () => {
      alive = false;
      ac.abort();
    };
  }, [reloadKey]);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;
    void fetchIpLocation(ac.signal)
      .then((loc) => fetchWeatherRadio(loc.lat, loc.lon, loc.city, ac.signal))
      .then((res) => {
        if (alive) setWeather(res);
      })
      .catch(() => {
        if (alive) setWeather(null);
      });
    return () => {
      alive = false;
      ac.abort();
    };
  }, [reloadKey]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(timer);
  }, []);

  /* ---------- 派生数据 ---------- */

  const daily = home?.dailySongs ?? [];
  const recommendedLists = useMemo(() => (home?.playlists ?? []).slice(0, 5), [home]);
  const podcasts = useMemo(() => (home?.podcasts ?? []).slice(0, 4), [home]);

  const todayStamp = formatDateStamp(now);
  const todayLocal = rollup.daily[todayStamp];
  const todayRemote = listen?.daily?.[todayStamp];
  const todayMs = (todayLocal?.listenMs ?? 0) + pendingMs;
  const todayCount = todayRemote?.sessions ?? todayLocal?.sessions ?? 0;

  const streak = useMemo(() => {
    let n = 0;
    for (let i = 0; i < 30; i++) {
      const key = formatDateStamp(new Date(now.getTime() - i * 86_400_000));
      const ms = rollup.daily[key]?.listenMs ?? listen?.daily?.[key]?.listenMs ?? 0;
      if (ms > 0) n += 1;
      /* 今天还没听不算断签，从昨天往前数 */
      else if (i > 0) break;
    }
    return n;
  }, [rollup, listen, now]);

  const upcoming = useMemo(() => {
    const from = currentIdx >= 0 ? currentIdx : 0;
    return queue.slice(from, from + 5).map((track, i) => ({ track, index: from + i }));
  }, [queue, currentIdx]);

  const weatherText = typeof weather?.weather?.text === 'string' ? weather.weather.text : '';
  const weatherTemp = typeof weather?.weather?.temperature === 'number' ? weather.weather.temperature : null;
  const weatherCity = weather?.location?.city ?? '';

  /* ---------- 动作 ---------- */

  const playDaily = useCallback(() => {
    if (!daily.length) {
      pushToast(loading ? '每日推荐还在加载' : '今天的每日推荐取不到，稍后再试', 'warn');
      return;
    }
    void usePlayerStore.getState().setQueue(daily, 0, '每日推荐');
  }, [daily, loading, pushToast]);

  const continueLast = useCallback(() => {
    const restored = usePlayerStore.getState().restoreLast();
    if (!restored) {
      pushToast('还没有可恢复的播放记录', 'info');
      return;
    }
    void usePlayerStore.getState().playAt(restored.currentIdx);
    pushToast(`已恢复上次播放 · ${restored.queue.length} 首`, 'ok');
  }, [pushToast]);

  const playWeatherRadio = useCallback(() => {
    const list = weather?.queue ?? [];
    if (!list.length) {
      pushToast('天气电台队列取不到，先去搜索里点一首', 'warn');
      return;
    }
    void usePlayerStore.getState().setQueue(list, 0, weather?.location?.city ? `天气电台 · ${weather.location.city}` : '天气电台');
  }, [weather, pushToast]);

  const openPicks = useCallback(() => {
    setPicksOpen(true);
    if (picks || picksLoading) return;
    const ac = new AbortController();
    setPicksLoading(true);
    setPicksError(null);
    void Promise.all([
      fetchPlatformRecommendations('kugou', ac.signal).catch(() => null),
      fetchPlatformRecommendations('qishui', ac.signal).catch(() => null),
    ])
      .then(([kg, qs]) => {
        if (ac.signal.aborted) return;
        if (!kg && !qs) {
          setPicksError('平台推荐加载失败，稍后再试');
          return;
        }
        setPicks({ kugou: kg?.songs ?? [], qishui: qs?.songs ?? [] });
      })
      .finally(() => setPicksLoading(false));
  }, [picks, picksLoading]);

  const pickTrack = useCallback(
    (song: Track, list: Track[]) => {
      void usePlayerStore.getState().setQueue(list, list.indexOf(song), '平台推荐');
      setPicksOpen(false);
    },
    [],
  );

  const mood = MOOD_LINES[moodIdx] ?? MOOD_LINES[0];

  return (
    <div className="mx-auto w-home max-w-full pb-[150px] pt-16">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        {/* ===================== 左列 ===================== */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* ---- 主卡片 ---- */}
          <section className="glass-panel relative overflow-hidden rounded-tile p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="label-caps">每日心情 · 今日推荐</span>
                  <span className="chip !h-[18px] !px-2 !text-[9.5px]">{home?.mode === 'personalized' ? '已按账号推荐' : '游客推荐'}</span>
                  {weather?.fallback ? <span className="chip !h-[18px] !px-2 !text-[9.5px] text-[var(--champagne)]">临时电台</span> : null}
                </div>
                <p className="mt-2 font-mono text-[11.5px] text-[var(--fc-muted)]">
                  {formatChineseDate(now)} · {formatClock(now)}
                  {weatherText ? ` · ${weatherCity} ${weatherText}${weatherTemp !== null ? ` ${weatherTemp}°C` : ''}` : ''}
                </p>
                <h2 className="mt-3 text-[22px] font-semibold leading-snug text-[var(--fc-ink)]">{mood}</h2>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button className="btn btn--primary" onClick={playDaily}>
                    <IconPlay size={14} />
                    播放今日推荐
                  </button>
                  <button
                    className="btn"
                    onClick={() => setMoodIdx((i) => (MOOD_LINES.length > 1 ? (i + 1 + Math.floor(Math.random() * (MOOD_LINES.length - 1))) % MOOD_LINES.length : i))}
                    title="换一条"
                  >
                    换一条
                  </button>
                  <button className="btn" onClick={playWeatherRadio} disabled={!weather?.queue.length}>
                    <IconChevron dir="down" size={13} />
                    天气电台
                  </button>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button className="ctrl-btn" title="重新拉取首页数据" onClick={() => setReloadKey((k) => k + 1)}>
                  {loading ? <IconLoading size={16} style={{ animation: 'spin-slow 1s linear infinite' }} /> : <IconRefresh size={16} />}
                </button>
              </div>
            </div>

            {error ? (
              <p className="mt-4 rounded-xl border border-[var(--glass-border-soft)] bg-black/25 px-3 py-2 text-[11.5px] text-[var(--champagne)]">
                首页数据没取到（{error}）。下面的快捷入口仍然可用，搜索与音乐库不依赖这份数据。
              </p>
            ) : null}

            {podcasts.length ? (
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--fc-hair)] pt-4">
                <span className="label-caps mr-1">今日电台</span>
                {podcasts.map((p) => (
                  <button key={p.id} className="chip" onClick={() => navigate('/podcast')} title={`${p.name} · 去播客页`}>
                    {p.name}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          {/* ---- 四张快捷卡 ---- */}
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <QuickCard
              tone="search"
              label="CONTINUE"
              title="继续播放"
              hint={queue.length ? `${queue.length} 首待恢复` : '从上次断掉的地方接上'}
              onClick={continueLast}
            />
            <QuickCard
              tone="library"
              label="LIBRARY"
              title="音乐库"
              hint="账号歌单与内置歌单"
              onClick={() => navigate('/library')}
            />
            <QuickCard
              tone="mix"
              label="DAILY MIX"
              title="每日推荐"
              hint={home ? `${daily.length} 首 / 共 ${home.dailySongTotal} 首` : '正在准备'}
              onClick={playDaily}
            />
            <QuickCard
              tone="playlist"
              label="RECENT"
              title="最近播放"
              hint="在右侧面板里看队列"
              onClick={() => {
                setQueueTab('queue');
                setPanel('open');
              }}
            />
          </section>

          {/* ---- 搜索引导条 ---- */}
          <button
            className="glass-card flex items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-transform duration-bar ease-mr hover:-translate-y-[2px]"
            onClick={() => navigate('/search/all')}
          >
            <span className="ctrl-btn pointer-events-none h-8 w-8">
              <IconSearch size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] text-[var(--fc-ink)]">搜一首歌</span>
              <span className="block truncate text-[11px] text-[var(--fc-muted)]">全部 / 网易云 / QQ / 酷狗 / 汽水 / 播客，六个音源同一套结果列表</span>
            </span>
            <IconChevron size={14} />
          </button>
        </div>

        {/* ===================== 右列洞察栏 ===================== */}
        <div className="flex min-w-0 flex-col gap-4">
          <RailCard title="LISTENING TODAY · 今日聆听">
            <div className="flex items-end gap-4">
              <div>
                <p className="font-mono text-[26px] leading-none text-[var(--home-accent)]">{formatListenMs(todayMs)}</p>
                <p className="mt-1.5 text-[11px] text-[var(--fc-muted)]">今天已经听掉的时长</p>
              </div>
              <div className="ml-auto text-right">
                <p className="font-mono text-[15px] text-[var(--fc-ink)]">{todayCount} 次</p>
                <p className="mt-1 font-mono text-[11px] text-[var(--champagne)]">连续 {streak} 天</p>
              </div>
            </div>
            <p className="mt-3 text-[10.5px] leading-relaxed text-[var(--fc-muted)]">
              本地画像记的是这台设备上的收听，右侧次数取自 /api/listen/total。
            </p>
          </RailCard>

          <RailCard
            title="NEXT UP · 接下来播放"
            action={
              <button className="ctrl-btn h-7 w-7" title="打开队列面板" onClick={() => { setQueueTab('queue'); setPanel('open'); }}>
                <IconChevron size={13} />
              </button>
            }
          >
            {upcoming.length ? (
              <div className="-mx-1">
                {upcoming.map(({ track, index }) => (
                  <TrackRow
                    key={`${queueItemKey(track)}-${index}`}
                    track={track}
                    index={index}
                    current={queueItemKey(track) === currentKey}
                    onPlay={() => void usePlayerStore.getState().playAt(index)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="队列还是空的" hint="从每日推荐或搜索里点一首，这里就会跟上。" />
            )}
          </RailCard>

          <RailCard title="FOR YOU · 为你挑选">
            {loading && !recommendedLists.length ? (
              <div className="space-y-2">
                <div className="skeleton h-[46px]" />
                <div className="skeleton h-[46px]" />
                <div className="skeleton h-[46px]" />
              </div>
            ) : recommendedLists.length ? (
              <div className="flex flex-col gap-1">
                {recommendedLists.map((pl) => (
                  <button
                    key={pl.id}
                    className="track-row text-left"
                    onClick={() => navigate(`/playlist/${pl.provider}/${pl.id}`)}
                  >
                    <img src={pl.cover} alt="" className="cover h-[38px] w-[38px]" />
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] text-[var(--fc-ink)]">{pl.name}</span>
                      <span className="block truncate font-mono text-[10px] text-[var(--fc-muted)]">
                        {pl.trackCount ?? 0} 首 · {pl.creator?.nickname ?? pl.provider}
                      </span>
                    </span>
                    <IconChevron size={13} />
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState title="暂时没有推荐歌单" hint={error ? `接口返回：${error}` : '未登录时平台只会给游客推荐。'} />
            )}
          </RailCard>

          <RailCard title="PLATFORM PICKS · 平台推荐">
            <p className="text-[11.5px] leading-relaxed text-[var(--fc-muted)]">
              酷狗推荐位与汽水 feed 各 12 首，原版就是这个弹窗的两栏结构。
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button className="btn btn--primary" onClick={openPicks}>
                打开推荐
              </button>
              <button className="btn" onClick={() => navigate('/search/kugou')}>
                去酷狗搜
              </button>
            </div>
          </RailCard>
        </div>
      </div>

      {picksOpen ? (
        <Modal title="PLATFORM PICKS · 平台推荐" width="wide" onClose={() => setPicksOpen(false)}>
          {picksLoading ? <div className="skeleton h-[220px]" /> : null}
          {!picksLoading && picksError ? <EmptyState title="平台推荐加载失败" hint={picksError} action={<button className="btn" onClick={() => { setPicks(null); setPicksError(null); openPicks(); }}>重试</button>} /> : null}
          {!picksLoading && picks ? (
            <div className="grid max-h-[58vh] gap-6 overflow-y-auto md:grid-cols-2">
              {([['酷狗推荐', picks.kugou], ['汽水 feed', picks.qishui]] as [string, Track[]][]).map(([label, list]) => (
                <div key={label} className="min-w-0">
                  <p className="label-caps mb-2">{label}</p>
                  {list.length ? (
                    list.map((t, i) => (
                      <TrackRow key={`${t.provider}-${t.id}-${i}`} track={t} index={i} current={queueItemKey(t) === currentKey} onPlay={() => pickTrack(t, list)} />
                    ))
                  ) : (
                    <p className="px-1 py-3 text-[11.5px] text-[var(--fc-muted)]">这个平台没有返回推荐。</p>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}

function QuickCard({
  tone, label, title, hint, onClick,
}: {
  tone: Tone;
  label: string;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      data-home-tone={tone}
      onClick={onClick}
      className="glass-card group relative overflow-hidden rounded-[18px] p-4 text-left transition-transform duration-bar ease-mr hover:-translate-y-[3px]"
    >
      <span
        className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-25 blur-2xl transition-opacity duration-bar group-hover:opacity-45"
        style={{ background: TONE_COLOR[tone] }}
      />
      <span className="label-caps relative block" style={{ color: TONE_COLOR[tone] }}>
        {label}
      </span>
      <span className="relative mt-2 block text-[15px] font-semibold text-[var(--fc-ink)]">{title}</span>
      <span className="relative mt-1 block truncate text-[11px] text-[var(--fc-muted)]">{hint}</span>
    </button>
  );
}

function RailCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="glass-panel rounded-tile p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="label-caps truncate">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
