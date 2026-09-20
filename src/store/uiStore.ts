import { create } from 'zustand';
import { STORAGE_KEYS, readString, writeString } from '@/lib/storage';

/**
 * 界面开关层。
 *
 * 原版这些状态散在 DOM class 上（#fx-panel 的 show|peek|closing、
 * .modal-mask 的 show），这里收敛成显式布尔，class 由组件自己映射。
 * 保留的语义差别有两个：
 *   · 面板有 peek（贴边预览）与 open 两态，不只是开/关；
 *   · 沉浸式会记住退出前的 shelf/歌词/控制条状态（原版 immersiveState）。
 */

export type PanelTab = 'queue' | 'playlists' | 'podcasts';

export type ModalKind =
  | 'login'
  | 'user'
  | 'collect'
  | 'track-detail'
  | 'custom-lyric'
  | 'cover-crop'
  | 'update'
  | null;

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'ok' | 'warn' | 'error';
  /** 原版 #source-fallback-notice 之类的常驻提示用 sticky */
  sticky?: boolean;
}

export interface ImmersiveSnapshot {
  shelf: 'off' | 'side' | 'stage';
  shelfPinnedOpen: boolean;
  lyrics: boolean;
  controlsAutoHide: boolean;
}

interface UiState {
  splashActive: boolean;
  playlistPanel: 'closed' | 'peek' | 'open';
  fxPanel: 'closed' | 'open';
  fxPanelPinned: boolean;
  queueViewTab: PanelTab;
  miniQueueOpen: boolean;
  controlsVisible: boolean;
  controlsHovering: boolean;
  immersiveMode: boolean;
  immersiveSnapshot: ImmersiveSnapshot | null;
  modal: ModalKind;
  /** 弹窗要带的上下文（比如收藏到哪首歌） */
  modalPayload: unknown;
  toasts: Toast[];
  homeSuppressed: boolean;
  searchOpen: boolean;

  enterApp(): void;
  setPanel(state: 'closed' | 'peek' | 'open'): void;
  toggleFxPanel(open?: boolean): void;
  toggleFxPinned(): void;
  setQueueTab(tab: PanelTab): void;
  setMiniQueue(open: boolean): void;
  setControlsVisible(v: boolean): void;
  setControlsHovering(v: boolean): void;
  toggleImmersive(snapshot: ImmersiveSnapshot): void;
  openModal(kind: Exclude<ModalKind, null>, payload?: unknown): void;
  closeModal(): void;
  pushToast(text: string, tone?: Toast['tone'], sticky?: boolean): number;
  dismissToast(id: number): void;
  setHomeSuppressed(v: boolean): void;
  setSearchOpen(v: boolean): void;
}

let toastSeq = 0;

const initialTab = (): PanelTab => {
  const raw = readString(STORAGE_KEYS.playlistPanelTab, 'queue');
  return raw === 'playlists' || raw === 'podcasts' ? raw : 'queue';
};

export const useUiStore = create<UiState>((set, get) => ({
  splashActive: true,
  playlistPanel: 'closed',
  fxPanel: 'closed',
  fxPanelPinned: false,
  queueViewTab: initialTab(),
  miniQueueOpen: false,
  controlsVisible: false,
  controlsHovering: false,
  immersiveMode: false,
  immersiveSnapshot: null,
  modal: null,
  modalPayload: null,
  toasts: [],
  homeSuppressed: false,
  searchOpen: false,

  enterApp: () => set({ splashActive: false }),

  setPanel: (state) => set({ playlistPanel: state }),

  toggleFxPanel: (open) => set((s) => ({
    fxPanel: open === undefined
      ? s.fxPanel === 'closed' ? 'open' : 'closed'
      : open ? 'open' : 'closed',
  })),

  toggleFxPinned: () => set((s) => ({ fxPanelPinned: !s.fxPanelPinned })),

  setQueueTab: (tab) => {
    writeString(STORAGE_KEYS.playlistPanelTab, tab);
    set({ queueViewTab: tab });
  },

  setMiniQueue: (open) => set({ miniQueueOpen: open }),
  setControlsVisible: (v) => set({ controlsVisible: v }),
  setControlsHovering: (v) => set({ controlsHovering: v }),

  /**
   * 全沉浸式：进入前把当前视觉开关存下来，退出时由调用方回填，
   * 对应原版 immersiveState 的 {shelfMode, shelfPinnedOpen, lyrics, controlsAutoHide}。
   */
  toggleImmersive: (snapshot) => {
    if (get().immersiveMode) set({ immersiveMode: false, immersiveSnapshot: null });
    else set({ immersiveMode: true, immersiveSnapshot: snapshot });
  },

  openModal: (kind, payload = null) => set({ modal: kind, modalPayload: payload }),
  closeModal: () => set({ modal: null, modalPayload: null }),

  pushToast: (text, tone = 'info', sticky = false) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone, sticky }] }));
    if (!sticky) {
      setTimeout(() => get().dismissToast(id), tone === 'error' ? 4200 : 2600);
    }
    return id;
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setHomeSuppressed: (v) => set({ homeSuppressed: v }),
  setSearchOpen: (v) => set({ searchOpen: v }),
}));
