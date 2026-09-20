import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ShellLayout } from '@/components/shell/ShellLayout';

/**
 * 路由表。
 *
 * 原版没有前端路由——它只有一个文档，界面靠 class 切显隐，桌面模式和桌面歌词是独立窗口。
 * 这里按需求补上 React Router，并把常驻层（视觉舞台、控制条、面板、弹窗）放进布局路由，
 * 使音频上下文与 WebGL 上下文在页面切换时不重建，行为上仍等价于原版的"层常驻"。
 */

const SplashPage = lazy(() => import('@/pages/SplashPage').then((m) => ({ default: m.SplashPage })));
const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })));
const SearchPage = lazy(() => import('@/pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const LibraryPage = lazy(() => import('@/pages/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const PlaylistDetailPage = lazy(() => import('@/pages/PlaylistDetailPage').then((m) => ({ default: m.PlaylistDetailPage })));
const PodcastPage = lazy(() => import('@/pages/PodcastPage').then((m) => ({ default: m.PodcastPage })));
const StatsPage = lazy(() => import('@/pages/StatsPage').then((m) => ({ default: m.StatsPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

function RouteFallback() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-[2px] w-[120px] overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 animate-pulse-soft rounded-full bg-[var(--home-accent)]" />
        </div>
        <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--fc-muted)]">LOADING</p>
      </div>
    </div>
  );
}

export function AppRoutes(): ReactNode {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<ShellLayout />}>
          <Route path="/splash" element={<SplashPage />} />
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/search/:mode" element={<SearchPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/playlist/:provider/:id" element={<PlaylistDetailPage />} />
          <Route path="/podcast" element={<PodcastPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
