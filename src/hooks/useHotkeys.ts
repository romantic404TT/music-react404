import { useEffect } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * 全局快捷键，对应原版 10-shell/01-viewport-resize-shortcuts.js 与
 * 更新日志里那条"方向键上下调节音量，每次 5%，输入框和滑条聚焦时不会误触"。
 */
export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, [contenteditable="true"], [role="slider"]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const player = usePlayerStore.getState();
      const settings = useSettingsStore.getState();

      switch (e.key) {
        case ' ':
        case 'Spacebar':
          e.preventDefault();
          void player.toggle();
          break;
        case 'ArrowRight':
          e.preventDefault();
          void player.next(true);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          void player.prev();
          break;
        case 'ArrowUp':
          e.preventDefault();
          settings.setVolume(Math.min(1, settings.volume + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          settings.setVolume(Math.max(0, settings.volume - 0.05));
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen().catch(() => undefined);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
