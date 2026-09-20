import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findActiveIndex, mergeTranslation, parseLrc } from '@/lib/lrc';
import { STORAGE_KEYS, readJson, writeJson } from '@/lib/storage';
import { fetchLyric } from '@/services/song';
import type { LyricLine, Track } from '@/types/track';
import { queueItemKey } from '@/types/track';

/** 原版歌词长按校准：±0.1s 步进，按曲目 key 存表，上限 500 条 */
const OFFSET_STORE = STORAGE_KEYS.lyricTimingOffsets;

function readOffsets(): Record<string, number> {
  const raw = readJson<{ items?: Record<string, number> }>(OFFSET_STORE, {});
  return raw.items ?? {};
}

export interface LyricsState {
  lines: LyricLine[];
  activeIdx: number;
  loading: boolean;
  error: string | null;
  offset: number;
  setOffset(delta: number): void;
  resetOffset(): void;
}

export function useLyrics(song: Track | null, position: number): LyricsState {
  const [raw, setRaw] = useState<{ lyric?: string; tlyric?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetsRef = useRef<Record<string, number>>(readOffsets());
  const [offset, setOffsetState] = useState(0);
  const tokenRef = useRef(0);

  const key = song ? queueItemKey(song) : '';

  useEffect(() => {
    if (!song) {
      setRaw(null);
      return;
    }
    const token = ++tokenRef.current;
    setLoading(true);
    setError(null);
    setOffsetState(offsetsRef.current[key] ?? 0);

    fetchLyric(song)
      .then((res) => {
        if (token !== tokenRef.current) return;
        setRaw({ lyric: res.lyric, tlyric: res.tlyric });
      })
      .catch(() => {
        if (token !== tokenRef.current) return;
        setError('歌词获取失败');
        setRaw(null);
      })
      .finally(() => {
        if (token === tokenRef.current) setLoading(false);
      });
  }, [song, key]);

  const lines = useMemo(() => {
    if (!raw?.lyric) return [];
    const base = mergeTranslation(parseLrc(raw.lyric), raw.tlyric);
    const o = offsetsRef.current[key] ?? 0;
    return o ? base.map((l) => ({ ...l, time: Math.max(0, l.time + o) })) : base;
  }, [raw, key]);

  const activeIdx = useMemo(() => findActiveIndex(lines, position), [lines, position]);

  const persist = useCallback(
    (next: number) => {
      offsetsRef.current = { ...offsetsRef.current, [key]: next };
      const items = Object.fromEntries(Object.entries(offsetsRef.current).slice(-500));
      writeJson(OFFSET_STORE, { version: 1, savedAt: Date.now(), items });
    },
    [key],
  );

  return {
    lines,
    activeIdx,
    loading,
    error,
    offset,
    setOffset: (delta) => {
      const next = Math.max(-30, Math.min(30, (offsetsRef.current[key] ?? 0) + delta));
      offsetsRef.current = { ...offsetsRef.current, [key]: next };
      setOffsetState(next);
      persist(next);
    },
    resetOffset: () => {
      offsetsRef.current = { ...offsetsRef.current, [key]: 0 };
      setOffsetState(0);
      persist(0);
    },
  };
}
