import type { LyricLine } from '@/types/track';

/**
 * LRC 解析。原版 06-lyrics/00-lyrics-fetch-parse.js 要同时吃
 * lyric / tlyric / yrc / romalrc 四条轨，这里保留同一套时间轴合并思路。
 */

const TIME_TAG = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

function toSeconds(min: string, sec: string, frac: string | undefined): number {
  const ms = frac ? Number(frac.padEnd(3, '0').slice(0, 3)) : 0;
  return Number(min) * 60 + Number(sec) + ms / 1000;
}

export function parseLrc(raw: string | undefined | null): LyricLine[] {
  if (!raw) return [];
  const out: LyricLine[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    TIME_TAG.lastIndex = 0;
    const stamps: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = TIME_TAG.exec(trimmed)) !== null) {
      stamps.push(toSeconds(match[1], match[2], match[3]));
    }
    if (!stamps.length) continue;

    const text = trimmed.replace(TIME_TAG, '').trim();
    if (!text) continue;
    for (const time of stamps) out.push({ time, text });
  }

  return out.sort((a, b) => a.time - b.time);
}

/** 译文轨按最近时间贴到原文行上，容差 0.85s —— 原版同量级 */
export function mergeTranslation(main: LyricLine[], transRaw: string | undefined): LyricLine[] {
  const trans = parseLrc(transRaw);
  if (!trans.length || !main.length) return main;

  return main.map((line) => {
    let best: LyricLine | null = null;
    let bestGap = Number.POSITIVE_INFINITY;
    for (const t of trans) {
      const gap = Math.abs(t.time - line.time);
      if (gap < bestGap) {
        bestGap = gap;
        best = t;
      }
    }
    return best && bestGap <= 0.85 ? { ...line, trans: best.text } : line;
  });
}

/**
 * 歌词长按校准（原版 #lyric-timing-popover，步进 ±0.1s，存 mineradio-lyric-timing-offsets-v1）。
 * 偏移为正表示整条轨延后出现。
 */
export function applyTimingOffset(lines: LyricLine[], offsetSeconds: number): LyricLine[] {
  if (!offsetSeconds) return lines;
  return lines.map((l) => ({ ...l, time: Math.max(0, l.time + offsetSeconds) }));
}

export function findActiveIndex(lines: LyricLine[], position: number): number {
  if (!lines.length) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= position) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
