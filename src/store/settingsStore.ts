import { create } from 'zustand';
import { STORAGE_KEYS, readJson, readString, writeJson, writeString } from '@/lib/storage';
import type { QualityLevel } from '@/types/track';
import { DEFAULT_QUALITY, type Provider } from '@/types/track';
import type { QualityPrefs } from '@/types/api';

/**
 * 可持久化的播放偏好。
 *
 * 三个细节照抄原版：
 *   · 音量存的是裸字符串（apex-player-volume），不是 JSON；
 *   · 音质按平台分别记忆（mineradio-playback-quality-v1 → {provider: level}）；
 *   · 播放模式不持久化（原版每次启动都回到 loop）。
 */

export interface FadePrefs {
  fadeInMs: number;
  fadeOutMs: number;
}

const FADE_DEFAULT: FadePrefs = { fadeInMs: 460, fadeOutMs: 420 };

function readVolume(): number {
  const raw = readString(STORAGE_KEYS.volume, '1');
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
}

/** mineradio-search-history 在不同版本里既可能是数组，也可能是 {items:[...]} 包装 */
function readHistory(): string[] {
  const raw = readJson<unknown>(STORAGE_KEYS.searchHistory, []);
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
  if (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)) {
    return (raw as { items: unknown[] }).items.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

interface SettingsState {
  volume: number;
  lastNonZeroVolume: number;
  fade: FadePrefs;
  quality: QualityPrefs;
  controlsAutoHide: boolean;
  userCapsuleAutoHide: boolean;
  fxFabAutoHide: boolean;
  playlistPanelPinned: boolean;
  diyPlayerMode: boolean;
  startupResumeMode: 'resume' | 'restart';
  searchHistory: string[];

  setVolume(v: number): void;
  toggleMute(): void;
  setFade(patch: Partial<FadePrefs>): void;
  setQuality(provider: Provider, level: QualityLevel): void;
  qualityOf(provider: Provider): QualityLevel;
  toggleFlag(key: 'controlsAutoHide' | 'userCapsuleAutoHide' | 'fxFabAutoHide' | 'playlistPanelPinned' | 'diyPlayerMode', value?: boolean): void;
  setStartupResumeMode(mode: 'resume' | 'restart'): void;
  pushSearchHistory(kw: string): void;
  clearSearchHistory(): void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  volume: readVolume(),
  lastNonZeroVolume: readVolume() || 1,
  fade: readJson<FadePrefs>(STORAGE_KEYS.audioFade, FADE_DEFAULT),
  quality: readJson<QualityPrefs>(STORAGE_KEYS.playbackQuality, {} as QualityPrefs),
  // 原版这几个偏好默认全部是 false（readBooleanPreference(key, false)），
  // 控制条默认常显，自动隐藏要用户主动开。
  controlsAutoHide: readString(STORAGE_KEYS.controlsAutoHide, '0') === '1',
  userCapsuleAutoHide: readString(STORAGE_KEYS.userCapsuleAutoHide, '0') === '1',
  fxFabAutoHide: readString(STORAGE_KEYS.fxFabAutoHide, '0') === '1',
  playlistPanelPinned: readString(STORAGE_KEYS.playlistPanelPinned, '0') === '1',
  diyPlayerMode: readString(STORAGE_KEYS.diyPlayerMode, '0') === '1',
  startupResumeMode: readString(STORAGE_KEYS.startupResumeMode, 'resume') === 'restart' ? 'restart' : 'resume',
  searchHistory: readHistory(),

  setVolume: (v) => {
    const volume = Math.min(1, Math.max(0, v));
    writeString(STORAGE_KEYS.volume, String(volume));
    set({ volume, lastNonZeroVolume: volume > 0 ? volume : get().lastNonZeroVolume });
  },

  toggleMute: () => {
    const { volume, lastNonZeroVolume } = get();
    get().setVolume(volume > 0 ? 0 : lastNonZeroVolume || 1);
  },

  setFade: (patch) => {
    const fade = { ...get().fade, ...patch };
    writeJson(STORAGE_KEYS.audioFade, fade);
    set({ fade });
  },

  setQuality: (provider, level) => {
    const quality = { ...get().quality, [provider]: level };
    writeJson(STORAGE_KEYS.playbackQuality, quality);
    set({ quality });
  },

  qualityOf: (provider) => get().quality[provider] ?? DEFAULT_QUALITY[provider],

  toggleFlag: (key, value) => {
    const next = value ?? !get()[key];
    const map = {
      controlsAutoHide: STORAGE_KEYS.controlsAutoHide,
      userCapsuleAutoHide: STORAGE_KEYS.userCapsuleAutoHide,
      fxFabAutoHide: STORAGE_KEYS.fxFabAutoHide,
      playlistPanelPinned: STORAGE_KEYS.playlistPanelPinned,
      diyPlayerMode: STORAGE_KEYS.diyPlayerMode,
    } as const;
    writeString(map[key], next ? '1' : '0');
    set({ [key]: next } as Partial<SettingsState>);
  },

  setStartupResumeMode: (mode) => {
    writeString(STORAGE_KEYS.startupResumeMode, mode);
    set({ startupResumeMode: mode });
  },

  pushSearchHistory: (kw) => {
    const trimmed = kw.trim();
    if (!trimmed) return;
    const next = [trimmed, ...get().searchHistory.filter((k) => k !== trimmed)].slice(0, 20);
    writeJson(STORAGE_KEYS.searchHistory, next);
    set({ searchHistory: next });
  },

  clearSearchHistory: () => {
    writeJson(STORAGE_KEYS.searchHistory, []);
    set({ searchHistory: [] });
  },
}));
