import type { Track } from '@/types/track';
import { makeCover } from './cover';
import beautyAndABeatLrc from '../../../public/music/beauty-and-a-beat/track.lrc?raw';

/**
 * 用户自己提供的本地曲目。
 *
 * 与合成曲库的区别：音频走 public/music/ 下的真实文件（同源，浏览器能解码，
 * AnalyserNode 读到的就是真音乐），歌词是真实 .lrc 原文。
 *
 * 加新歌的三步：
 *   1. 建 public/music/<slug>/，放 track.mp3 与 track.lrc
 *   2. 顶部加一行 `import xxxLrc from '../../../public/music/<slug>/track.lrc?raw'`
 *   3. 在 LOCAL_TRACK_DEFS 里加一条（duration 可先填近似值，播放时会以真实解码时长为准）
 */

export interface LocalTrackDef {
  slug: string;
  title: string;
  artist: string;
  album: string;
  /** 秒；实测值，见 README 的自测结果 */
  duration: number;
  audioUrl: string;
  lyric: string;
}

export const LOCAL_TRACK_DEFS: LocalTrackDef[] = [
  {
    slug: 'beauty-and-a-beat',
    title: 'Beauty And A Beat',
    artist: 'Justin Bieber',
    album: '本地音乐',
    duration: 228,
    audioUrl: '/music/beauty-and-a-beat/track.mp3',
    lyric: beautyAndABeatLrc,
  },
];

export const LOCAL_TRACKS: Track[] = LOCAL_TRACK_DEFS.map((d) => ({
  provider: 'local',
  source: 'local',
  type: 'local',
  id: `local-${d.slug}`,
  name: d.title,
  artist: d.artist,
  artists: [{ id: `local-artist-${d.slug}`, name: d.artist }],
  album: d.album,
  cover: makeCover(d.slug, d.title),
  duration: d.duration,
  durationMs: d.duration * 1000,
  localKey: d.slug,
  localUrl: d.audioUrl,
  localPath: d.audioUrl,
  playable: true,
  fee: 0,
}));

/** 按曲目 id 取真实歌词原文 */
export const LOCAL_LYRICS: Record<string, string> = Object.fromEntries(
  LOCAL_TRACK_DEFS.map((d) => [`local-${d.slug}`, d.lyric]),
);

export function findLocalTrack(id: string): LocalTrackDef | undefined {
  return LOCAL_TRACK_DEFS.find((d) => `local-${d.slug}` === id || d.slug === id);
}
