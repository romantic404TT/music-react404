/**
 * 由 scripts/sync-music.mjs 生成，别手改。
 * 加歌：往 ../music/<歌名>/ 放音频 + lrc + 一张图片，然后 npm run music:sync。
 * 想改标题/艺人，在该文件夹里放 meta.json：{ "title": "", "artist": "", "album": "" }
 */

export interface LocalTrackDef {
  slug: string;
  title: string;
  artist: string;
  album: string;
  /** public/music 下的真实音频 */
  audioUrl: string;
  /** 歌词原文由 mock 在运行时按这个 URL 取，构建期不内联 */
  lyricUrl: string | null;
  /** 用户放进文件夹的图片；没有则为 null，界面退回生成的渐变封面 */
  coverUrl: string | null;
}

export const LOCAL_TRACK_DEFS: LocalTrackDef[] = [
  {
    "slug": "Beauty And A Beat",
    "title": "Beauty And A Beat",
    "artist": "Justin Bieber / N",
    "album": "本地音乐",
    "audioUrl": "/music/Beauty%20And%20A%20Beat/track.mp3",
    "lyricUrl": "/music/Beauty%20And%20A%20Beat/track.lrc",
    "coverUrl": "/music/Beauty%20And%20A%20Beat/cover.jpg"
  },
  {
    "slug": "STAY",
    "title": "STAY (Explicit)",
    "artist": "The Kid LAROI / Jus",
    "album": "本地音乐",
    "audioUrl": "/music/STAY/track.mp3",
    "lyricUrl": "/music/STAY/track.lrc",
    "coverUrl": "/music/STAY/cover.jpg"
  },
  {
    "slug": "love song",
    "title": "Love Song",
    "artist": "方大同",
    "album": "本地音乐",
    "audioUrl": "/music/love%20song/track.mp3",
    "lyricUrl": "/music/love%20song/track.lrc",
    "coverUrl": "/music/love%20song/cover.jpg"
  },
  {
    "slug": "sorry",
    "title": "Sorry",
    "artist": "Justin Bieber",
    "album": "本地音乐",
    "audioUrl": "/music/sorry/track.mp3",
    "lyricUrl": "/music/sorry/track.lrc",
    "coverUrl": "/music/sorry/cover.jpg"
  },
  {
    "slug": "三人游",
    "title": "三人游",
    "artist": "方大同",
    "album": "本地音乐",
    "audioUrl": "/music/%E4%B8%89%E4%BA%BA%E6%B8%B8/track.mp3",
    "lyricUrl": "/music/%E4%B8%89%E4%BA%BA%E6%B8%B8/track.lrc",
    "coverUrl": "/music/%E4%B8%89%E4%BA%BA%E6%B8%B8/cover.jpg"
  },
  {
    "slug": "唯一",
    "title": "唯一",
    "artist": "王力宏",
    "album": "本地音乐",
    "audioUrl": "/music/%E5%94%AF%E4%B8%80/track.mp3",
    "lyricUrl": "/music/%E5%94%AF%E4%B8%80/track.lrc",
    "coverUrl": "/music/%E5%94%AF%E4%B8%80/cover.jpg"
  },
  {
    "slug": "四人游",
    "title": "四人游",
    "artist": "方大同 / 薛凯琪",
    "album": "本地音乐",
    "audioUrl": "/music/%E5%9B%9B%E4%BA%BA%E6%B8%B8/track.mp3",
    "lyricUrl": "/music/%E5%9B%9B%E4%BA%BA%E6%B8%B8/track.lrc",
    "coverUrl": "/music/%E5%9B%9B%E4%BA%BA%E6%B8%B8/cover.jpg"
  },
  {
    "slug": "好不容易",
    "title": "好不容易",
    "artist": "方大同",
    "album": "本地音乐",
    "audioUrl": "/music/%E5%A5%BD%E4%B8%8D%E5%AE%B9%E6%98%93/track.mp3",
    "lyricUrl": "/music/%E5%A5%BD%E4%B8%8D%E5%AE%B9%E6%98%93/track.lrc",
    "coverUrl": "/music/%E5%A5%BD%E4%B8%8D%E5%AE%B9%E6%98%93/cover.jpg"
  },
  {
    "slug": "才二十三",
    "title": "才二十三",
    "artist": "方大同",
    "album": "本地音乐",
    "audioUrl": "/music/%E6%89%8D%E4%BA%8C%E5%8D%81%E4%B8%89/track.mp3",
    "lyricUrl": "/music/%E6%89%8D%E4%BA%8C%E5%8D%81%E4%B8%89/track.lrc",
    "coverUrl": "/music/%E6%89%8D%E4%BA%8C%E5%8D%81%E4%B8%89/cover.jpg"
  },
  {
    "slug": "春风吹",
    "title": "春风吹",
    "artist": "方大同",
    "album": "本地音乐",
    "audioUrl": "/music/%E6%98%A5%E9%A3%8E%E5%90%B9/track.mp3",
    "lyricUrl": "/music/%E6%98%A5%E9%A3%8E%E5%90%B9/track.lrc",
    "coverUrl": "/music/%E6%98%A5%E9%A3%8E%E5%90%B9/cover.jpg"
  },
  {
    "slug": "爱爱爱",
    "title": "爱爱爱",
    "artist": "方大同",
    "album": "本地音乐",
    "audioUrl": "/music/%E7%88%B1%E7%88%B1%E7%88%B1/track.mp3",
    "lyricUrl": "/music/%E7%88%B1%E7%88%B1%E7%88%B1/track.lrc",
    "coverUrl": "/music/%E7%88%B1%E7%88%B1%E7%88%B1/cover.jpg"
  },
  {
    "slug": "特别的人",
    "title": "特别的人",
    "artist": "方大同",
    "album": "本地音乐",
    "audioUrl": "/music/%E7%89%B9%E5%88%AB%E7%9A%84%E4%BA%BA/track.mp3",
    "lyricUrl": "/music/%E7%89%B9%E5%88%AB%E7%9A%84%E4%BA%BA/track.lrc",
    "coverUrl": "/music/%E7%89%B9%E5%88%AB%E7%9A%84%E4%BA%BA/cover.jpg"
  },
  {
    "slug": "红豆",
    "title": "红豆",
    "artist": "方大同",
    "album": "本地音乐",
    "audioUrl": "/music/%E7%BA%A2%E8%B1%86/track.mp3",
    "lyricUrl": "/music/%E7%BA%A2%E8%B1%86/track.lrc",
    "coverUrl": "/music/%E7%BA%A2%E8%B1%86/cover.jpg"
  },
  {
    "slug": "花田错",
    "title": "花田错",
    "artist": "王力宏",
    "album": "本地音乐",
    "audioUrl": "/music/%E8%8A%B1%E7%94%B0%E9%94%99/track.mp3",
    "lyricUrl": "/music/%E8%8A%B1%E7%94%B0%E9%94%99/track.lrc",
    "coverUrl": null
  },
  {
    "slug": "麦恩莉",
    "title": "麦恩莉",
    "artist": "方大同",
    "album": "本地音乐",
    "audioUrl": "/music/%E9%BA%A6%E6%81%A9%E8%8E%89/track.mp3",
    "lyricUrl": "/music/%E9%BA%A6%E6%81%A9%E8%8E%89/track.lrc",
    "coverUrl": "/music/%E9%BA%A6%E6%81%A9%E8%8E%89/cover.jpg"
  }
];
