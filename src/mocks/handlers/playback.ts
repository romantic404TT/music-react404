import type { Provider, QualityLevel, Track } from '@/types/track';
import { DEFAULT_QUALITY, qualityLabel } from '@/types/track';
import type { RequestHandler } from 'msw';
import { getWavBytes } from '../audio/synth';
import { ALL_TRACKS, findTrack, searchTracks } from '../data/catalog';
import { session } from '../session';
import { http, HttpResponse, NET } from './util';

/**
 * 播放地址与音频代理。
 *
 * 这块是原版逻辑最密的地方（server.js:4096-4151 / :6062 及各平台变体）：
 * 一次 /api/song/url 可能返回
 *   ① 成功：url + playable + level/quality/br + probe* 探测证据；
 *   ② 权益不足：url:null + reason + restriction + fee，前端据此发起跨平台同曲回退；
 *   ③ 回退命中：在原字段上追加 sourceMatch / matchKind / matchedSong / matchScore。
 * mock 把三条分支都做出来，否则「无音源时换源」这个真实行为演示不到。
 */

const BR_BY_QUALITY: Record<QualityLevel, number> = {
  jymaster: 192,
  hires: 999,
  lossless: 320,
  exhigh: 320,
  standard: 128,
};

function requestedQuality(p: Provider, raw: string | null): QualityLevel {
  const wanted = (raw ?? DEFAULT_QUALITY[p]) as QualityLevel;
  const allowed: Partial<Record<Provider, QualityLevel[]>> = {
    netease: ['jymaster', 'hires', 'lossless', 'exhigh', 'standard'],
    qq: ['hires', 'lossless', 'exhigh', 'standard'],
    kugou: ['hires', 'lossless', 'exhigh', 'standard'],
    qishui: ['standard'],
    spotify: ['standard'],
  };
  const list = allowed[p] ?? ['standard'];
  if (list.includes(wanted)) return wanted;
  // 平台不支持时按档位从高到低降一级，和原版的降级行为一致
  const ladder: QualityLevel[] = ['jymaster', 'hires', 'lossless', 'exhigh', 'standard'];
  const idx = ladder.indexOf(wanted);
  return list[idx + 1] ?? list[list.length - 1]!;
}

function resolveTrack(q: URLSearchParams): Track | undefined {
  const id = q.get('id') ?? q.get('mid') ?? q.get('hash') ?? q.get('trackId') ?? q.get('providerSongId') ?? '';
  if (!id) return undefined;
  return findTrack(id) ?? ALL_TRACKS.find((t) => t.name === q.get('name'));
}

