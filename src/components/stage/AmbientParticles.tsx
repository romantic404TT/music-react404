import { useMemo } from 'react';
import { Particles } from 'react-particles-lite';
import { useFxStore } from '@/store/fxStore';

/** 该包只导出了 Particles 组件本身，没导出 IParticleParams，所以从 props 反推 */
type ParticleParams = NonNullable<React.ComponentProps<typeof Particles>['params']>;

/**
 * 背景环境粒子层。
 *
 * 用 react-particles-lite（ISC 授权，零依赖，已审计其 dist 无 fetch/eval/XHR/存储访问）
 * 提供一个 2D canvas 的星尘层，垫在 three.js 封面粒子之下，负责"空间感"，
 * 不负责"跟着音乐动"——后者仍然是 3D 层的职责。
 *
 * ⚠ 这个库的 effect 依赖是 `JSON.stringify(params) + preset`：params 任何变化都会
 * 销毁并重建整个引擎、所有粒子重生。所以 params 必须是稳定值，
 * 绝不能用音频电平每帧去驱动它。密度滑条也因此做了量化（见下）。
 */

/** Mineradio 调色板：主青 + 冷蓝 + 香槟，全部低不透明度，只做氛围 */
const PALETTE = ['#00f5d4', '#8fe9ff', '#73a7ff', '#f4d28a', '#9db8cf'];

/** 量化到 0.25 一档：拖动滑条最多触发 4 次重建，而不是每帧一次 */
function quantize(v: number): number {
  return Math.max(0.25, Math.min(1, Math.round(v * 4) / 4));
}

function buildParams(density: number): ParticleParams {
  return {
    number: {
      value: Math.round(90 + 260 * density),
      density: { enable: true, area: 900 },
    },
    color: { value: PALETTE },
    shape: { type: 'star', polygon: { sides: 4 }, images: [] },
    opacity: {
      value: 0.34,
      random: true,
      anim: { enable: true, speed: 0.6, opacity_min: 0.05, sync: false },
    },
    size: {
      value: 2.6,
      random: true,
      anim: { enable: true, speed: 1.4, size_min: 0.6, sync: false },
    },
    rotate: {
      enable: true,
      value: 0,
      random: true,
      anim: { enable: true, speed: 0.8, direction: 'counter-clockwise', sync: false },
    },
    move: {
      enable: true,
      speed: 0.42,
      direction: { to: 'top', random: true },
      randomized: { enable: true, min: 0.12, max: 0.5 },
      straight: false,
      out_mode: 'out',
      attract: { enable: false, rotateX: 1000, rotateY: 1000 },
    },
    sway: { enable: true, amplitude: 12, frequency: 0.008, random: true },
    /* 库自带的按景深分档模糊，是这一层质感的主要来源 */
    depthBlur: { enable: true, focus: 0.15, maxBlur: 2.4 },
    /* 背景层设了 pointer-events:none，开着交互只会白挂监听 */
    interactivity: {
      detect_on: 'canvas',
      events: {
        onhover: { enable: false, mode: 'repulse' },
        onclick: { enable: false, mode: 'push' },
      },
      modes: {
        grab: { distance: 0 },
        bubble: { distance: 0, size: 0, duration: 0 },
        repulse: { distance: 0, duration: 0 },
        push: { quantity: 0 },
        remove: { quantity: 0 },
      },
    },
  };
}

export function AmbientParticles() {
  const enabled = useFxStore((s) => s.fx.ambientLayer);
  const preset = useFxStore((s) => s.fx.ambientPreset);
  const density = useFxStore((s) => quantize(s.fx.ambientDensity));

  const params = useMemo(() => buildParams(density), [density]);

  if (!enabled) return null;

  return (
    <div
      id="ambient-particle-layer"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 opacity-70 mix-blend-screen"
    >
      <Particles params={params} preset={preset} className="h-full w-full" />
    </div>
  );
}
