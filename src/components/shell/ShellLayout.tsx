import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { GlassFilterDefs } from '@/components/ui/GlassFilterDefs';
import { ToastLayer } from '@/components/ui/primitives';
import { VisualStage } from '@/components/stage/VisualStage';
import { AmbientParticles } from '@/components/stage/AmbientParticles';
import { LyricsOverlay } from '@/components/stage/LyricsOverlay';
import { BottomBar } from '@/components/player/BottomBar';
import { PlaylistPanel } from '@/components/playlist/PlaylistPanel';
import { FxFab, FxPanel } from '@/components/fx/FxPanel';
import { ModalHost } from '@/components/modals/ModalHost';
import { IconImmersive, IconLibrary, IconMic, IconSearch, IconUser, IconVisual } from '@/components/ui/Icons';
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useAccountStore } from '@/store/accountStore';
import { useFxStore } from '@/store/fxStore';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';

/**
 * 应用外壳。
 *
 * 原版所有层常驻在同一个文档里（#desktop-window-shell 下按绘制顺序排：
 * 背景层 → #canvas-container → 歌词层 → 搜索 → 首页 → 控制条 → 面板 → 弹窗），
 * 页面切换只改 class，不重建 DOM。这里用 React Router 的布局路由还原同一结构：
 * 视觉舞台、控制条、面板挂在布局里，只有 <Outlet/> 换内容，音频与 WebGL 上下文不会因路由而重启。
 */

/**
 * 顶栏「播客」「画像」两个入口。按需求先隐藏而非删除：改成 true 就放回来，
 * /podcast 与 /stats 两条路由和页面组件都没动，地址栏直接访问照样打得开。
 */
const SHOW_PODCAST_ENTRY: boolean = false;
const SHOW_STATS_ENTRY: boolean = false;

const NAV = [
  { to: '/home', label: '首页', short: 'HOME', Icon: IconVisual },
  { to: '/search', label: '搜索', short: 'SEARCH', Icon: IconSearch },
  { to: '/library', label: '音乐库', short: 'LIBRARY', Icon: IconLibrary },
  ...(SHOW_PODCAST_ENTRY ? [{ to: '/podcast', label: '播客', short: 'PODCAST', Icon: IconMic }] : []),
  ...(SHOW_STATS_ENTRY ? [{ to: '/stats', label: '画像', short: 'PROFILE', Icon: IconUser }] : []),
  { to: '/stage', label: '舞台', short: 'STAGE', Icon: IconImmersive },
];

/**
 * 标题栏右上角的账号入口开关。同样是隐藏而非删除：改成 true 就恢复。
 * 注意登录弹窗现在只有这一处 + 音乐库页面两个入口，两边都为 false 时界面上进不去。
 */
const SHOW_ACCOUNT_ENTRY: boolean = false;

