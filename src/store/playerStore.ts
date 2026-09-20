import { create } from 'zustand';
import { STORAGE_KEYS, readJson, writeJson } from '@/lib/storage';
import { queueItemKey, type PlayMode, type Track } from '@/types/track';
import { PLAY_MODE_ORDER } from '@/types/track';
import type { ResolvedSource } from '@/services/song';
import { resolveSongUrl } from '@/services/song';
import { useSettingsStore } from './settingsStore';
import { useStatsStore } from './statsStore';
import { useUiStore } from './uiStore';

/**
 * 播放队列与播放状态机。
 *
 * 对齐原版的几个真实行为，不是随手设计的：
 *   · 队列是 playQueue + currentIdx（-1 表示无当前曲），不是"当前歌曲"单值；
 *   · 切歌有 trackSwitchToken，晚到的异步结果必须作废，否则会停在旧歌；
 *   · 音源解析失败会自动跳到下一首（v1.0.0 更新日志：真正加载失败的队列项会自动跳到下一首）；
 *   · 队列写入后落 mineradio-last-playback-v1，最多存 120 条；
 *   · 播放模式不进 localStorage。
 */

const LAST_PLAYBACK_VERSION = 1;

interface LastPlayback {
  version: number;
  savedAt: number;
  reason: string;
  currentIdx: number;
  currentTime: number;
  duration: number;
  playing: false;
  current: Track | null;
  queue: Track[];
}

function shuffleIndices(n: number, from: number): number[] {
  const rest = Array.from({ length: n }, (_, i) => i).filter((i) => i !== from);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return [from, ...rest];
}

export interface PlayerState {
  queue: Track[];
  currentIdx: number;
  playing: boolean;
  position: number;
  duration: number;
  playMode: PlayMode;
  source: ResolvedSource | null;
  resolving: boolean;
  error: string | null;
  /** 切歌令牌：任何异步回写前都要比对，避免旧请求覆盖新歌 */
  switchToken: number;
  shuffleOrder: number[];
  queueLabel: string;

  current(): Track | null;
  setQueue(queue: Track[], startIndex?: number, label?: string, autoplay?: boolean): Promise<void>;
  playAt(index: number): Promise<void>;
  playSong(song: Track, contextQueue?: Track[], label?: string): Promise<void>;
  enqueueNext(song: Track): void;
  removeFromQueue(index: number): void;
  clearQueue(): void;
  toggle(): Promise<void>;
  next(byUser?: boolean): Promise<void>;
  prev(): Promise<void>;
  cyclePlayMode(): void;
  seek(seconds: number): void;
  setPosition(seconds: number): void;
  setPlaying(v: boolean): void;
  setDuration(v: number): void;
  stop(): void;
  restoreLast(): { queue: Track[]; currentIdx: number; currentTime: number } | null;
}

