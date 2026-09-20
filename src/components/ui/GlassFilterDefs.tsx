import { useEffect, useRef } from 'react';
import { glassMapKey, measureGlassMapTarget } from '@/lib/glassMap';

/**
 * 「色差玻璃」的 SVG 滤镜定义 + 运行时置换贴图。
 *
 * 原版在 public/index.html 里写了 4 个 filter，每个的 feImage 贴图由
 * 15-control-glass-animations.js 按目标元素实时尺寸生成。这里保留同一条链路：
 *   1. 量目标元素尺寸与圆角；
 *   2. 生成 data-URI 贴图塞进 feImage；
 *   3. 成功后给 <html> 加 control-glass-svg-ok，CSS 才切到 url(#...) 那条 backdrop-filter。
 * 浏览器不支持时这个类不会被加上，自动退回纯 blur —— 与原版的降级一致。
 */

const TARGETS: { filterId: string; mapId: string; selector: string }[] = [
  { filterId: 'mineradio-control-glass-filter', mapId: 'control-glass-map', selector: '[data-glass="bar"]' },
  { filterId: 'mineradio-search-box-glass-filter', mapId: 'search-box-glass-map', selector: '[data-glass="search"]' },
  { filterId: 'mineradio-search-pill-glass-filter', mapId: 'search-pill-glass-map', selector: '[data-glass="pill"]' },
  { filterId: 'mineradio-account-pill-glass-filter', mapId: 'account-pill-glass-map', selector: '[data-glass="account"]' },
];

function channelFilter(id: string, mapId: string, region: { x: string; y: string; w: string; h: string }, scale: [number, number, number], offsetDx: number) {
  const ch = (n: number, s: number, matrix: string) => (
    <>
      <feDisplacementMap in="SourceGraphic" in2="map" scale={s} xChannelSelector="R" yChannelSelector="B" result={`disp${n}`} />
      <feOffset in={`disp${n}`} dx={offsetDx} dy={0} result={`disp${n}Shifted`} />
      <feMerge result={`disp${n}Aligned`}>
        <feMergeNode in="SourceGraphic" />
        <feMergeNode in={`disp${n}Shifted`} />
      </feMerge>
      <feColorMatrix in={`disp${n}Aligned`} type="matrix" values={matrix} result={n === 1 ? 'red' : n === 2 ? 'green' : 'blue'} />
    </>
  );

  return (
    <filter id={id} colorInterpolationFilters="sRGB" x={region.x} y={region.y} width={region.w} height={region.h}>
      <feImage id={mapId} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
      {ch(1, scale[0], '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0')}
      {ch(2, scale[1], '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0')}
      {ch(3, scale[2], '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0')}
      <feBlend in="red" in2="green" mode="screen" result="rg" />
      <feBlend in="rg" in2="blue" mode="screen" result="output" />
      <feGaussianBlur in="output" stdDeviation="0.5" />
    </filter>
  );
}

export function GlassFilterDefs() {
  const keysRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let raf = 0;

    const refresh = () => {
      raf = requestAnimationFrame(refresh);
      let okCount = 0;

      for (const t of TARGETS) {
        const target = document.querySelector(t.selector) as HTMLElement | null;
        const img = document.getElementById(t.mapId);
        if (!target || !img) continue;

        const measured = measureGlassMapTarget(target);
        if (!measured) continue;

        const key = glassMapKey(measured);
        if (keysRef.current[t.mapId] === key && img.getAttribute('href')) {
          okCount += 1;
          continue;
        }
        keysRef.current[t.mapId] = key;
        img.setAttribute('href', measured.href);
        img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', measured.href);
        okCount += 1;
      }

      if (okCount > 0 && !document.documentElement.classList.contains('control-glass-svg-ok')) {
        document.documentElement.classList.add('control-glass-svg-ok');
      }
    };

    raf = requestAnimationFrame(refresh);
    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove('control-glass-svg-ok');
    };
  }, []);

  return (
    <svg className="control-glass-filter-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        {channelFilter('mineradio-control-glass-filter', 'control-glass-map', { x: '-12%', y: '-28%', w: '124%', h: '156%' }, [180, 170, 160], -90)}
        {channelFilter('mineradio-search-box-glass-filter', 'search-box-glass-map', { x: '-24%', y: '-34%', w: '158%', h: '168%' }, [180, 170, 160], -90)}
        {channelFilter('mineradio-search-pill-glass-filter', 'search-pill-glass-map', { x: '-48%', y: '-68%', w: '210%', h: '236%' }, [118, 112, 106], -59)}
        {channelFilter('mineradio-account-pill-glass-filter', 'account-pill-glass-map', { x: '-40%', y: '-60%', w: '188%', h: '220%' }, [128, 122, 116], -64)}
      </defs>
    </svg>
  );
}
