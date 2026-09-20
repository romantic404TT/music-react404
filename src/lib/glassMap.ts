/**
 * 移植自 public/js/modules/05-playback/15-control-glass-animations.js:59-112。
 *
 * 原版那层"色差玻璃"不是 blur，而是一张按元素尺寸实时生成的置换贴图，
 * 喂给 SVG 的 feDisplacementMap 分 RGB 三通道位移。
 * 贴图没生成出来时 html.control-glass-svg-ok 不会被加上，自动退回纯 blur。
 */

interface MapSize {
  width: number;
  height: number;
  radius: number;
}

function svgDataUri(svg: string): string {
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export function generateControlGlassDisplacementMap(width: number, height: number, radius: number): string {
  const w = Math.max(240, Math.round(width || 400));
  const h = Math.max(48, Math.round(height || 92));
  const r = Math.max(12, Math.round(radius || 50));

  const borderWidth = 0.07;
  const edge = Math.min(w, h) * (borderWidth * 0.5);
  const innerW = Math.max(1, w - edge * 2);
  const innerH = Math.max(1, h - edge * 2);

  return svgDataUri(
    `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">` +
      '<defs>' +
      '<linearGradient id="glass-red" x1="100%" y1="0%" x2="0%" y2="0%">' +
      '<stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient>' +
      '<linearGradient id="glass-blue" x1="0%" y1="0%" x2="0%" y2="100%">' +
      '<stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient>' +
      '</defs>' +
      `<rect x="0" y="0" width="${w}" height="${h}" fill="black"/>` +
      `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="url(#glass-red)"/>` +
      `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="url(#glass-blue)" style="mix-blend-mode:difference"/>` +
      `<rect x="${edge.toFixed(2)}" y="${edge.toFixed(2)}" width="${innerW.toFixed(2)}" height="${innerH.toFixed(2)}" ` +
      `rx="${r}" fill="hsl(0 0% 50% / 1)" style="filter:blur(11px)"/>` +
      '</svg>',
  );
}

export function generateAccountPillGlassDisplacementMap(
  width: number,
  height: number,
  radius: number,
  minWidth = 180,
  minHeight = 44,
): string {
  const w = Math.max(Math.max(1, Math.round(minWidth)), Math.round(width || 220));
  const h = Math.max(Math.max(1, Math.round(minHeight)), Math.round(height || 44));
  const r = Math.max(20, Math.round(radius || h / 2));

  const edge = Math.min(w, h) * 0.09;
  const innerW = Math.max(1, w - edge * 2);
  const innerH = Math.max(1, h - edge * 2);

  return svgDataUri(
    `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">` +
      '<defs>' +
      '<linearGradient id="account-x" x1="0%" y1="0%" x2="100%" y2="0%">' +
      '<stop offset="0%" stop-color="rgb(112,128,128)"/>' +
      '<stop offset="13%" stop-color="rgb(150,128,128)"/>' +
      '<stop offset="42%" stop-color="rgb(128,128,128)"/>' +
      '<stop offset="72%" stop-color="rgb(120,128,128)"/>' +
      '<stop offset="100%" stop-color="rgb(144,128,128)"/>' +
      '</linearGradient>' +
      '<filter id="account-soft" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>' +
      '</defs>' +
      `<rect x="0" y="0" width="${w}" height="${h}" fill="rgb(128,128,128)"/>` +
      `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="url(#account-x)" filter="url(#account-soft)" opacity=".82"/>` +
      `<rect x="${edge.toFixed(2)}" y="${edge.toFixed(2)}" width="${innerW.toFixed(2)}" height="${innerH.toFixed(2)}" ` +
      `rx="${Math.max(1, r - edge).toFixed(2)}" fill="rgb(128,128,128)" opacity=".36"/>` +
      '</svg>',
  );
}

/** 原版用 `宽x高:圆角` 作为贴图缓存键，尺寸不变就不重新生成 */
export function glassMapKey({ width, height, radius }: MapSize): string {
  return `${Math.round(width)}x${Math.round(height)}:${Math.round(radius)}`;
}

export function measureGlassMapTarget(el: HTMLElement | null): (MapSize & { href: string }) | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const radius = parseFloat(getComputedStyle(el).borderRadius) || 24;
  return {
    width: rect.width,
    height: rect.height,
    radius,
    href: generateControlGlassDisplacementMap(rect.width, rect.height, radius),
  };
}
