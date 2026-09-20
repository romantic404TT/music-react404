import type { Provider } from '@/types/track';
import type { RequestHandler } from 'msw';
import { CURRENT_VERSION, session } from '../session';
import { http, HttpResponse, NET } from './util';

/**
 * 账号 / 登录 / 平台能力 / 版本。
 *
 * 原版每个平台一套独立路由（/api/qq/login/status、/api/kugou/login/cookie …），
 * 这里用工厂按同一份实现生成，路径与真实后端保持一致。
 *
 * 扫码链路做成可推进的状态机：/api/login/qr/check 按票据存活时间依次返回
 * 801（等待扫码）→ 802（已扫码待确认）→ 803（成功并写登录态），
 * 于是"扫码登录"在纯前端也能完整走通。
 */

const LOGGED_IN_PROVIDERS: Provider[] = ['netease', 'qq', 'kugou', 'qishui'];

const CODE_MESSAGE: Record<number, string> = {
  800: '二维码已失效，请刷新',
  801: '等待扫码',
  802: '已扫码，请在手机上确认',
  803: '登录成功',
};

/** 造一张确定性的伪二维码图，避免引入 qrcode 依赖与外部资源 */
function fakeQrDataUri(payload: string): string {
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rnd = () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const N = 25;
  const cell = 12;
  const size = N * cell;
  let rects = '';
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const finder = (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7);
      if (finder) continue;
      if (rnd() > 0.52) rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}"/>`;
    }
  }
  const eye = (ox: number, oy: number) =>
    `<g><rect x="${ox}" y="${oy}" width="${cell * 7}" height="${cell * 7}" fill="#fff"/>` +
    `<rect x="${ox + cell}" y="${oy + cell}" width="${cell * 5}" height="${cell * 5}"/>` +
    `<rect x="${ox + cell * 2}" y="${oy + cell * 2}" width="${cell * 3}" height="${cell * 3}" fill="#fff"/>` +
    `<rect x="${ox + cell * 2.5}" y="${oy + cell * 2.5}" width="${cell * 2}" height="${cell * 2}"/></g>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${rects}</g>` +
    eye(0, 0) + eye((N - 7) * cell, 0) + eye(0, (N - 7) * cell) +
    '</svg>';

  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

const loginStatus = (p: Provider) => http.get(`${sessionPrefix(p)}/login/status`, async () => {
  await NET();
  return HttpResponse.json(session.status(p));
});

const cookieLogin = (p: Provider) => http.post(`${sessionPrefix(p)}/login/cookie`, async ({ request }) => {
  await NET();
  const body = (await request.json().catch(() => ({}))) as { cookie?: string };
  if (!body.cookie || body.cookie.trim().length < 8) {
    return HttpResponse.json(
      { ok: false, loggedIn: false, error: 'COOKIE_INVALID', message: 'Cookie 过短或为空' },
      { status: 400 },
    );
  }
  session.setLoggedIn(p, true);
  return HttpResponse.json({ ok: true, ...session.status(p) });
});

const logout = (p: Provider) => http.get(`${sessionPrefix(p)}/logout`, async () => {
  await NET();
  session.setLoggedIn(p, false);
  return HttpResponse.json({ ok: true, loggedIn: false });
});

function sessionPrefix(p: Provider): string {
  return p === 'netease' ? '/api' : `/api/${p}`;
}

const qrKey = http.get('/api/login/qr/key', ({ request }) => {
  const url = new URL(request.url);
  const provider = (url.searchParams.get('provider') ?? 'netease') as Provider;
  const key = `qr-${Math.random().toString(36).slice(2, 12)}`;
  session.qrKeys.set(key, { provider, created: Date.now() });
  return HttpResponse.json({ key });
});

const qrCreate = http.get('/api/login/qr/create', ({ request }) => {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') ?? '';
  const provider = session.qrKeys.get(key)?.provider ?? 'netease';
  const target = `https://music.${provider}.example/login/qr?key=${key}&check_token=${key.slice(0, 8)}`;
  return HttpResponse.json({ img: fakeQrDataUri(target), url: target });
});

