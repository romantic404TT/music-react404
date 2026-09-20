import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EmptyState, TrackRow } from '@/components/ui/primitives';
import { IconLoading, IconSearch } from '@/components/ui/Icons';
import { search, searchModeLabel } from '@/services/search';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { SEARCH_MODES } from '@/types/api';
import type { SearchMode } from '@/types/api';
import type { Track } from '@/types/track';
import { queueItemKey } from '@/types/track';

/**
 * 搜索页。对应原版 .search-stack：一个输入框 + 六个音源页签 + 一页结果。
 *
 * 三条从原版抄来的行为，不是随手加的：
 *   · 每次新输入都会 abort 上一个在途请求（原版 abortAll 同一语义），
 *     否则慢的旧请求会盖掉快的高频词结果；
 *   · 420ms 防抖，够让「全部」模式那 4 个并发请求不被逐字符触发；
 *   · 分页只认 nextOffset / hasMore，加载更多是追加而不是替换。
 */

const DEBOUNCE_MS = 420;
const PAGE_SIZE = 20;
const MODE_KEYS: string[] = SEARCH_MODES.map((m) => m.key);

/** 一次真正发出去的查询，音源与关键词绑定，避免只比关键词漏掉换源的情况 */
interface ActiveQuery {
  mode: SearchMode;
  keywords: string;
}

function reasonText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : '请求失败';
}

