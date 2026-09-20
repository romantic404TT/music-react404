/**
 * 原版把 key 直接写字面量散在各模块里。这里集中成本工程实际用到的那批，
 * 名字与 public/js/modules/** 中出现的字符串保持一致，便于对照迁移真实数据。
 */
export const STORAGE_KEYS = {
  volume: 'apex-player-volume',
  audioFade: 'mineradio-audio-fade-v1',
  playbackQuality: 'mineradio-playback-quality-v1',
  lastPlayback: 'mineradio-last-playback-v1',
  startupResumeMode: 'mineradio-startup-resume-mode-v1',
  startupAutoplay: 'mineradio-startup-autoplay-v1',

  searchHistory: 'mineradio-search-history',
  customCovers: 'mineradio-custom-covers',
  customLyrics: 'mineradio-custom-lyrics-v1',
  lyricTimingOffsets: 'mineradio-lyric-timing-offsets-v1',

  listenStats: 'mineradio-listen-stats-v1',
  listenRollup: 'mineradio-listen-rollup-v2',

  currentFxAutosave: 'mineradio-current-fx-autosave-v1',
  userFxArchives: 'mineradio-user-fx-archives-v1',

  playlistPanelPinned: 'mineradio-playlist-panel-pinned-v1',
  playlistPanelTab: 'mineradio-playlist-panel-tab-v1',
  controlsAutoHide: 'mineradio-controls-auto-hide-v1',
  userCapsuleAutoHide: 'mineradio-user-capsule-auto-hide-v1',
  fxFabAutoHide: 'mineradio-fx-fab-auto-hide-v1',
  diyPlayerMode: 'mineradio-diy-player-mode-v1',
  freeCamera: 'mineradio-free-camera-v1',
  hotkeySettings: 'mineradio-hotkey-settings-v1',
  visualGuideSeen: 'mineradio-visual-guide-seen-v2',
  closeBehavior: 'mineradio-close-behavior-v1',
  accountProviderOrder: 'mineradio-account-provider-order-v1',
  accountProviderVisible: 'mineradio-account-provider-visible-v1',
  cuefieldAutomix: 'mineradio-cuefield-automix-v1',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 配额满或被隐私模式禁用时静默降级——原版同样是 try/catch 后继续跑 */
  }
}

export function readString(key: string, fallback = ''): string {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw;
  } catch {
    return fallback;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 同上 */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 同上 */
  }
}
