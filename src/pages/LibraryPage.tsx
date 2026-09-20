import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/ui/primitives';
import { IconLoading, IconRefresh, IconUser } from '@/components/ui/Icons';
import { formatPlayCount } from '@/lib/format';
import { useAccountStore } from '@/store/accountStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useUiStore } from '@/store/uiStore';
import type { Playlist, Provider } from '@/types/track';

/**
 * 音乐库。原版 #pl-panel 的左列是「听哪个账号的源」，右列是那个账号的歌单 + 内置歌单。
 *
 * 选平台时同时写 accountStore.activeAccountProvider —— 原版就是这个值决定
 * 后续播放走谁的 cookie，不只是列表筛选。
 */

const PROVIDERS: { key: Provider; label: string }[] = [
  { key: 'netease', label: '网易云' },
  { key: 'qq', label: 'QQ 音乐' },
  { key: 'kugou', label: '酷狗' },
  { key: 'qishui', label: '汽水音乐' },
];

export function LibraryPage() {
  const navigate = useNavigate();

  const activeProvider = useAccountStore((s) => s.activeAccountProvider);
  const setActiveProvider = useAccountStore((s) => s.setActiveProvider);
  const setLoginProvider = useAccountStore((s) => s.setLoginProvider);
  const [provider, setProvider] = useState<Provider>(activeProvider);
  const statuses = useAccountStore((s) => s.statuses);
  const status = statuses[provider];
  const refresh = useAccountStore((s) => s.refresh);

  const builtIn = useLibraryStore((s) => s.builtIn);
  const lists = useLibraryStore((s) => s.playlists[provider]);
  const loading = useLibraryStore((s) => s.loadingLists[provider]);
  const loadPlaylists = useLibraryStore((s) => s.loadPlaylists);

  const openModal = useUiStore((s) => s.openModal);
  const pushToast = useUiStore((s) => s.pushToast);

  /* 本页选中的平台写回 activeAccountProvider；反向同步故意不做，
     否则在标题栏切账号会把这一页的筛选一起带走。 */
  useEffect(() => {
    if (provider !== activeProvider) setActiveProvider(provider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  useEffect(() => {
    void loadPlaylists(provider);
    void refresh(provider);
  }, [provider, loadPlaylists, refresh]);

  const merged = useMemo(() => {
    const seen = new Set<string>();
    const out: Playlist[] = [];
    for (const pl of [...builtIn, ...lists]) {
      const key = `${pl.provider}:${pl.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pl);
    }
    return out;
  }, [builtIn, lists]);

  const loggedIn = Boolean(status?.loggedIn);

  return (
    <div className="mx-auto w-home max-w-full pb-[150px] pt-16">
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* ===================== 左列 ===================== */}
        <aside className="glass-panel h-fit rounded-tile p-4">
          <h1 className="text-[18px] font-semibold tracking-wide text-[var(--fc-ink)]">音乐库</h1>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--fc-muted)]">
            切平台会同时改「听谁的源」，播放解析与红心收藏都按这个账号走。
          </p>

          <div className="mt-4 flex flex-col gap-1.5">
            {PROVIDERS.map((p) => {
              const st = statuses[p.key];
              const selected = provider === p.key;
              return (
                <button
                  key={p.key}
                  className="track-row !grid-cols-[10px_1fr_auto] text-left"
                  data-current={selected}
                  onClick={() => setProvider(p.key)}
                >
                  <i className="source-dot" data-provider={p.key} />
                  <span className="min-w-0 truncate text-[12.5px] text-[var(--fc-ink)]">{p.label}</span>
                  <span className="font-mono text-[9.5px] text-[var(--fc-muted)]">
                    {st ? (st.loggedIn ? '已登录' : '未登录') : '未读取'}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="mt-4 rounded-xl border border-[var(--glass-border-soft)] bg-black/25 p-3"
            style={{ borderColor: loggedIn ? 'var(--glass-border)' : undefined }}
          >
            <div className="flex items-center gap-2">
              <span className="ctrl-btn pointer-events-none h-7 w-7">
                <IconUser size={14} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12px] text-[var(--fc-ink)]">
                  {loggedIn ? status?.nickname ?? '已登录' : '未登录'}
                </p>
                <p className="truncate font-mono text-[10px] text-[var(--fc-muted)]">
                  {loggedIn ? status?.vipLabel ?? '普通账号' : '未登录时只显示内置歌单'}
                </p>
              </div>
            </div>

            {!loggedIn ? (
              <button
                className="btn btn--primary mt-3 w-full"
                onClick={() => {
                  setLoginProvider(provider);
                  openModal('login');
                }}
              >
                登录这个平台
              </button>
            ) : (
              <button
                className="btn mt-3 w-full"
                onClick={() => {
                  void refresh(provider);
                  void loadPlaylists(provider, true);
                  pushToast('已重新拉取该平台的歌单与登录态', 'info');
                }}
              >
                刷新账号与歌单
              </button>
            )}
          </div>

          <p className="mt-3 flex items-center gap-2 font-mono text-[10px] text-[var(--fc-muted)]">
            {loading ? (
              <>
                <IconLoading size={11} style={{ animation: 'spin-slow 1s linear infinite' }} />
                读取歌单
              </>
            ) : (
              <>
                <IconRefresh size={11} />
                {merged.length} 个歌单
              </>
            )}
          </p>
        </aside>

        {/* ===================== 右列 ===================== */}
        <section className="min-w-0">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="label-caps">
                {PROVIDERS.find((p) => p.key === provider)?.label ?? provider}
              </p>
              <p className="mt-1 text-[11.5px] text-[var(--fc-muted)]">
                内置歌单 + 该账号自建与收藏的歌单，点开进详情页。
              </p>
            </div>
            <button className="btn" onClick={() => void loadPlaylists(provider, true)} disabled={loading}>
              {loading ? '加载中' : '重新加载'}
            </button>
          </div>

          {loading && !merged.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="skeleton aspect-square w-full !rounded-[16px]" />
              ))}
            </div>
          ) : null}

          {!loading && !merged.length ? (
            <div className="glass-panel rounded-tile">
              <EmptyState
                title="这个平台还没有可读的歌单"
                hint={
                  loggedIn
                    ? '接口返回了空列表。可能账号确实没建过歌单，或者该平台的 user/playlists 能力未开放。'
                    : '登录该账号后会拉取它的自建与收藏歌单；未登录时这里通常为空。'
                }
                action={
                  <button
                    className="btn btn--primary"
                    onClick={() => {
                      setLoginProvider(provider);
                      openModal('login');
                    }}
                  >
                    去登录
                  </button>
                }
              />
            </div>
          ) : null}

          {merged.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
              {merged.map((pl) => (
                <button
                  key={`${pl.provider}:${pl.id}`}
                  className="glass-card group overflow-hidden rounded-[16px] p-3 text-left transition-transform duration-bar ease-mr hover:-translate-y-[3px]"
                  onClick={() => navigate(`/playlist/${pl.provider}/${pl.id}`)}
                  title={pl.description ?? pl.name}
                >
                  <img src={pl.cover} alt="" className="cover aspect-square w-full !rounded-[12px]" />
                  <p className="mt-2.5 truncate text-[13px] font-medium text-[var(--fc-ink)]">{pl.name}</p>
                  <p className="mt-1 truncate font-mono text-[10px] text-[var(--fc-muted)]">
                    {pl.trackCount ?? 0} 首 · {formatPlayCount(pl.playCount)} 次
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 truncate font-mono text-[9.5px] text-[var(--fc-muted)] opacity-70">
                    <i className="source-dot" data-provider={pl.provider} />
                    {pl.creator?.nickname ?? pl.provider}
                  </p>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
