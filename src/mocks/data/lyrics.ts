import type { LyricLine } from '@/types/track';

/**
 * 歌词也是合成的：按曲目 id 生成稳定的行与时间轴。
 * 原版这里打的是 /api/lyric（网易云）与三个平台变体，返回多轨 LRC 文本。
 */

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const LINES = [
  '把音量拧到刚好能听见自己', '窗外的灯一格一格往后退', '我们都不擅长说再见',
  '所以交给一段副歌去说完', '低频在胸腔里找了个位置', '时间被拖成很长的鼓刷',
  '你在第二遍副歌里停下来', '说这里可以慢一点', '谁把混响开得这么深',
  '连呼吸都带了延迟', '我把这首歌留到很晚', '晚到足够假装明天不急',
  '重复的段落最像日常', '听的人各自换着地方', '若即若离的那一句',
  '藏在贝斯的缝里', '不必解释的部分', '就交给尾奏去处理',
];

const TRANS = [
  'Turn it down to exactly hear yourself', 'The lights outside slide back one by one',
  'None of us are good at saying goodbye', 'So we let a chorus finish it',
  'The low end found a spot in my chest', 'Time stretched into a long brush stroke',
];

export function lyricsFor(trackId: string, duration = 210): { lyric: string; tlyric: string } {
  const seed = hash(trackId);
  const count = Math.max(8, Math.min(LINES.length, Math.floor(duration / 11)));
  const step = Math.max(6, duration / (count + 2));

  const lyricLines: string[] = ['[00:00.00] 词：mock 生成 · 内容虚构', '[00:01.50] 曲：mock 生成'];
  const transLines: string[] = [];
  let t = 12;

  for (let i = 0; i < count; i++) {
    const line = LINES[(seed + i * 7) % LINES.length]!;
    const stamp = fmt(t);
    lyricLines.push(`[${stamp}]${line}`);
    if (i % 2 === 0) {
      transLines.push(`[${stamp}]${TRANS[(seed + i * 3) % TRANS.length]!}`);
    }
    t += step * (0.75 + (((seed >> (i % 12)) & 7) / 16));
  }

  lyricLines.push(`[${fmt(t + step)}]`);
  return { lyric: lyricLines.join('\n'), tlyric: transLines.join('\n') };
}

function fmt(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(2).padStart(5, '0')}`;
}

/** 自定义歌词（原版 #custom-lyric-modal，存 mineradio-custom-lyrics-v1）复用同一套解析 */
export function parseCustomLyric(raw: string): LyricLine[] {
  const out: LyricLine[] = [];
  const re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  for (const line of raw.split(/\r?\n/)) {
    const stamps: number[] = [];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      stamps.push(Number(m[1]) * 60 + Number(m[2]) + Number((m[3] ?? '').padEnd(3, '0').slice(0, 3)) / 1000);
    }
    if (!stamps.length) continue;
    const text = line.replace(re, '').trim();
    if (!text) continue;
    for (const t of stamps) out.push({ time: t, text });
  }
  return out.sort((a, b) => a.time - b.time);
}