function TitleBar() {
  const openModal = useUiStore((s) => s.openModal);
  const pushToast = useUiStore((s) => s.pushToast);
  const diy = useSettingsStore((s) => s.diyPlayerMode);
  const toggleFlag = useSettingsStore((s) => s.toggleFlag);
  const statuses = useAccountStore((s) => s.statuses);
  const active = useAccountStore((s) => s.activeAccountProvider);
  const setPanel = useUiStore((s) => s.setPanel);
  const account = statuses[active];

  return (
    <header
      data-ui-layer
      id="desktop-titlebar"
      className="absolute inset-x-0 top-0 z-40 flex h-[58px] items-center gap-3 px-4"
    >
      <div className="flex items-baseline gap-0.5 select-none">
        <span className="wordmark text-[19px] font-black text-[var(--fc-ink)]">Mine</span>
        <span className="wordmark text-[19px] font-black text-[var(--home-accent)]">radio</span>
      </div>

      <nav className="ml-4 flex items-center gap-1" aria-label="主导航">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `ctrl-btn !w-auto gap-1.5 px-3 text-[12px] ${isActive ? '!text-[var(--home-accent)]' : ''}`
            }
            title={label}
          >
            <Icon size={14} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <button className="ctrl-btn" id="diy-mode-btn" data-active={diy} title="DIY 模式" onClick={() => toggleFlag('diyPlayerMode')}>
          <span className="font-mono text-[10.5px] font-bold tracking-wider">DIY</span>
        </button>
        <button className="ctrl-btn" id="update-entry" title="检查更新" onClick={() => openModal('update')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M12 4v12" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" />
          </svg>
        </button>
        <button
          className="ctrl-btn"
          id="visual-guide-btn"
          title="视觉指南"
          onClick={() => pushToast('视觉指南的分步引导未在本次复刻范围内', 'info')}
        >
          <span className="font-mono text-[13px] font-bold">?</span>
        </button>
        {SHOW_ACCOUNT_ENTRY && (
          <button
            className="icon-btn !h-9 !w-9 shrink-0 overflow-hidden"
            onClick={() => (account?.loggedIn ? openModal('user') : openModal('login'))}
            title={account?.loggedIn ? account.nickname ?? '账号' : '登录'}
            data-glass="account"
          >
            {account?.loggedIn && account.avatar ? (
              <img src={account.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <IconUser size={16} />
            )}
          </button>
        )}
        {/* Electron 窗口控制：在浏览器里没有对应能力，保留外观但标注不可用 */}
        <div className="ml-1 flex items-center gap-1" id="desktop-window-btns" title="窗口控制由 Electron 主进程处理，Web 版不接管">
          <button className="ctrl-btn h-7 w-7" disabled aria-label="最小化" title="最小化（仅桌面版）">
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
          <button className="ctrl-btn h-7 w-7" disabled aria-label="最大化" title="最大化（仅桌面版）">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button
            className="ctrl-btn h-7 w-7"
            aria-label="收起面板"
            title="收起所有面板"
            onClick={() => { setPanel('closed'); }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
        </div>
      </div>
    </header>
  );
}

/** 背景层：#custom-bg / #album-bg 在原版是封面渐变与视频底，这里用封面派生的两个叠层 */
function BackgroundLayers() {
  const song = usePlayerStore((s) => s.current());
  const fx = useFxStore((s) => s.fx);
  const mode = fx.backgroundColorMode;

  /* coverFile 只有一种来源：用户放进歌曲文件夹的那张图。
     「图片」模式把原图铺开，「封面」模式只轻糊一下（能看清是什么，又不抢歌词）；
     生成的渐变封面没有内容可辨认，两种模式下都糊成氛围光。 */
  const photo = mode !== 'solid' ? song?.coverFile : undefined;
  const flat = mode === 'image';
  const veil = photo
    ? flat
      ? 'linear-gradient(180deg, rgba(8,9,11,.34), rgba(8,9,11,.22) 46%, rgba(8,9,11,.56))'
      : 'linear-gradient(180deg, rgba(8,9,11,.42), rgba(8,9,11,.3) 46%, rgba(8,9,11,.62))'
    : 'radial-gradient(ellipse at 50% 42%, rgba(8,9,11,.25), rgba(8,9,11,.94) 68%)';
  const blur = photo ? (flat ? 0 : Math.max(0, 2.5 - fx.backgroundGlassOpacity * 2.5)) : Math.max(28, 70 - fx.backgroundGlassOpacity * 60);
  const opacity = photo ? (flat ? 1 : 0.92) : mode === 'solid' ? 0 : 0.55;

  return (
    <>
      <div
        id="custom-bg"
        className="absolute inset-0 z-0"
        style={{
          background: mode === 'solid' ? fx.backgroundColor : 'transparent',
          opacity: fx.backgroundOpacity,
          transition: 'background var(--dur-canvas) var(--ease-mr)',
        }}
      />
      <div
        id="album-bg"
        className="absolute inset-0 z-0"
        style={{
          opacity,
          transition: 'opacity var(--dur-canvas) var(--ease-mr)',
          backgroundImage: song?.cover ? `${veil}, url("${song.cover}")` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: `blur(${Math.max(0, blur).toFixed(1)}px) saturate(${(1.1 + fx.intensity * 0.35).toFixed(2)})`,
          transform: 'scale(1.12)',
        }}
      />
      <div className="stage-veil" />
    </>
  );
}

export function ShellLayout() {
  useAudioEngine();
  useHotkeys();

  const navigate = useNavigate();
  const location = useLocation();
  const splashActive = useUiStore((s) => s.splashActive);
  const refreshAll = useAccountStore((s) => s.refreshAll);
  const restore = usePlayerStore((s) => s.restoreLast);
  const startupResume = useSettingsStore((s) => s.startupResumeMode);
  const toggleFx = useUiStore((s) => s.toggleFxPanel);

  useEffect(() => {
    void refreshAll();
    if (startupResume === 'resume') restore();
    /* 启动页存在时路由先停在 /splash */
    if (splashActive && location.pathname !== '/splash') navigate('/splash', { replace: true });
  }, [refreshAll, restore, startupResume, splashActive, location.pathname, navigate]);

  /* 原版：播放中按 V 之外的路径也能开控制台，这里绑定 K 作为快捷入口 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && !(e.target as HTMLElement)?.closest('input,textarea')) toggleFx();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleFx]);

  /* 纯舞台页：只留粒子与歌词，标题栏/控制条/面板全部让位。
     音频引擎和 WebGL 上下文仍挂在这里，所以进/出这一页不会打断播放。 */
  const stageMode = location.pathname === '/stage';

  return (
    <div
      id="desktop-window-shell"
      data-stage={stageMode || undefined}
      className="relative h-full w-full overflow-hidden bg-[var(--fc-bg)]"
    >
      <GlassFilterDefs />
      <BackgroundLayers />
      <AmbientParticles />
      <VisualStage />
      {!stageMode && <LyricsOverlay />}
      {!stageMode && <TitleBar />}

      <main
        data-ui-layer
        className={`absolute inset-x-0 bottom-0 z-20 overflow-y-auto ${stageMode ? 'top-0' : 'top-[58px]'}`}
      >
        <Outlet />
      </main>

      {/* 舞台页的歌词与控件由 StagePage 自己经 <Outlet/> 渲染，这里只让位 */}
      {!stageMode && (
        <>
          <PlaylistPanel />
          <BottomBar />
          <FxFab />
          <FxPanel />
        </>
      )}
      <ModalHost />
      <ToastLayer />
    </div>
  );
}
