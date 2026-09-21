import { useEffect, useState } from 'react';
import { EmptyState, Modal, Segmented, Slider, SourceBadge } from '@/components/ui/primitives';
import { IconCheck, IconLoading, IconRefresh, IconUpload, IconUser } from '@/components/ui/Icons';
import { formatDuration, relativeTime } from '@/lib/format';
import { parseLrc } from '@/lib/lrc';
import { STORAGE_KEYS, readJson, readString, writeJson, writeString } from '@/lib/storage';
import { fetchUpdateLatest } from '@/services/content';
import { addToPlaylist, createPlaylist, fetchComments } from '@/services/song';
import { startQrPolling, stopPolling, useAccountStore } from '@/store/accountStore';
import { useLibraryStore } from '@/store/libraryStore';
import { usePlayerStore } from '@/store/playerStore';
import { useUiStore } from '@/store/uiStore';
import { queueItemKey, qualityLabel } from '@/types/track';
import type { LyricLine, Playlist, Provider, Track } from '@/types/track';
import type { UpdateLatestResponse } from '@/types/api';

/**
 * 全部弹窗的唯一宿主。
 *
 * 原版这些弹窗常驻在 index.html 里（#login-modal / #user-modal / #collect-modal /
 * #custom-lyric-modal / #cover-crop-modal / #update-modal …），靠 .modal-mask.show 切换显隐，
 * 谁都能通过 addClass 打开，所以状态是散着的。这里改成 uiStore.modal 单值驱动：
 * 没有弹窗时整个组件返回 null，有弹窗时只挂载对应的那一个子组件——
 * mask 的显隐等价于「装/不装」，副作用（轮询、请求）也就自然跟着弹窗生命周期走。
 *
 * 每个子弹窗保留原版的 DOM id（挂在内容根节点上），便于和 public/index.html 对照。
 */

const LOGIN_PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'netease', label: '网易云' },
  { value: 'qq', label: 'QQ 音乐' },
  { value: 'kugou', label: '酷狗' },
  { value: 'qishui', label: '汽水' },
];

const PROVIDER_LABEL: Record<Provider, string> = {
  netease: '网易云音乐',
  qq: 'QQ 音乐',
  kugou: '酷狗音乐',
  qishui: '汽水音乐',
  spotify: 'Spotify',
  local: '本地音乐',
};

const LOGIN_METHODS: { value: LoginMethod; label: string }[] = [
  { value: 'qr', label: '扫码' },
  { value: 'cookie', label: 'Cookie' },
];

type LoginMethod = 'qr' | 'cookie';

/** 自定义封面的导出边长，与原版 cover-crop 的 300×300 输出一致 */
const COVER_OUTPUT = 300;
const COVER_JPEG_QUALITY = 0.86;

export function ModalHost() {
  const modal = useUiStore((s) => s.modal);
  const payload = useUiStore((s) => s.modalPayload);
  const closeModal = useUiStore((s) => s.closeModal);

  if (!modal) return null;

  /* closeModal 是 store 上的稳定引用，直接透传，子弹窗的 effect 依赖才不会反复重置 */
  switch (modal) {
    case 'login':
      return <LoginModal onClose={closeModal} />;
    case 'user':
      return <UserModal onClose={closeModal} />;
    case 'collect':
      return <CollectModal song={pickTrack(payload)} onClose={closeModal} />;
    case 'track-detail':
      return <TrackDetailModal song={pickTrack(payload)} onClose={closeModal} />;
    case 'custom-lyric':
      return <CustomLyricModal song={pickTrack(payload)} onClose={closeModal} />;
    case 'cover-crop':
      return <CoverCropModal song={pickTrack(payload)} onClose={closeModal} />;
    case 'update':
      return <UpdateModal onClose={closeModal} />;
    default:
      return null;
  }
}

/** 弹窗上下文：payload 里带歌就用它，否则退到当前播放曲 */
function pickTrack(payload: unknown): Track | null {
  if (looksLikeTrack(payload)) return payload;
  return usePlayerStore.getState().current();
}

function looksLikeTrack(v: unknown): v is Track {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as { id?: unknown; name?: unknown; provider?: unknown };
  return typeof t.id === 'string' && typeof t.name === 'string' && typeof t.provider === 'string';
}

/* ===================== 1. 登录 ===================== */

