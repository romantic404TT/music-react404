import type { Track } from '@/types/track';
import { rememberedDuration } from '@/lib/localDurations';
import { makeCover } from './cover';
import { LOCAL_TRACK_DEFS, type LocalTrackDef } from './local-tracks.generated';

/**
 * 用户自己提供的本地曲目。
 *
 * 与合成曲库的区别：音频走 public/music 下的真实文件（同源，浏览器能解码，
 * AnalyserNode 读到的就是真音乐），歌词是真实 .lrc 原文，封面是用户放进
 * 歌曲文件夹的那张图。
 *
 * 这一层只负责把生成的清单变成 Track 对象；清单本身由脚本扫描 ../music 得到，
 * 加歌不需要改任何代码：
 *   npm run music:sync   （../music/<歌名>/ 放 音频 + .lrc + 一张图片）
 * 然后重启 dev server —— 清单是构建期产物，热更新不会重新读目录。
 */

export type { LocalTrackDef };
export { LOCAL_TRACK_DEFS };

export const LOCAL_TRACKS: Track[] = LOCAL_TRACK_DEFS.map((d) => {
  const duration = rememberedDuration(`local-${d.slug}`);
  return {
    provider: 'local',
    source: 'local',
    type: 'local',
    id: `local-${d.slug}`,
    name: d.title,
    artist: d.artist,
    artists: [{ id: `local-artist-${d.slug}`, name: d.artist }],
    album: d.album,
    /* 有真图用真图，没有才退回按标题生成的渐变封面 */
    cover: d.coverUrl ?? makeCover(d.slug, d.title),
    coverFile: d.coverUrl ?? undefined,
    duration,
    durationMs: duration * 1000,
    localKey: d.slug,
    localUrl: d.audioUrl,
    localPath: d.audioUrl,
    playable: true,
    fee: 0,
  };
});

export function findLocalTrack(id: string): LocalTrackDef | undefined {
  return LOCAL_TRACK_DEFS.find((d) => `local-${d.slug}` === id || d.slug === id);
}
