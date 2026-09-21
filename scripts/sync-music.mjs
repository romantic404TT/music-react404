import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 把 ../music/<歌名>/ 里的文件同步成本地曲库。
 *
 * 一个文件夹 = 一首歌：一个音频（mp3/m4a/flac…）、可选的一个 .lrc、可选的一张图片。
 * 图片优先叫 cover.*，否则取文件夹里第一张能显示的图。
 *
 * 产物两样：
 *   public/music/<歌名>/track.<ext> | track.lrc | cover.<ext>
 *   src/mocks/data/local-tracks.generated.ts
 *
 * 整个文件夹只增不删：源目录里没了一首歌，会在终端里报出来，但不动 public 下
 * 对应的文件夹，免得手滑把还在听的歌删掉。
 * 单个文件夹内部则是严格镜像：源里删了封面图，同步后 public 里那张也会清掉。
 */

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(PROJECT, process.argv[2] ?? '../music');
const PUBLIC_MUSIC = join(PROJECT, 'public/music');
const GENERATED = join(PROJECT, 'src/mocks/data/local-tracks.generated.ts');

const AUDIO_EXT = ['.mp3', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.wav'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.avif'];

const isType = (name, exts) => exts.includes(extname(name).toLowerCase());
const sortedFiles = (dir) => readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name).sort();

/** B 站转存的文件名长这样：`2.三人游 - 方大同(Av115089722117976,P2).mp3` */
function parseName(fileName, folder) {
  let s = fileName.slice(0, fileName.length - extname(fileName).length);
  s = s.replace(/\(Av\d+[0-9A-Za-z,._\-\s]*\)/gi, '');
  s = s.replace(/^\s*(?:\d+\s*[.\-_]\s*){1,3}/, '');
  /* 「12.12 王力宏」这种是 碟号+曲号，剥掉点号后还会剩个裸号 */
  s = s.replace(/^\s*\d{1,3}\s+(?=\D)/, '');
  s = s.replace(/\s+/g, ' ').trim();

  const cut = s.indexOf(' - ') >= 0 ? ' - ' : s.includes('-') ? '-' : s.includes('–') ? '–' : null;
  if (!cut) return { title: s || folder, artist: '' };
  const a = s.slice(0, s.indexOf(cut)).trim();
  /* 「_」是 B 站文件名里 & 的替身，只换分隔符写法，不补全被截断的艺人名 */
  const b = s.slice(s.indexOf(cut) + cut.length).trim().replace(/\s*_\s*/g, ' / ');

  /* 「12.12 王力宏 - 唯一」这种写法是 艺人 - 歌名，顺序反的。
     文件夹名就是歌名，哪一段和它对上就用哪一段当标题。 */
  const norm = (x) => x.toLowerCase().replace(/[\s()（）]/g, '');
  const f = norm(folder);
  const matches = (x) => {
    const n = norm(x);
    return n !== '' && f !== '' && (n === f || n.includes(f) || f.includes(n));
  };
  if (matches(b) && !matches(a)) return { title: b, artist: a };
  return { title: a || folder, artist: b };
}

