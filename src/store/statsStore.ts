import { create } from 'zustand';
import { STORAGE_KEYS, readJson, writeJson } from '@/lib/storage';
import { formatDateStamp } from '@/lib/format';
import { queueItemKey, type Provider, type Track } from '@/types/track';

/**
 * 听歌画像。数据结构照搬 05-playback/02-listen-stats.js：
 *
 *   mineradio-listen-stats-v1
 *     { history: [≤180 条], songs: {key:{plays,listenMs,completed,lastPlayedAt}}, artists: {...}, updatedAt }
 *   mineradio-listen-rollup-v2
 *     { version:2, totalListenMs, sessions, daily:{'YYYY-MM-DD':{listenMs,sessions,completed}}, updatedAt }
 *
 * 有效收听的判定也保留原规则：完播，或听满 45s，或进度过半
 * （没有时长信息时门槛降为 30s）。
 */

export interface SongStat {
  key: string;
  name: string;
  artist: string;
  cover?: string;
  source: Provider;
  plays: number;
  listenMs: number;
  completed: boolean;
  lastPlayedAt: number;
}

export interface ArtistStat {
  name: string;
  plays: number;
  listenMs: number;
  lastPlayedAt: number;
}

interface HistoryRecord {
  key: string;
  name: string;
  artist: string;
  source: Provider;
  playedAt: number;
  listenMs: number;
  completed: boolean;
  context: string;
}

interface StatsShape {
  history: HistoryRecord[];
  songs: Record<string, SongStat>;
  artists: Record<string, ArtistStat>;
  updatedAt: number;
}

interface RollupShape {
  version: 2;
  totalListenMs: number;
  sessions: number;
  daily: Record<string, { listenMs: number; sessions: number; completed: number }>;
  updatedAt: number;
}

const EMPTY: StatsShape = { history: [], songs: {}, artists: {}, updatedAt: 0 };
const EMPTY_ROLLUP: RollupShape = { version: 2, totalListenMs: 0, sessions: 0, daily: {}, updatedAt: 0 };

/** 原版按 ' , 、 &' 拆分多个艺人名 */
function splitArtists(artist: string | undefined): string[] {
  return (artist ?? '')
    .split(/[,、&\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface StatsState {
  stats: StatsShape;
  rollup: RollupShape;
  /** 本次会话内累计、尚未落盘的毫秒 */
  pendingMs: number;

  record(ms: number): void;
  flush(song: Track, completed: boolean): void;
  topSongs(n?: number): SongStat[];
  topArtists(n?: number): ArtistStat[];
  weekDaily(): { date: string; listenMs: number; sessions: number }[];
  reset(): void;
}

export const useStatsStore = create<StatsState>((set, get) => ({
  stats: readJson<StatsShape>(STORAGE_KEYS.listenStats, EMPTY),
  rollup: readJson<RollupShape>(STORAGE_KEYS.listenRollup, EMPTY_ROLLUP),
  pendingMs: 0,

  record: (ms) => {
    if (ms <= 0) return;
    set((s) => ({ pendingMs: s.pendingMs + Math.min(4200, ms) }));
  },

  flush: (song, completed) => {
    const { pendingMs, stats, rollup } = get();
    set({ pendingMs: 0 });
    if (pendingMs <= 0) return;

    const duration = song.duration ?? 0;
    /* 原版 effective 规则：完播 / 满 45s / 进度过半（无时长时门槛 30s） */
    const effective =
      completed || pendingMs >= (duration ? 45000 : 30000) || (duration > 0 && pendingMs / 1000 / duration >= 0.5);
    const key = queueItemKey(song);
    const prevSong = stats.songs[key];
    const now = Date.now();
    const listenMs = (prevSong?.listenMs ?? 0) + pendingMs;

    const songs: Record<string, SongStat> = {
      ...stats.songs,
      [key]: {
        key,
        name: song.name,
        artist: song.artist ?? '',
        cover: song.cover,
        source: song.provider,
        plays: (prevSong?.plays ?? 0) + 1,
        listenMs,
        completed: Boolean(prevSong?.completed) || effective,
        lastPlayedAt: now,
      },
    };

    const artists = { ...stats.artists };
    for (const name of splitArtists(song.artist)) {
      const a = artists[name];
      artists[name] = {
        name,
        plays: (a?.plays ?? 0) + 1,
        listenMs: (a?.listenMs ?? 0) + pendingMs,
        lastPlayedAt: now,
      };
    }

    const history: HistoryRecord[] = [
      { key, name: song.name, artist: song.artist ?? '', source: song.provider, playedAt: now, listenMs: pendingMs, completed: effective, context: 'queue' },
      ...stats.history,
    ].slice(0, 180);

    const today = formatDateStamp();
    const day = rollup.daily[today] ?? { listenMs: 0, sessions: 0, completed: 0 };
    const nextRollup: RollupShape = {
      version: 2,
      totalListenMs: rollup.totalListenMs + pendingMs,
      sessions: rollup.sessions + (effective ? 1 : 0),
      daily: {
        ...rollup.daily,
        [today]: { listenMs: day.listenMs + pendingMs, sessions: day.sessions + (effective ? 1 : 0), completed: day.completed + (effective ? 1 : 0) },
      },
      updatedAt: now,
    };

    const nextStats: StatsShape = { history, songs, artists, updatedAt: now };
    writeJson(STORAGE_KEYS.listenStats, nextStats);
    writeJson(STORAGE_KEYS.listenRollup, nextRollup);
    set({ stats: nextStats, rollup: nextRollup, pendingMs: 0 });
  },

  topSongs: (n = 10) => Object.values(get().stats.songs).sort((a, b) => b.listenMs - a.listenMs).slice(0, n),
  topArtists: (n = 8) => Object.values(get().stats.artists).sort((a, b) => b.listenMs - a.listenMs).slice(0, n),

  weekDaily: () => {
    const out: { date: string; listenMs: number; sessions: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const key = formatDateStamp(d);
      const row = get().rollup.daily[key] ?? { listenMs: 0, sessions: 0, completed: 0 };
      out.push({ date: key, listenMs: row.listenMs, sessions: row.sessions });
    }
    return out;
  },

  reset: () => {
    writeJson(STORAGE_KEYS.listenStats, EMPTY);
    writeJson(STORAGE_KEYS.listenRollup, EMPTY_ROLLUP);
    set({ stats: EMPTY, rollup: EMPTY_ROLLUP, pendingMs: 0 });
  },
}));