function persist(s: Pick<PlayerState, 'queue' | 'currentIdx' | 'position'>, playing: boolean): void {
  const current = s.currentIdx >= 0 ? s.queue[s.currentIdx] ?? null : null;
  const snapshot: LastPlayback = {
    version: LAST_PLAYBACK_VERSION,
    savedAt: Date.now(),
    reason: playing ? 'playing' : 'paused',
    currentIdx: s.currentIdx,
    currentTime: Math.floor(s.position),
    duration: current?.duration ?? 0,
    playing: false,
    current,
    queue: s.queue.slice(0, 120),
  };
  writeJson(STORAGE_KEYS.lastPlayback, snapshot);
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  currentIdx: -1,
  playing: false,
  position: 0,
  duration: 0,
  playMode: 'loop',
  source: null,
  resolving: false,
  error: null,
  switchToken: 0,
  shuffleOrder: [],
  queueLabel: '',

  current: () => {
    const s = get();
    return s.currentIdx >= 0 ? s.queue[s.currentIdx] ?? null : null;
  },

  setQueue: async (queue, startIndex = 0, label = '', autoplay = true) => {
    if (!queue.length) return;
    const idx = Math.max(0, Math.min(startIndex, queue.length - 1));
    set((s) => ({
      queue,
      currentIdx: idx,
      position: 0,
      duration: queue[idx]?.duration ?? 0,
      error: null,
      switchToken: s.switchToken + 1,
      shuffleOrder: s.playMode === 'shuffle' ? shuffleIndices(queue.length, idx) : [],
      queueLabel: label,
    }));
    if (autoplay) await get().playAt(idx);
    else persist(get(), false);
  },

  playAt: async (index) => {
    const song = get().queue[index];
    if (!song) return;

    const token = get().switchToken + 1;
    set({ switchToken: token, currentIdx: index, position: 0, duration: song.duration ?? 0, resolving: true, error: null });

    const quality = useSettingsStore.getState().qualityOf(song.provider);
    const res = await resolveSongUrl(song, quality).catch(() => null);

    /* 期间又切了歌：这次结果作废 */
    if (get().switchToken !== token) return;

    if (!res || !res.url || res.playable === false) {
      const reason = res?.message ?? '音源解析失败';
      set({ resolving: false, source: null, playing: false });
      useUiStore.getState().pushToast(`${song.name} · ${reason}`, 'warn');
      /* 自动跳到下一首，和原版一致；整队列都失败时停住，避免无限递归 */
      const { queue, currentIdx } = get();
      const remaining = queue.filter((_, i) => i !== currentIdx && queueItemKey(_) !== queueItemKey(song));
      if (remaining.length > 0 && currentIdx + 1 < queue.length) {
        await get().playAt(currentIdx + 1);
      }
      return;
    }

    set({ resolving: false, source: res, playing: true });
    if (res.resolvedProvider && res.resolvedProvider !== song.provider) {
      useUiStore.getState().pushToast(`该音源无版权，已切换到 ${res.resolvedProvider} 同曲版本`, 'info');
    }
    persist(get(), true);
  },

  playSong: async (song, contextQueue, label) => {
    const queue = contextQueue?.length ? contextQueue : [song];
    const idx = Math.max(0, queue.findIndex((t) => queueItemKey(t) === queueItemKey(song)));
    await get().setQueue(queue, idx === -1 ? 0 : idx, label ?? '单曲播放');
  },

  enqueueNext: (song) => {
    const s = get();
    const queue = [...s.queue];
    queue.splice(s.currentIdx + 1, 0, song);
    set({ queue });
    persist(get(), s.playing);
  },

  removeFromQueue: (index) => {
    const s = get();
    if (index < 0 || index >= s.queue.length) return;
    const queue = s.queue.filter((_, i) => i !== index);
    const currentIdx = index < s.currentIdx ? s.currentIdx - 1 : Math.min(index, queue.length - 1);
    set({ queue, currentIdx: queue.length ? currentIdx : -1 });
    if (!queue.length) {
      set({ playing: false, source: null, position: 0 });
      return;
    }
    persist(get(), s.playing);
  },

  clearQueue: () => {
    set({ queue: [], currentIdx: -1, playing: false, source: null, position: 0, duration: 0, shuffleOrder: [] });
  },

  toggle: async () => {
    const s = get();
    if (s.currentIdx < 0) {
      if (s.queue.length) await s.playAt(0);
      return;
    }
    if (s.playing) set({ playing: false });
    else if (s.source?.url) set({ playing: true });
    else await s.playAt(s.currentIdx);
    persist(get(), get().playing);
  },

  next: async (byUser = false) => {
    const s = get();
    if (!s.queue.length) return;

    if (s.playMode === 'single' && !byUser) {
      set({ position: 0 });
      return;
    }

    let target: number;
    if (s.playMode === 'shuffle') {
      const order = s.shuffleOrder.length === s.queue.length ? s.shuffleOrder : shuffleIndices(s.queue.length, s.currentIdx);
      if (s.shuffleOrder.length !== s.queue.length) set({ shuffleOrder: order });
      const pos = order.indexOf(s.currentIdx);
      target = order[(pos + 1) % order.length] ?? 0;
    } else {
      target = (s.currentIdx + 1) % s.queue.length;
    }
    await get().playAt(target);
  },

  prev: async () => {
    const s = get();
    if (!s.queue.length) return;
    /* 前 3 秒内按"上一首"才算回退，否则重播当前 —— 各大播放器的通用语义 */
    if (s.position > 3) {
      set({ position: 0 });
      return;
    }
    let target: number;
    if (s.playMode === 'shuffle') {
      const order = s.shuffleOrder.length ? s.shuffleOrder : shuffleIndices(s.queue.length, s.currentIdx);
      const pos = Math.max(0, order.indexOf(s.currentIdx));
      target = order[(pos - 1 + order.length) % order.length] ?? 0;
    } else {
      target = (s.currentIdx - 1 + s.queue.length) % s.queue.length;
    }
    await get().playAt(target);
  },

  cyclePlayMode: () => {
    const cur = get().playMode;
    const next = PLAY_MODE_ORDER[(PLAY_MODE_ORDER.indexOf(cur) + 1) % PLAY_MODE_ORDER.length]!;
    const s = get();
    set({
      playMode: next,
      shuffleOrder: next === 'shuffle' ? shuffleIndices(s.queue.length, s.currentIdx) : [],
    });
    useUiStore.getState().pushToast(
      next === 'loop' ? '顺序循环' : next === 'shuffle' ? '随机播放' : '单曲循环',
      'info',
    );
  },

  seek: (seconds) => {
    const s = get();
    const dur = s.duration || s.current()?.duration || 0;
    set({ position: Math.max(0, Math.min(dur || seconds, seconds)) });
    persist(get(), s.playing);
  },

  setPosition: (seconds) => set({ position: seconds }),
  setPlaying: (v) => set({ playing: v }),
  setDuration: (v) => {
    if (v && v > 0) set({ duration: v });
  },

  stop: () => {
    set({ playing: false, source: null, position: 0 });
    persist(get(), false);
  },

  restoreLast: () => {
    const snap = readJson<LastPlayback | null>(STORAGE_KEYS.lastPlayback, null);
    if (!snap || snap.version !== LAST_PLAYBACK_VERSION || !snap.queue?.length) return null;
    set({
      queue: snap.queue,
      currentIdx: Math.max(0, Math.min(snap.currentIdx, snap.queue.length - 1)),
      position: snap.currentTime ?? 0,
      duration: snap.duration || snap.queue[snap.currentIdx]?.duration || 0,
      queueLabel: '上次播放',
    });
    return { queue: snap.queue, currentIdx: snap.currentIdx, currentTime: snap.currentTime ?? 0 };
  },
}));

/** 由 useAudioEngine 周期调用，把收听时长累进画像 */
export function commitListenTick(ms: number): void {
  if (ms <= 0) return;
  useStatsStore.getState().record(ms);
}

/** 切歌 / 暂停时落一次画像 */
export function commitListenFlush(completed: boolean): void {
  const song = usePlayerStore.getState().current();
  if (!song) return;
  useStatsStore.getState().flush(song, completed);
}
