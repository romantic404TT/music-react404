import { create } from 'zustand';
import { STORAGE_KEYS, readJson, writeJson } from '@/lib/storage';
import { FX_DEFAULTS, VISUAL_PRESET_SCHEMA, type FxArchiveSlot, type FxState } from '@/types/fx';

/**
 * 视觉控制台状态。
 *
 * 原版把 ~190 个参数直接放在 window.fx 上，改动后防抖写
 * mineradio-current-fx-autosave-v1，另外有 13 个「用户存档」槽写
 * mineradio-user-fx-archives-v1。这里保留同样的两层结构：
 * 实时参数（autosave）与命名存档（archives）互不覆盖。
 */

const ARCHIVE_MAX = 13;

function readAutosave(): FxState {
  const saved = readJson<{ snapshot?: Partial<FxState> } | null>(STORAGE_KEYS.currentFxAutosave, null);
  return { ...FX_DEFAULTS, ...(saved?.snapshot ?? {}) };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutosave(fx: FxState, reason: string): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    writeJson(STORAGE_KEYS.currentFxAutosave, {
      currentAutosaveSchema: 'current-fx-autosave-v2',
      autosavedAt: Date.now(),
      autosaveReason: reason,
      snapshot: fx,
    });
  }, 420);
}

interface FxStoreState {
  fx: FxState;
  archives: FxArchiveSlot[];
  /** 正在预览的存档下标，-1 表示实时参数 */
  previewSlot: number;

  setParam<K extends keyof FxState>(key: K, value: FxState[K]): void;
  patch(partial: Partial<FxState>, reason?: string): void;
  resetFx(): void;
  applyPresetIndex(index: number): void;
  saveArchive(name: string, slot?: number): void;
  applyArchive(slot: number): void;
  deleteArchive(slot: number): void;
  exportArchives(): string;
  importArchives(json: string): boolean;
}

export const useFxStore = create<FxStoreState>((set, get) => ({
  fx: readAutosave(),
  archives: readJson<FxArchiveSlot[]>(STORAGE_KEYS.userFxArchives, []),
  previewSlot: -1,

  setParam: (key, value) => {
    const fx = { ...get().fx, [key]: value };
    set({ fx, previewSlot: -1 });
    scheduleAutosave(fx, 'control');
  },

  patch: (partial, reason = 'preset') => {
    const fx = { ...get().fx, ...partial };
    set({ fx });
    scheduleAutosave(fx, reason);
  },

  resetFx: () => {
    set({ fx: { ...FX_DEFAULTS }, previewSlot: -1 });
    scheduleAutosave(FX_DEFAULTS, 'reset');
  },

  /** 预设只改 preset 与该项自带的关键参数，其余保持用户当前值 */
  applyPresetIndex: (index) => {
    const fx = { ...get().fx, preset: index };
    if (index === 0) Object.assign(fx, { intensity: 0.85, coverResolution: 1.55, cinemaShake: 0.5, lyricGlowStrength: 0.28 });
    if (index === 1) Object.assign(fx, { intensity: 0.9, twist: 0.35, speed: 1.15 });
    if (index === 2) Object.assign(fx, { intensity: 0.8, depth: 0.42, scatter: 0.18 });
    set({ fx });
    scheduleAutosave(fx, 'preset');
  },

  saveArchive: (name, slot) => {
    const trimmed = name.trim() || `存档 ${slot !== undefined ? slot + 1 : get().archives.length + 1}`;
    const snapshot = { ...get().fx, visualPresetSchema: VISUAL_PRESET_SCHEMA } as FxArchiveSlot['snapshot'];
    const now = Date.now();
    const archives = [...get().archives];

    if (slot !== undefined && slot >= 0 && slot < ARCHIVE_MAX) {
      archives[slot] = { name: trimmed, createdAt: archives[slot]?.createdAt ?? now, savedAt: now, snapshot };
    } else {
      if (archives.length >= ARCHIVE_MAX) return;
      archives.push({ name: trimmed, createdAt: now, savedAt: now, snapshot });
    }

    writeJson(STORAGE_KEYS.userFxArchives, archives);
    set({ archives });
  },

  applyArchive: (slot) => {
    const entry = get().archives[slot];
    if (!entry) return;
    const fx = { ...FX_DEFAULTS, ...entry.snapshot } as FxState;
    set({ fx, previewSlot: slot });
    scheduleAutosave(fx, 'archive');
  },

  deleteArchive: (slot) => {
    const archives = [...get().archives];
    archives.splice(slot, 1);
    writeJson(STORAGE_KEYS.userFxArchives, archives);
    set({ archives, previewSlot: -1 });
  },

  exportArchives: () => {
    const { fx, archives } = get();
    return JSON.stringify(
      { type: 'mineradio-user-fx-archive', schema: 1, exportedAt: Date.now(), archives, current: { name: '默认测试', snapshot: fx } },
      null,
      2,
    );
  },

  importArchives: (json) => {
    try {
      const parsed = JSON.parse(json) as { archives?: FxArchiveSlot[] };
      if (!Array.isArray(parsed.archives)) return false;
      const archives = parsed.archives.slice(0, ARCHIVE_MAX);
      writeJson(STORAGE_KEYS.userFxArchives, archives);
      set({ archives });
      return true;
    } catch {
      return false;
    }
  },
}));
