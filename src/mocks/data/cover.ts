/**
 * 确定性生成器：种子随机 + 程序化封面。
 *
 * 单独成模块是为了打断 catalog ↔ local-tracks 的循环引用
 * （两边都要用 makeCover 生成占位封面）。
 */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 确定性封面：渐变 + 同心环 + 首字母，避免任何外部图片依赖 */
export function makeCover(seedText: string, label: string): string {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rnd = mulberry32(h);
  const hue = 0 + Math.floor(rnd() * 359);
  const hue2 = (hue + Math.floor(rnd() * 260) + 40) % 360;
  const c1 = `hsl(${hue} 62% 22%)`;
  const c2 = `hsl(${hue2} 70% 8%)`;
  const c3 = `hsl(${hue2} 88% 62%)`;
  const letter = (label || '?').replace(/^[\s'"(【《]+/, '').charAt(0) || '♪';
  const rings = Array.from({ length: 3 }, (_, i) => {
    const r = 26 + i * 17 + Math.floor(rnd() * 7) - 3;
    return `<circle cx="150" cy="150" r="${r}" fill="none" stroke="${c3}" stroke-opacity="${0.1 - i * 0.024}" stroke-width="${2 - i * 0.4}"/>`;
  }).join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` +
    `<rect width="300" height="300" fill="url(#g)"/>${rings}` +
    `<circle cx="150" cy="150" r="7" fill="${c3}" fill-opacity=".5"/>` +
    `<text x="150" y="182" text-anchor="middle" font-family="sans-serif" font-size="112" ` +
    `font-weight="700" fill="${c3}" fill-opacity=".26">${letter}</text></svg>`;

  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