export function SearchPage() {
  const params = useParams();
  const navigate = useNavigate();

  const mode: SearchMode = useMemo(() => {
    const raw = params.mode;
    return raw && MODE_KEYS.includes(raw) ? (raw as SearchMode) : 'all';
  }, [params.mode]);

  const [input, setInput] = useState('');
  const [active, setActive] = useState<ActiveQuery | null>(null);
  const [songs, setSongs] = useState<Track[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const history = useSettingsStore((s) => s.searchHistory);
  const pushHistory = useSettingsStore((s) => s.pushSearchHistory);
  const clearHistory = useSettingsStore((s) => s.clearSearchHistory);
  const queue = usePlayerStore((s) => s.queue);
  const currentIdx = usePlayerStore((s) => s.currentIdx);
  const pushToast = useUiStore((s) => s.pushToast);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const currentKey = queueItemKey(queue[currentIdx] ?? null);

  const runSearch = useCallback(
    (nextMode: SearchMode, keywords: string, offset: number, append: boolean) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      if (append) setLoadingMore(true);
      else { setLoading(true); setError(null); }
      setActive({ mode: nextMode, keywords });

      void search(nextMode, keywords, PAGE_SIZE, offset, ac.signal)
        .then((res) => {
          if (!mountedRef.current || ac.signal.aborted) return;
          /* 播客结果只有频道字段，补齐 provider / type 才不会让行渲染读到 undefined */
          const mapped: Track[] = res.songs.map((t) => ({
            ...t,
            provider: t.provider ?? 'netease',
            type: t.type ?? (nextMode === 'podcast' ? 'podcast' : 'song'),
          }));
          setSongs((prev) => (append ? [...prev, ...mapped] : mapped));
          setHasMore(res.hasMore);
          setNextOffset(res.nextOffset);
        })
        .catch((e: unknown) => {
          if (!mountedRef.current || ac.signal.aborted) return;
          if (append) pushToast(reasonText(e), 'warn');
          else setError(reasonText(e));
        })
        .finally(() => {
          if (!mountedRef.current || ac.signal.aborted) return;
          setLoading(false);
          setLoadingMore(false);
        });
    },
    [pushToast],
  );

  /* 输入或音源变了 → 防抖后重查第一页；清空输入则连结果一起清掉 */
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const keywords = input.trim();

    if (!keywords) {
      abortRef.current?.abort();
      setActive(null);
      setSongs([]);
      setHasMore(false);
      setNextOffset(0);
      setError(null);
      setLoading(false);
      return;
    }

    if (active && active.mode === mode && active.keywords === keywords) return;

    timerRef.current = setTimeout(() => {
      runSearch(mode, keywords, 0, false);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [input, mode, active, runSearch]);

  const submit = () => {
    const keywords = input.trim();
    if (!keywords) {
      inputRef.current?.focus();
      return;
    }
    pushHistory(keywords);
    if (timerRef.current) clearTimeout(timerRef.current);
    runSearch(mode, keywords, 0, false);
  };

  const play = (song: Track) => {
    void usePlayerStore.getState().playSong(song, songs, '搜索 · ' + (active?.keywords ?? ''));
  };

  const showRecent = !input.trim();

  return (
    <div className="mx-auto flex w-home max-w-full flex-col gap-4 pb-[150px] pt-16">
      <header>
        <div className="flex items-baseline gap-3">
          <h1 className="text-[20px] font-semibold tracking-wide text-[var(--fc-ink)]">搜索</h1>
          <span className="label-caps">{searchModeLabel(mode)}</span>
        </div>
        <p className="mt-1 text-[11.5px] text-[var(--fc-muted)]">
          六个入口共用一份结果列表：「All」按平台交错取，「Podcast」走 /api/podcast/search。
        </p>
      </header>

      {/* ---- 输入 + 音源页签 ---- */}
      <div className="glass-panel rounded-tile p-4">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <span className="ctrl-btn pointer-events-none h-9 w-9 shrink-0">
            <IconSearch size={16} />
          </span>
          <input
            ref={inputRef}
            className="field !h-10 flex-1"
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="歌名、艺人名、专辑，或者随便几个字"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="搜索关键词"
          />
          {input ? (
            <button type="button" className="btn" onClick={() => { setInput(''); inputRef.current?.focus(); }}>
              清空
            </button>
          ) : null}
          <button type="submit" className="btn btn--primary !h-10">
            搜索
          </button>
        </form>

        <div className="seg mt-3 flex-wrap" role="tablist" aria-label="音源">
          {SEARCH_MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={mode === m.key}
              className="seg-item"
              data-active={mode === m.key}
              onClick={() => {
                navigate(`/search/${m.key}`);
                inputRef.current?.focus();
              }}
              title={m.label}
            >
              {m.short}
            </button>
          ))}
        </div>
      </div>

      {/* ---- 结果 ---- */}
      <section className="glass-panel min-h-[320px] rounded-tile p-3">
        {showRecent ? (
          <div className="px-1 py-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="label-caps">最近搜索</span>
              {history.length ? (
                <button className="ctrl-btn h-6 w-6" title="清空搜索历史" onClick={clearHistory}>
                  <span className="font-mono text-[11px]">×</span>
                </button>
              ) : null}
            </div>
            {history.length ? (
              <div className="flex flex-wrap gap-2">
                {history.map((kw) => (
                  <button key={kw} className="chip hover:bg-white/10" title={`搜「${kw}」`} onClick={() => setInput(kw)}>
                    {kw}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--fc-muted)]">
                还没搜过东西。输入框里每次新关键词都会取消上一个在途请求，所以连打也不会串结果。
              </p>
            )}
          </div>
        ) : null}

        {!showRecent && loading ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="skeleton h-[46px]" />
            ))}
          </div>
        ) : null}

        {!showRecent && !loading && error ? (
          <EmptyState
            title="搜索没成功"
            hint={`${error} · 换回「All」页签或稍后重试通常就能出结果。`}
            action={
              <button className="btn" onClick={() => runSearch(mode, input.trim(), 0, false)} disabled={!input.trim()}>
                重试
              </button>
            }
          />
        ) : null}

        {!showRecent && !loading && !error && active && !songs.length ? (
          <EmptyState
            title={`没有匹配「${active.keywords}」的结果`}
            hint="试试更短的关键词，或换个音源。播客页签返回的是频道，不含单曲。"
          />
        ) : null}

        {!showRecent && !loading && !error && songs.length ? (
          <>
            <div className="mb-1 flex items-center justify-between px-2">
              <span className="label-caps">
                {searchModeLabel(active?.mode ?? mode)} · {songs.length} 条
              </span>
              {loadingMore ? (
                <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-[var(--fc-muted)]">
                  <IconLoading size={12} style={{ animation: 'spin-slow 1s linear infinite' }} />
                  加载中
                </span>
              ) : null}
            </div>

            {songs.map((t, i) => (
              <TrackRow
                key={`${queueItemKey(t)}-${i}`}
                track={t}
                index={i}
                current={queueItemKey(t) === currentKey}
                onPlay={() => play(t)}
              />
            ))}

            <div className="mt-3 flex justify-center">
              {hasMore ? (
                <button className="btn" disabled={loadingMore} onClick={() => runSearch(mode, active?.keywords ?? input.trim(), nextOffset, true)}>
                  加载更多
                </button>
              ) : (
                <span className="font-mono text-[10.5px] text-[var(--fc-muted)]">到这里就是全部了</span>
              )}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