/** 每个文件夹可以放一个 meta.json 覆盖解析结果：{ "title": "", "artist": "", "album": "" } */
function readMeta(dir) {
  const p = join(dir, 'meta.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * AI 生成的 lrc 里混了非歌词内容，逐条清掉，只留真正要唱的字：
 *   · 第一个「🎵 歌名」分隔行之前的整段散文前言
 *   · markdown 排版（# 标题、**加粗**、`code`）
 *   · [Verse 1] / [Chorus] 这类段落标记行
 *   · **The Kid LAROI:** 这类只写说话人的行
 * 没有分隔行的干净文件不受影响；时间戳原样保留。
 */
const STAMPS = /^((?:\[\d+:[\d.,]+\])+)([\s\S]*)$/;

function cleanLrc(raw) {
  const lines = raw.split(/\r?\n/);
  const textOf = (l) => {
    const m = STAMPS.exec(l);
    return (m ? m[2] : l).trim();
  };

  const divider = lines.findIndex((l) => /^#*\s*🎵/.test(textOf(l)));
  const body = divider >= 0 ? lines.slice(divider + 1) : lines;
  let dropped = divider >= 0 ? divider + 1 : 0;

  const out = [];
  for (const line of body) {
    if (!line.trim()) continue;
    const m = STAMPS.exec(line);
    if (!m) {
      dropped++;
      continue;
    }
    const txt = textOf(line)
      .replace(/^#{1,6}\s*/, '')
      .replace(/[*_`]/g, '')
      .trim();
    const sectionTag = /^(?:\[[^\]]{1,24}\]\s*)+$/.test(txt);
    const speakerTag = /^[^:：]{0,30}[:：]$/.test(txt);
    if (!txt || sectionTag || speakerTag) {
      dropped++;
      continue;
    }
    out.push(m[1] + txt);
  }
  return { text: `${out.join('\n')}\n`, dropped };
}

/** 歌词是文本，要在复制前先清洗，所以不走 copyInto */
function writeLrc(srcAbs, dstAbs) {
  const { text, dropped } = cleanLrc(readFileSync(srcAbs, 'utf8'));
  if (existsSync(dstAbs) && readFileSync(dstAbs, 'utf8') === text) return dropped;
  mkdirSync(dirname(dstAbs), { recursive: true });
  writeFileSync(dstAbs, text, 'utf8');
  return dropped;
}

function copyInto(srcAbs, dstAbs) {
  if (existsSync(dstAbs) && statSync(dstAbs).size === statSync(srcAbs).size) return false;
  mkdirSync(dirname(dstAbs), { recursive: true });
  copyFileSync(srcAbs, dstAbs);
  return true;
}

const url = (folder, name) => encodeURI(`/music/${folder}/${name}`);

if (!existsSync(SRC)) {
  console.error(`找不到源目录：${SRC}`);
  console.error('用法：node scripts/sync-music.mjs [歌曲目录，默认 ../music]');
  process.exit(1);
}

const folders = readdirSync(SRC, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const defs = [];
const skipped = [];
const missing = [];
const cleaned = [];

for (const folder of folders) {
  const dir = join(SRC, folder);
  const files = sortedFiles(dir);
  const audio = files.find((f) => isType(f, AUDIO_EXT) && !f.startsWith('.'));
  if (!audio) {
    skipped.push(folder);
    continue;
  }
  const lrc = files.find((f) => extname(f).toLowerCase() === '.lrc');
  const image = files.find((f) => /^cover\./i.test(f) && isType(f, IMAGE_EXT)) ?? files.find((f) => isType(f, IMAGE_EXT));

  const meta = readMeta(dir) ?? {};
  const parsed = parseName(audio, folder);

  copyInto(join(dir, audio), join(PUBLIC_MUSIC, folder, `track${extname(audio).toLowerCase()}`));
  if (lrc) {
    const dropped = writeLrc(join(dir, lrc), join(PUBLIC_MUSIC, folder, 'track.lrc'));
    if (dropped) cleaned.push(`${folder}：歌词清掉 ${dropped} 行非歌词内容（前言 / 排版 / 段落标记）`);
  }
  if (image) copyInto(join(dir, image), join(PUBLIC_MUSIC, folder, `cover${extname(image).toLowerCase()}`));

  /* 目标目录是源文件夹的镜像：源里删了图，这里也删，否则换图换不掉 */
  const outDir = join(PUBLIC_MUSIC, folder);
  for (const f of existsSync(outDir) ? readdirSync(outDir) : []) {
    if (!lrc && f === 'track.lrc') rmSync(join(outDir, f));
    if (!image && /^cover\./i.test(f)) rmSync(join(outDir, f));
    if (image && /^cover\./i.test(f) && f !== `cover${extname(image).toLowerCase()}`) rmSync(join(outDir, f));
  }

  if (!lrc) missing.push(`${folder}：没有 lrc（能播，但没有歌词）`);
  if (!image) missing.push(`${folder}：没有图片（背景沿用生成的渐变封面）`);

  defs.push({
    slug: folder,
    title: meta.title || parsed.title,
    artist: meta.artist || parsed.artist || '未知艺人',
    album: meta.album || '本地音乐',
    audioUrl: url(folder, `track${extname(audio).toLowerCase()}`),
    lyricUrl: lrc ? url(folder, 'track.lrc') : null,
    coverUrl: image ? url(folder, `cover${extname(image).toLowerCase()}`) : null,
  });
}

const known = new Set(defs.map((d) => d.slug));
const stale = existsSync(PUBLIC_MUSIC)
  ? readdirSync(PUBLIC_MUSIC, { withFileTypes: true }).filter((e) => e.isDirectory() && !known.has(e.name)).map((e) => e.name)
  : [];

const banner = `/**
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

export const LOCAL_TRACK_DEFS: LocalTrackDef[] = ${JSON.stringify(defs, null, 2)};
`;
writeFileSync(GENERATED, banner, 'utf8');

console.log(`\n${defs.length} 首已同步到 public/music 与生成清单：`);
for (const d of defs) {
  const flag = d.coverUrl ? '图' : '—';
  const lyric = d.lyricUrl ? '词' : '—';
  console.log(`  [${flag}][${lyric}] ${d.title} — ${d.artist}  (${d.slug})`);
}
if (skipped.length) console.log(`\n跳过（文件夹里没有音频）：${skipped.join('、')}`);
if (cleaned.length) console.log(`\n歌词清洗（源文件不动，只清 public 里的副本）：\n  ` + cleaned.join('\n  '));
if (missing.length) console.log('\n缺文件：\n  ' + missing.join('\n  '));
if (stale.length) console.log(`\npublic/music 下有源目录里已经不存在的文件夹（未删除）：${stale.join('、')}`);
console.log(`\n清单：${resolve(PROJECT, 'src/mocks/data/local-tracks.generated.ts')}`);