const qrCheck = http.get('/api/login/qr/check', async ({ request }) => {
  await NET();
  const url = new URL(request.url);
  const key = url.searchParams.get('key') ?? '';
  const entry = session.qrKeys.get(key);

  if (!entry) {
    return HttpResponse.json({ code: 800, message: CODE_MESSAGE[800], hasCookie: false });
  }

  const age = Date.now() - entry.created;
  if (age > 180_000) {
    session.qrKeys.delete(key);
    return HttpResponse.json({ code: 800, message: CODE_MESSAGE[800], hasCookie: false });
  }
  if (age < 2600) {
    return HttpResponse.json({ code: 801, message: CODE_MESSAGE[801], hasCookie: false });
  }
  if (age < 5600) {
    return HttpResponse.json({ code: 802, message: CODE_MESSAGE[802], hasCookie: false });
  }

  session.setLoggedIn(entry.provider, true);
  session.qrKeys.delete(key);
  const status = session.status(entry.provider);
  return HttpResponse.json({
    code: 803,
    message: CODE_MESSAGE[803],
    hasCookie: true,
    nickname: status.nickname,
    avatar: status.avatar,
    loginInfo: { userId: status.userId, vipType: status.vipType, vipLabel: status.vipLabel },
    cookie: `MUSIC_U=mock-${entry.provider}-${key}`,
  });
});

/* 汽水走自己那套 token 轮询（server.js:5266 / :5291） */
const qishuiQr = http.get('/api/qishui/login/qrcode', async () => {
  await NET();
  const token = `qs-${Math.random().toString(36).slice(2, 12)}`;
  session.qrKeys.set(token, { provider: 'qishui', created: Date.now() });
  return HttpResponse.json({ ok: true, token, qrcodeImg: fakeQrDataUri(`qishui://login/${token}`) });
});

const qishuiCheck = http.get('/api/qishui/login/check', async ({ request }) => {
  await NET();
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const entry = session.qrKeys.get(token);
  if (!entry) return HttpResponse.json({ ok: false, status: 'expired' });

  const age = Date.now() - entry.created;
  if (age < 3200) return HttpResponse.json({ ok: false, status: 'waiting' });
  if (age < 6200) return HttpResponse.json({ ok: false, status: 'scanned' });

  session.setLoggedIn('qishui', true);
  session.qrKeys.delete(token);
  return HttpResponse.json({ ok: true, status: 'confirmed', ...session.status('qishui') });
});

const capabilities = http.get('/api/platform/capabilities', async () => {
  await NET();
  return HttpResponse.json({
    ok: true,
    platforms: {
      netease: { enabled: true },
      qq: { enabled: true },
      kugou: { enabled: true },
      qishui: { enabled: true },
      /* server.js:4640 的既有状态，不粉饰 */
      spotify: { enabled: false, removed: true, reason: 'PROVIDER_REMOVED' },
    },
  });
});

const appVersion = http.get('/api/app/version', async () => {
  await NET();
  return HttpResponse.json({ ok: true, version: CURRENT_VERSION, name: 'Mineradio' });
});

const updateLatest = http.get('/api/update/latest', async () => {
  await NET();
  return HttpResponse.json({
    ok: true,
    hasUpdate: false,
    currentVersion: CURRENT_VERSION,
    latestVersion: CURRENT_VERSION,
    releaseUrl: 'https://github.com/XxHuberrr/Mineradio/releases/tag/v2.2.0',
    body: [
      '- 修复音乐接口的登录、账号识别与播放稳定性问题。',
      '- 改善歌单加载、搜索分页，以及网络异常后的恢复。',
      '- 新增粒子预设与更多手势操作，改善日常播放体验。',
    ].join('\n'),
    downloadPages: [
      { label: '夸克盘', url: 'https://pan.quark.cn/s/4b124d3e81d3' },
      { label: '百度云', url: 'https://pan.baidu.com/s/17CwpHUza67w_Grgc3s5nOw?pwd=SJHP' },
    ],
  });
});

/** 2.0.3+ 不在应用内下载安装包：原版直接 410，这里照抄 */
const updateExternalOnly = ['download', 'download/status', 'patch', 'patch/status'].map((suffix) =>
  http.get(`/api/update/${suffix}`, () =>
    HttpResponse.json({ ok: false, externalOnly: true, error: 'UPDATE_EXTERNAL_ONLY' }, { status: 410 }),
  ),
);

/** Spotify 已被短路成 404（原版行为；前端仍在调用，所以 mock 也要接住） */
const spotifyRemoved = http.get('/api/spotify/*', () =>
  HttpResponse.json({ ok: false, error: 'PROVIDER_REMOVED' }, { status: 404 }),
);

export const accountHandlers: RequestHandler[] = [
  ...LOGGED_IN_PROVIDERS.map(loginStatus),
  ...LOGGED_IN_PROVIDERS.map(cookieLogin),
  ...LOGGED_IN_PROVIDERS.map(logout),
  qrKey,
  qrCreate,
  qrCheck,
  qishuiQr,
  qishuiCheck,
  capabilities,
  appVersion,
  updateLatest,
  ...updateExternalOnly,
  spotifyRemoved,
];