function LoginModal({ onClose }: { onClose: () => void }) {
  const loginProvider = useAccountStore((s) => s.loginProvider);
  const setLoginProvider = useAccountStore((s) => s.setLoginProvider);
  const qr = useAccountStore((s) => s.qr);
  const qrBusy = useAccountStore((s) => s.qrBusy);
  const cookieBusy = useAccountStore((s) => s.cookieBusy);
  const startQr = useAccountStore((s) => s.startQr);
  const submitCookie = useAccountStore((s) => s.submitCookie);
  const logout = useAccountStore((s) => s.logout);
  const refreshAll = useAccountStore((s) => s.refreshAll);
  const statuses = useAccountStore((s) => s.statuses);
  const spotifyRemoved = useAccountStore((s) => s.spotifyRemoved);
  const pushToast = useUiStore((s) => s.pushToast);

  const [method, setMethod] = useState<LoginMethod>('qr');
  const [cookie, setCookie] = useState('');

  /*
   * 出码 + 轮询跟着「弹窗挂载」这条生命周期走：
   * setLoginProvider 内部会 stopPolling() 并清空 qr，所以平台/方式变化都要重新起一轮。
   * confirmed / error 的票已经作废（803 已被消费），重开弹窗时必须重新出码，
   * 否则会立刻命中下面那个 confirmed 分支把自己关掉。
   */
  useEffect(() => {
    if (method === 'qr') {
      const st = useAccountStore.getState();
      const stale = st.qr === null || st.qr.phase === 'confirmed' || st.qr.phase === 'error';
      if (stale) void st.startQr();
      startQrPolling();
    }
    return () => stopPolling();
  }, [loginProvider, method]);

  /* 803 / qishui confirmed 由 store 写好登录态，这里只负责延迟关闭 + 全量刷新 */
  const phase = qr?.phase;
  useEffect(() => {
    if (phase !== 'confirmed') return;
    const timer = setTimeout(() => {
      onClose();
      void refreshAll().catch(() => undefined);
    }, 900);
    return () => clearTimeout(timer);
  }, [phase, onClose, refreshAll]);

  const onCookieSubmit = async () => {
    const value = cookie.trim();
    if (!value) {
      pushToast('先把 Cookie 粘进来', 'warn');
      return;
    }
    const ok = await submitCookie(value).catch(() => false);
    if (ok) {
      setCookie('');
      onClose();
    }
  };

  return (
    <Modal title="登录音乐平台" onClose={onClose} width="fx">
      <div id="login-modal" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={loginProvider} options={LOGIN_PROVIDERS} onChange={(p) => setLoginProvider(p)} />
          <Segmented value={method} options={LOGIN_METHODS} onChange={setMethod} />
        </div>

        {method === 'qr' ? (
          <QrPane
            provider={loginProvider}
            qr={qr}
            busy={qrBusy}
            onRefresh={() => void startQr()}
          />
        ) : (
          <CookiePane
            provider={loginProvider}
            value={cookie}
            busy={cookieBusy}
            onChange={setCookie}
            onSubmit={() => void onCookieSubmit()}
          />
        )}

        <div className="hairline-t pt-3">
          <p className="label-caps mb-2">当前登录</p>
          <div className="flex flex-col gap-1">
            {LOGIN_PROVIDERS.map(({ value, label }) => {
              const st = statuses[value];
              const online = st?.loggedIn === true;
              return (
                <div key={value} className="flex items-center gap-2 text-[12px]">
                  <i className="source-dot" data-provider={value} />
                  <span className="w-[68px] shrink-0 text-[var(--fc-ink-2)]">{label}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--fc-muted)]">
                    {online ? st?.nickname || '已登录' : '未登录'}
                  </span>
                  {online && (
                    <button
                      className="btn !h-7 !px-3 !text-[11px]"
                      onClick={() => void logout(value).catch(() => undefined)}
                    >
                      退出
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {spotifyRemoved && (
            <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--fc-muted)]">
              Spotify 已在后端下线（capabilities 返回 removed: true，请求一律 404 PROVIDER_REMOVED），
              所以这里不提供它的登录入口。
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function QrPane({
  provider, qr, busy, onRefresh,
}: {
  provider: Provider;
  qr: { key: string; img: string; url: string; phase: string; message: string } | null;
  busy: boolean;
  onRefresh: () => void;
}) {
  const creating = busy || !qr || qr.phase === 'creating';
  const done = qr?.phase === 'confirmed';

  return (
    <div className="flex flex-col items-center gap-3">
      {/* 二维码本体：原版同样是白底圆角框，扫码图是后端回的 data-uri */}
      <div className="relative grid h-[184px] w-[184px] place-items-center overflow-hidden rounded-2xl bg-white p-2.5 shadow-[0_14px_38px_rgba(0,0,0,.42)]">
        {creating ? (
          <div className="skeleton h-full w-full" />
        ) : (
          <img src={qr?.img} alt={`${PROVIDER_LABEL[provider]} 登录二维码`} className="h-full w-full object-contain" />
        )}
        {done && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 text-[var(--home-accent)] animate-fade-rise">
            <IconCheck size={30} />
            <span className="text-[12px]">登录成功</span>
          </div>
        )}
      </div>

      <p className="text-center text-[12px] text-[var(--fc-ink-2)]">
        {qr?.message ?? '正在准备二维码…'}
      </p>

      <div className="flex items-center gap-2">
        <button className="btn" onClick={onRefresh} disabled={busy}>
          {busy ? <IconLoading size={14} /> : <IconRefresh size={14} />}
          刷新
        </button>
        <span className="chip">{qr ? PHASE_TEXT[qr.phase] ?? qr.phase : 'idle'}</span>
      </div>

      {qr?.url && (
        <p className="w-full truncate rounded-lg border border-[var(--glass-border-soft)] bg-white/5 px-2 py-1 text-center font-mono text-[9.5px] text-[var(--fc-muted)]" title={qr.url}>
          {qr.url}
        </p>
      )}

      {provider === 'qishui' && (
        <p className="text-[10.5px] leading-relaxed text-[var(--fc-muted)]">
          汽水音乐走的是独立 token 流程（/api/qishui/login/qrcode + /login/check），
          二维码只能由汽水 App 扫，后端也不会回可粘贴的登录链接。
        </p>
      )}
    </div>
  );
}

const PHASE_TEXT: Record<string, string> = {
  idle: '待生成',
  creating: '生成中',
  waiting: '等待扫码',
  scanned: '已扫码',
  confirmed: '已确认',
  expired: '已过期',
  error: '出错了',
};

function CookiePane({
  provider, value, busy, onChange, onSubmit,
}: {
  provider: Provider;
  value: string;
  busy: boolean;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="label-caps">{PROVIDER_LABEL[provider]} Cookie</p>
      <textarea
        className="field h-auto min-h-[104px] resize-y p-2.5 font-mono text-[11px] leading-relaxed"
        placeholder="粘贴浏览器里已登录的 Cookie 串，例如 MUSIC_U=… （网易云） / uin=…; qqmusic_key=… （QQ）"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-[10.5px] leading-relaxed text-[var(--fc-muted)]">
          本工程的后端是 MSW mock：Cookie 只会被 /api/{provider}/login/cookie 的假实现校验长度，
          不会发往任何真实服务，也不会落地保存。
        </p>
        <button className="btn btn--primary shrink-0" onClick={onSubmit} disabled={busy}>
          {busy && <IconLoading size={14} />}
          登录
        </button>
      </div>
    </div>
  );
}

/* ===================== 2. 账号 ===================== */

function UserModal({ onClose }: { onClose: () => void }) {
  const statuses = useAccountStore((s) => s.statuses);
  const active = useAccountStore((s) => s.activeAccountProvider);
  const logout = useAccountStore((s) => s.logout);
  const openModal = useUiStore((s) => s.openModal);

  const account = statuses[active];
  const loggedIn = account?.loggedIn === true;

  return (
    <Modal title="账号" onClose={onClose} width="fx">
      <div id="user-modal" className="flex flex-col gap-4">
        <div className="glass-card flex items-center gap-3 p-3.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--glass-border-soft)] bg-white/5 text-[16px] text-[var(--fc-ink-2)]">
            {loggedIn && account?.avatar ? (
              <img src={account.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <IconUser size={19} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] text-[var(--fc-ink)]">
              {loggedIn ? account?.nickname || '已登录' : '尚未登录'}
            </p>
            <p className="mt-0.5 flex items-center gap-2 truncate text-[11px] text-[var(--fc-muted)]">
              <SourceBadge provider={active} />
              <span className="truncate">{PROVIDER_LABEL[active]}</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {account?.vipLabel && <span className="chip text-[var(--champagne)]">{account.vipLabel}</span>}
            {loggedIn ? (
              <button className="btn !h-7 !px-3 !text-[11px]" onClick={() => void logout(active).catch(() => undefined)}>
                退出登录
              </button>
            ) : (
              <button className="btn btn--primary !h-7 !px-3 !text-[11px]" onClick={() => openModal('login')}>
                去登录
              </button>
            )}
          </div>
        </div>

        <div>
          <p className="label-caps mb-2">各平台状态</p>
          <div className="flex flex-col gap-1">
            {LOGIN_PROVIDERS.map(({ value, label }) => {
              const st = statuses[value];
              const online = st?.loggedIn === true;
              return (
                <div key={value} className="track-row !grid-cols-[auto_1fr_auto]">
                  <i className="source-dot" data-provider={value} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-[var(--fc-ink)]">{label}</span>
                    <span className="block truncate font-mono text-[10px] text-[var(--fc-muted)]">
                      {online ? `${st?.nickname ?? ''}${st?.vipLabel ? ` · ${st.vipLabel}` : ''}` : '未登录'}
                    </span>
                  </span>
                  {online ? (
                    <button
                      className="btn !h-7 !px-3 !text-[11px]"
                      onClick={() => void logout(value).catch(() => undefined)}
                    >
                      退出
                    </button>
                  ) : (
                    <button
                      className="ctrl-btn h-7 w-7"
                      title={`登录 ${label}`}
                      aria-label={`登录 ${label}`}
                      onClick={() => openModal('login')}
                    >
                      <IconUser size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-[10.5px] leading-relaxed text-[var(--fc-muted)]">
          听哪个平台的源由「当前账号」决定（activeAccountProvider），不是最后登录的那个；
          退出只会清掉该平台的 mock 会话，不影响其他平台。
        </p>
      </div>
    </Modal>
  );
}

/* ===================== 3. 收藏到歌单 ===================== */

function CollectModal({ song, onClose }: { song: Track | null; onClose: () => void }) {
  const targets = useLibraryStore((s) => s.collectTargets);
  const fetchCollect = useLibraryStore((s) => s.fetchCollect);
  const pushToast = useUiStore((s) => s.pushToast);

  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  /* 原版没有当前曲目时这个弹窗根本不会被打开；被强行打开就立刻收掉 */
  useEffect(() => {
    if (!song) onClose();
  }, [song, onClose]);

  useEffect(() => {
    if (!song) return;
    setLoading(true);
    void fetchCollect(song.provider)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [song, fetchCollect]);

  const add = async (pl: Playlist) => {
    if (!song) return;
    setBusyId(pl.id);
    const res = await addToPlaylist(pl.id, song).catch(() => null);
    setBusyId(null);
    const ok = res?.code === 200;
    pushToast(ok ? `已收藏到「${pl.name}」` : `加入「${pl.name}」失败`, ok ? 'ok' : 'error');
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || !song) {
      pushToast('先给新歌单起个名字', 'warn');
      return;
    }
    setCreating(true);
    const created = await createPlaylist(trimmed).catch(() => null);
    if (!created || created.code !== 200 || !created.id) {
      setCreating(false);
      pushToast('新建歌单失败（/api/playlist/create）', 'error');
      return;
    }
    const added = await addToPlaylist(created.id, song).catch(() => null);
    setName('');
    setCreating(false);
    pushToast(
      added?.code === 200 ? `已创建「${trimmed}」并加入收藏` : `「${trimmed}」已创建，但歌曲没加进去`,
      added?.code === 200 ? 'ok' : 'warn',
    );
    await fetchCollect(song.provider).catch(() => null);
  };

  return (
    <Modal title="收藏到歌单" onClose={onClose} width="fx">
      <div id="collect-modal" className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[11.5px] text-[var(--fc-muted)]">
          <img src={song?.cover} alt="" className="cover h-8 w-8" />
          <span className="min-w-0">
            <span className="block truncate text-[var(--fc-ink)]">{song?.name ?? '未选中曲目'}</span>
            <span className="block truncate">{song ? `${song.artist ?? '未知歌手'} · ${song.album ?? '未知专辑'}` : '从控制条或队列里的收藏按钮打开'}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            className="field min-w-0 flex-1"
            placeholder="新歌单名字"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
          />
          <button className="btn btn--primary shrink-0" onClick={() => void create()} disabled={creating || !song}>
            {creating && <IconLoading size={14} />}
            新建歌单
          </button>
        </div>

        <div className="max-h-[320px] min-h-[120px] overflow-y-auto pr-1">
          {loading && (
            <div className="flex flex-col gap-1.5">
              <div className="skeleton h-[46px]" />
              <div className="skeleton h-[46px]" />
              <div className="skeleton h-[46px]" />
            </div>
          )}
          {!loading && !targets.length && (
            <EmptyState title="没有可选歌单" hint={`/api/playlist/subscribe?provider=${song?.provider ?? 'netease'} 返回了空列表。先建一个吧。`} />
          )}
          {!loading && targets.map((pl) => (
            <button
              key={`${pl.provider}-${pl.id}`}
              className="track-row !grid-cols-[34px_1fr_auto] text-left"
              onClick={() => void add(pl)}
              disabled={busyId === pl.id}
            >
              <img src={pl.cover} alt="" className="cover h-[34px] w-[34px]" />
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] text-[var(--fc-ink)]">{pl.name}</span>
                <span className="block truncate font-mono text-[10px] text-[var(--fc-muted)]">
                  {pl.trackCount ? `${pl.trackCount} 首` : '歌单'}
                </span>
              </span>
              <span className="font-mono text-[10px] text-[var(--fc-muted)]">
                {busyId === pl.id ? '加入中' : '+'}
              </span>
            </button>
          ))}
        </div>

        <p className="text-[10.5px] leading-relaxed text-[var(--fc-muted)]">
          写入走 /api/playlist/add-song，id 用 queueItemKey 的平台前缀键；mock 后端只把歌数加到本次会话新建的歌单上。
        </p>
      </div>
    </Modal>
  );
}

/* ===================== 4. 曲目详情 + 评论 ===================== */

/** /api/song/comments 的条目形状按源码现状保留，逐条防御性读取 */
interface Comment {
  commentId: string;
  content: string;
  likedCount: number;
  time?: number;
  user?: { nickname?: string };
}

function TrackDetailModal({ song, onClose }: { song: Track | null; onClose: () => void }) {
  const openModal = useUiStore((s) => s.openModal);
  const [items, setItems] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!song) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setItems([]);
    void fetchComments(song, 20)
      .then((res) => {
        if (!alive) return;
        const raw = Array.isArray(res.data?.comments) ? res.data.comments : [];
        setItems(raw.map(normalizeComment).filter((c): c is Comment => c !== null));
        setTotal(res.data?.total ?? raw.length);
      })
      .catch(() => {
        if (alive) setError('评论加载失败（/api/song/comments）');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [song]);

  const duration = song?.duration ?? (song?.durationMs ? song.durationMs / 1000 : 0);

  return (
    <Modal
      title="曲目详情"
      onClose={onClose}
      width="wide"
      footer={
        song ? (
          <>
            <button className="btn" onClick={() => openModal('custom-lyric', song)}>自定义歌词</button>
            <button className="btn" onClick={() => openModal('cover-crop', song)}>自定义封面</button>
            <button className="btn btn--primary" onClick={() => openModal('collect', song)}>收藏到歌单</button>
          </>
        ) : undefined
      }
    >
      <div id="track-detail-modal" className="flex flex-col gap-4">
        {!song ? (
          <EmptyState title="没有选中曲目" hint="这个弹窗要带一首歌：从控制条或队列里打开曲目详情。" />
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-4">
              <img src={song.cover} alt="" className="cover h-[148px] w-[148px] !rounded-xl" />
              <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                <p className="text-[15px] font-semibold text-[var(--fc-ink)]">{song.name}</p>
                <p className="text-[12px] text-[var(--fc-ink-2)]">{song.artist ?? '未知歌手'}</p>
                <p className="text-[11.5px] text-[var(--fc-muted)]">{song.album ?? '未知专辑'}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="chip"><SourceBadge provider={song.provider} /></span>
                  <span className="chip">{formatDuration(duration)}</span>
                  <span className="chip">{qualityLabel(song.provider, 'standard')}</span>
                  {song.fee ? <span className="chip text-[var(--champagne)]">VIP</span> : null}
                  {song.needVip || song.onlyVipPlayable ? <span className="chip">需权益</span> : null}
                </div>
                <p className="mt-1 break-all font-mono text-[9.5px] text-[var(--fc-muted)]">
                  {queueItemKey(song)}
                </p>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="label-caps">评论</p>
                <span className="font-mono text-[10px] text-[var(--fc-muted)]">
                  {loading ? '加载中' : `${items.length} / ${total}`}
                </span>
              </div>

              {loading && (
                <div className="flex flex-col gap-2">
                  <div className="skeleton h-[52px]" />
                  <div className="skeleton h-[52px]" />
                  <div className="skeleton h-[52px]" />
                </div>
              )}

              {!loading && error && <p className="py-6 text-center text-[12px] text-[var(--source-netease)]">{error}</p>}

              {!loading && !error && !items.length && (
                <EmptyState title="还没有评论" hint="mock 后端对部分曲目会返回空 comments 数组。" />
              )}

              {!loading && !error && (
                <div className="max-h-[268px] overflow-y-auto pr-1">
                  {items.map((c, i) => (
                    <div key={c.commentId || `${song.id}-c-${i}`} className="border-b border-[var(--glass-border-soft)] px-1 py-2.5 last:border-0">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-white/10 text-[10px] text-[var(--fc-ink-2)]">
                          {(c.user?.nickname ?? '匿名').slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--fc-ink-2)]">
                          {c.user?.nickname ?? '匿名听众'}
                        </span>
                        <span className="shrink-0 font-mono text-[9.5px] text-[var(--fc-muted)]">
                          {relativeTime(c.time) || '时间未知'}
                        </span>
                      </div>
                      <p className="text-[12.5px] leading-relaxed text-[var(--fc-ink)]">{c.content}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--fc-muted)]">
                        <ThumbIcon size={12} />
                        <span className="font-mono">{c.likedCount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** 原版评论行尾的竖大拇指计数，这里用同形状的描边图标代替字体 emoji */
function ThumbIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M7 10.5v9H4.6v-9z" />
      <path d="M7 10.5 11 3.4c1.6 0 2.6 1.2 2.6 2.7l-.5 3.3h4.6c1.4 0 2.4 1.3 2.1 2.6l-1.4 6c-.3 1.2-1.3 2-2.5 2H7" />
    </svg>
  );
}

function normalizeComment(raw: unknown): Comment | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as {
    commentId?: unknown;
    content?: unknown;
    likedCount?: unknown;
    time?: unknown;
    user?: unknown;
  };
  const content = typeof r.content === 'string' ? r.content.trim() : '';
  if (!content) return null;

  const user = typeof r.user === 'object' && r.user !== null
    ? { nickname: typeof (r.user as { nickname?: unknown }).nickname === 'string'
        ? (r.user as { nickname: string }).nickname
        : undefined }
    : undefined;

  return {
    commentId: typeof r.commentId === 'string' ? r.commentId : typeof r.commentId === 'number' ? String(r.commentId) : '',
    content,
    likedCount: Number(r.likedCount) || 0,
    time: typeof r.time === 'number' ? r.time : undefined,
    user,
  };
}

/* ===================== 5. 自定义歌词 ===================== */

function CustomLyricModal({ song, onClose }: { song: Track | null; onClose: () => void }) {
  const pushToast = useUiStore((s) => s.pushToast);
  const [raw, setRaw] = useState(() => readString(STORAGE_KEYS.customLyrics, ''));
  const [preview, setPreview] = useState<LyricLine[]>([]);
  const [parsedCount, setParsedCount] = useState(0);

  const analyse = () => {
    const lines = parseLrc(raw);
    setPreview(lines.slice(0, 8));
    setParsedCount(lines.length);
    /* 原版把整段 LRC 原文写进 localStorage，键名逐字保留 */
    writeString(STORAGE_KEYS.customLyrics, raw);
    pushToast(
      lines.length ? `解析出 ${lines.length} 行，已存到本地` : '没解析出带时间轴的行',
      lines.length ? 'ok' : 'warn',
    );
  };

  return (
    <Modal
      title="自定义歌词"
      onClose={onClose}
      width="wide"
      footer={
        <>
          <button className="btn" onClick={onClose}>关闭</button>
          <button className="btn btn--primary" onClick={analyse}>解析并预览</button>
        </>
      }
    >
      <div id="custom-lyric-modal" className="flex flex-col gap-3">
        <p className="text-[11.5px] text-[var(--fc-muted)]">
          目标曲目：<span className="text-[var(--fc-ink-2)]">{song ? `${song.name} · ${song.artist ?? '未知歌手'}` : '未选中曲目'}</span>
        </p>

        <div className="grid gap-4 md:grid-cols-[1fr_240px]">
          <textarea
            className="field h-auto min-h-[228px] resize-y p-2.5 font-mono text-[11px] leading-relaxed"
            placeholder={'[00:12.34]第一行\n[00:16.80]第二行\n（标准 LRC，支持一行多个时间标签）'}
            spellCheck={false}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />

          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="label-caps">预览</p>
              <span className="font-mono text-[10px] text-[var(--fc-muted)]">
                {preview.length ? `前 ${preview.length} / ${parsedCount} 行` : '尚无结果'}
              </span>
            </div>
            <div className="glass-card min-h-[228px] max-h-[268px] overflow-y-auto rounded-xl p-2.5">
              {!preview.length && (
                <p className="px-1 py-6 text-center text-[11.5px] leading-relaxed text-[var(--fc-muted)]">
                  点「解析并预览」后，这里会列出前 8 行带时间轴的歌词。
                </p>
              )}
              {preview.map((line, i) => (
                <div key={`${line.time}-${i}`} className="flex items-baseline gap-2 py-0.5">
                  <span className="shrink-0 font-mono text-[10px] text-[var(--home-accent)]">{formatDuration(line.time)}</span>
                  <span className="min-w-0 flex-1 break-words text-[12px] text-[var(--fc-ink)]">{line.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-[10.5px] leading-relaxed text-[var(--fc-muted)]">
          持久化沿用原版：原文整段写进 localStorage 的 <code className="font-mono">{STORAGE_KEYS.customLyrics}</code>，
          歌词层在轨道没歌词时会读它兜底。清除只需在控制台 removeItem 这个键。
        </p>
      </div>
    </Modal>
  );
}

/* ===================== 6. 封面裁剪 ===================== */

function CoverCropModal({ song, onClose }: { song: Track | null; onClose: () => void }) {
  const pushToast = useUiStore((s) => s.pushToast);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);

  const key = song ? queueItemKey(song) : '';
  const existing = key
    ? readJson<Record<string, string>>(STORAGE_KEYS.customCovers, {})[key]
    : undefined;

  const pickImage = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      pushToast('只能选图片文件', 'warn');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDataUrl(reader.result);
        setZoom(1);
        setFileName(file.name);
      } else {
        pushToast('本地图片读取失败', 'error');
      }
    };
    reader.onerror = () => pushToast('本地图片读取失败', 'error');
    reader.readAsDataURL(file);
  };

  const apply = async () => {
    if (!song || !dataUrl) return;
    setBusy(true);
    const img = await loadImage(dataUrl);
    const out = img ? cropSquareToJpeg(img, zoom) : null;
    setBusy(false);

    if (!out) {
      pushToast(img ? '封面导出失败' : '图片解码失败', 'error');
      return;
    }

    const map = readJson<Record<string, string>>(STORAGE_KEYS.customCovers, {});
    writeJson(STORAGE_KEYS.customCovers, { ...map, [queueItemKey(song)]: out });
    pushToast(`已套用自定义封面（${song.name}）`, 'ok');
    onClose();
  };

  return (
    <Modal
      title="自定义封面"
      onClose={onClose}
      width="fx"
      footer={
        song && dataUrl ? (
          <>
            <button className="btn" onClick={() => { setDataUrl(null); setFileName(''); setZoom(1); }}>重选</button>
            <button className="btn btn--primary" onClick={() => void apply()} disabled={busy}>
              {busy && <IconLoading size={14} />}
              应用
            </button>
          </>
        ) : undefined
      }
    >
      <div id="cover-crop-modal" className="flex flex-col gap-3">
        {!song ? (
          <EmptyState
            title="当前没有曲目"
            hint="自定义封面是按 queueItemKey 存进 localStorage 的，得先有一首歌能挂上去。随便播一首再来。"
          />
        ) : (
          <>
            <p className="text-[11.5px] text-[var(--fc-muted)]">
              目标：<span className="text-[var(--fc-ink-2)]">{song.name}</span>
              <span className="ml-1.5 break-all font-mono text-[9.5px]">{key}</span>
            </p>

            <label className="btn w-full">
              <IconUpload size={14} />
              {fileName || '选择本地图片'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  pickImage(e.target.files);
                  /* 清掉 value，否则连续选同一张图不会再触发 change */
                  e.target.value = '';
                }}
              />
            </label>

            <div className="mx-auto aspect-square w-[212px] overflow-hidden rounded-xl border border-[var(--glass-border-soft)]">
              {dataUrl ? (
                <img
                  src={dataUrl}
                  alt="裁剪预览"
                  className="h-full w-full object-cover"
                  style={{ transform: `scale(${zoom.toFixed(2)})`, transition: 'transform 140ms var(--ease-mr)' }}
                />
              ) : (
                <div className="grid h-full w-full place-items-center bg-white/5 px-4 text-center text-[11px] leading-relaxed text-[var(--fc-muted)]">
                  {existing ? '这张歌已有自定义封面，选新图可覆盖' : '还没选图，预览会是方块'}
                </div>
              )}
            </div>

            <Slider
              label="缩放"
              value={zoom}
              min={1}
              max={4}
              step={0.05}
              onChange={setZoom}
              format={(v) => `${v.toFixed(2)}×`}
            />

            <p className="text-[10.5px] leading-relaxed text-[var(--fc-muted)]">
              应用时把图按当前缩放居中裁成正方形，离屏画到 {COVER_OUTPUT}×{COVER_OUTPUT} 再导出
              jpeg(quality {COVER_JPEG_QUALITY})，写进 <code className="font-mono">{STORAGE_KEYS.customCovers}</code>。
              图片数据只留在本机，不会上传。
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 居中裁方 → 离屏 300×300 → jpeg data-uri；拿不到 2d 上下文时返回 null */
function cropSquareToJpeg(img: HTMLImageElement, zoom: number): string | null {
  try {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;

    const side = Math.min(w, h) / Math.max(1, zoom);
    const sx = (w - side) / 2;
    const sy = (h - side) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = COVER_OUTPUT;
    canvas.height = COVER_OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, COVER_OUTPUT, COVER_OUTPUT);
    return canvas.toDataURL('image/jpeg', COVER_JPEG_QUALITY);
  } catch {
    return null;
  }
}

/* ===================== 7. 检查更新 ===================== */

function UpdateModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<UpdateLatestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void fetchUpdateLatest()
      .then((res) => { if (alive) setData(res); })
      .catch(() => { if (alive) setError('检查更新失败（/api/update/latest）'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tick]);

  const bodyLines = (data?.body ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  return (
    <Modal
      title="检查更新"
      onClose={onClose}
      width="fx"
      footer={
        <>
          <button className="btn" onClick={() => setTick((n) => n + 1)} disabled={loading}>
            <IconRefresh size={14} />
            重新检查
          </button>
          <button className="btn btn--primary" onClick={onClose}>知道了</button>
        </>
      }
    >
      <div id="update-modal" className="flex flex-col gap-3.5">
        {loading && (
          <div className="flex flex-col gap-2">
            <div className="skeleton h-[52px]" />
            <div className="skeleton h-[76px]" />
          </div>
        )}

        {!loading && error && <p className="py-6 text-center text-[12px] text-[var(--source-netease)]">{error}</p>}

        {!loading && !error && data && (
          <>
            <div className="glass-card flex items-center justify-between gap-3 rounded-xl px-3.5 py-3">
              <div>
                <p className="label-caps mb-1">当前版本</p>
                <p className="font-mono text-[13px] text-[var(--fc-ink)]">{data.currentVersion}</p>
              </div>
              <div className="text-right">
                <p className="label-caps mb-1">最新版本</p>
                <p className="font-mono text-[13px] text-[var(--home-accent)]">{data.latestVersion ?? data.currentVersion}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`chip ${data.hasUpdate ? 'text-[var(--home-accent)]' : ''}`}>
                {data.hasUpdate ? '有新版本' : '已是最新'}
              </span>
              {data.releaseUrl && (
                <a
                  className="text-[11.5px] text-[var(--fc-ink-2)] underline decoration-[var(--glass-border)] underline-offset-2 hover:text-[var(--home-accent)]"
                  href={data.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  发布页
                </a>
              )}
            </div>

            {bodyLines.length > 0 && (
              <div>
                <p className="label-caps mb-1.5">更新内容</p>
                <ul className="flex flex-col gap-1">
                  {bodyLines.map((line, i) => (
                    <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-[var(--fc-ink-2)]">
                      <span className="font-mono text-[10px] text-[var(--champagne)]">{String(i + 1).padStart(2, '0')}</span>
                      <span className="min-w-0 flex-1 break-words">{line.replace(/^[-*·]\s*/, '')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(data.downloadPages ?? []).length > 0 && (
              <div>
                <p className="label-caps mb-1.5">外部下载页</p>
                <div className="flex flex-wrap gap-2">
                  {(data.downloadPages ?? []).map((p) => (
                    <a
                      key={p.url}
                      className="btn !h-8 !text-[11.5px]"
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {p.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <p className="text-[10.5px] leading-relaxed text-[var(--fc-muted)]">
          说明：2.0.3 之后的真实客户端对 /api/update/download 与 /api/update/patch 一律返回
          HTTP 410 <code className="font-mono">UPDATE_EXTERNAL_ONLY</code> —— 安装包只能从上面的外部页面下载，
          应用内不做下载，这里也就不会有任何下载动作。
        </p>
      </div>
    </Modal>
  );
}