/** excludeIds 是前端已试过的平台集合，用于同曲回退 */
function excluded(q: URLSearchParams): Set<string> {
  const raw = q.get('excludeIds') ?? '';
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

function findSameTrackAcrossProviders(song: Track, skip: Set<string>): Track | undefined {
  return searchTracks(song.provider, song.name, 24, 0)
    .concat(ALL_TRACKS)
    .find((t) => t.name === song.name && t.provider !== song.provider && !skip.has(t.provider));
}

function successPayload(song: Track, p: Provider, level: QualityLevel) {
  const seed = `${song.name}|${song.artist ?? ''}`;
  return {
    provider: p,
    source: song.source ?? p,
    url: `/api/audio?url=${encodeURIComponent(`mock:${p}:${song.id}`)}`,
    trial: false,
    playable: true,
    level,
    quality: qualityLabel(p, level),
    br: BR_BY_QUALITY[level],
    requestedQuality: level,
    /* 原版会先探测一次音源，把探测证据一起带回来 */
    probeStatus: 200,
    probeBytes: 1_048_576 * 4,
    probeMagic: 'RIFF',
    loggedIn: session.status(p).loggedIn,
    vipType: session.status(p).vipType ?? null,
    vipLevel: session.status(p).vipLevel ?? 0,
    isVip: session.status(p).isVip ?? false,
    isSvip: session.status(p).isSvip ?? false,
    vipLabel: session.status(p).vipLabel ?? null,
    seed,
  };
}

function deniedPayload(song: Track, p: Provider, reason: string, message: string) {
  return {
    provider: p,
    url: null,
    playable: false,
    trial: false,
    reason,
    message,
    restriction: song.restriction ?? 'VIP',
    lastCode: 403,
    fee: song.fee ?? 0,
    probeFailures: [{ stage: 'url-probe', reason }],
    loggedIn: session.status(p).loggedIn,
  };
}

/**
 * 单平台音源工厂。
 * 未登录且该曲需要权益 → 先给拒绝分支；前端带 skipDirect/excludeIds 时尝试同曲回退。
 */
function songUrlRoute(p: Provider, path: string): RequestHandler {
  return http.get(path, async ({ request }) => {
    await NET();
    const q = new URL(request.url).searchParams;
    const song = resolveTrack(q);
    const level = requestedQuality(p, q.get('quality'));

    if (!song) {
      return HttpResponse.json(
        { ...deniedPayload({ provider: p, id: '', name: '' } as Track, p, 'TRACK_NOT_FOUND', '未找到该曲目'), },
        { status: 200 },
      );
    }

    const needVip = (song.fee ?? 0) > 0 || q.get('needVip') === 'true' || q.get('vipRequired') === 'true';
    const loggedIn = session.status(p).loggedIn;

    if (!loggedIn && needVip) {
      const skip = excluded(q);
      const wantFallback = skip.size > 0 || q.get('skipDirect') === '1';
      if (wantFallback) {
        const match = findSameTrackAcrossProviders(song, skip);
        if (match && session.status(match.provider).loggedIn) {
          return HttpResponse.json({
            ...successPayload(match, match.provider, requestedQuality(match.provider, null)),
            provider: match.provider,
            source: `${match.provider}-same-track`,
            sourceMatch: true,
            matchKind: 'name',
            resolvedSongId: match.id,
            matchedSong: match,
            matchScore: 0.86,
            originalRestriction: 'VIP',
          });
        }
      }
      return HttpResponse.json(
        deniedPayload(song, p, 'NEED_VIP', `${qualityLabel(p, level)} 需要 ${p} 账号登录后播放`),
      );
    }

    /* 酷狗 / 汽水还要播放票据就绪才给地址 */
    if ((p === 'kugou' || p === 'qishui') && loggedIn && session.status(p).playbackKeyReady === false) {
      return HttpResponse.json(deniedPayload(song, p, 'PLAYBACK_KEY_MISSING', '播放票据未就绪，请重新登录该音源'));
    }

    return HttpResponse.json(successPayload(song, p, level));
  });
}

/**
 * /api/audio?url= —— 原版是带 Range 的流代理（server.js:6640）。
 * 这里回合成 WAV，同样支持 Range，好让 <audio> 的 seek 行为真实。
 */
const audioProxy = http.get('/api/audio', ({ request }) => {
  const url = new URL(request.url).searchParams.get('url') ?? '';
  const seed = url.startsWith('mock:') ? url.slice(5) : url || 'mineradio';
  const bytes = getWavBytes(seed);

  const range = request.headers.get('range');
  const headers = {
    'Accept-Ranges': 'bytes',
    'Content-Type': 'audio/wav',
    'Cache-Control': 'no-store',
  };

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m?.[1] ? Number(m[1]) : 0;
    const end = m?.[2] ? Math.min(Number(m[2]), bytes.length - 1) : bytes.length - 1;
    if (start < bytes.length && end >= start) {
      return new HttpResponse(bytes.slice(start, end + 1), {
        status: 206,
        headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}` },
      });
    }
    return new HttpResponse(null, { status: 416, headers });
  }

  return new HttpResponse(bytes, { status: 200, headers });
});

/** /api/cover?url= —— 原版抓远端封面并加 CORS 头；mock 的封面本就是 data URI，解码回传 */
const coverProxy = http.get('/api/cover', ({ request }) => {
  const url = new URL(request.url).searchParams.get('url') ?? '';
  if (url.startsWith('data:image/svg+xml,')) {
    const svg = decodeURIComponent(url.slice('data:image/svg+xml,'.length));
    return new HttpResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  }
  return new HttpResponse(null, { status: 404 });
});

/* ---------------- 红心 ---------------- */

const likeCheck = http.get('/api/song/like/check', ({ request }) => {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  return HttpResponse.json({ code: 200, isLike: session.liked.has(id) });
});

const likeToggle = http.get('/api/song/like', ({ request }) => {
  const q = new URL(request.url).searchParams;
  const id = q.get('id') ?? '';
  /* 真实平台用 like=true/false；缺省时按取反处理 */
  const raw = q.get('like');
  const add = raw === null ? !session.liked.has(id) : raw !== 'false';
  if (add) session.liked.add(id);
  else session.liked.delete(id);
  return HttpResponse.json({ code: 200, liked: add, message: add ? '已红心' : '已取消红心' });
});

const comments = http.get('/api/song/comments', async ({ request }) => {
  await NET();
  const q = new URL(request.url).searchParams;
  const id = q.get('id') ?? '';
  const n = 6;
  return HttpResponse.json({
    code: 200,
    data: {
      isAdd: false,
      total: 128,
      comments: Array.from({ length: n }, (_, i) => ({
        commentId: `${id}-c-${i}`,
        content: [
          '凌晨两点把这首歌放到第三遍，忽然就释怀了。',
          '副歌进来的那一下，房间里的灯都在呼吸。',
          '前奏一响，整个人被按回去年的雨季。',
          '推荐给失眠的人，低音很稳。',
          '歌词里那句"不必解释的部分"太准了。',
          '单曲循环第 47 次，还是会被最后那段打动人。',
        ][i]!,
        time: Date.now() - (i + 1) * 3_600_000 * 7,
        likedCount: 12 + i * 37,
        user: { userId: 900 + i, nickname: `听众 ${String(i + 1).padStart(2, '0')}`, avatarUrl: '' },
      })),
    },
  });
});

export const playbackHandlers: RequestHandler[] = [
  songUrlRoute('netease', '/api/song/url'),
  songUrlRoute('qq', '/api/qq/song/url'),
  songUrlRoute('kugou', '/api/kugou/song/url'),
  songUrlRoute('qishui', '/api/qishui/song/url'),
  audioProxy,
  coverProxy,
  likeCheck,
  likeToggle,
  comments,
];
