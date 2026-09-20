import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { levels } from '@/lib/audioLevels';
import { useFxStore } from '@/store/fxStore';
import { usePlayerStore } from '@/store/playerStore';

/**
 * 封面粒子舞台（近似实现）。
 *
 * 原版是 02-visual 那 16 个文件、约 600KB 代码加多套 GLSL：粒子从专辑封面采样颜色与
 * 位置，13 个预设各有几何，歌词是 3D 文字网格，歌单架是 WebGL 卡片。
 * 这里复刻的是同一套"封面采样 → 点云 → 低频驱动"的骨架，实现 3 个代表预设
 * （0 emily 封面粒子 / 1 滚筒 / 2 星球），参数名与 fxDefaults 对齐。
 * 不要把它当作原版的等价还原。
 */

const PARTICLES = 16000;

interface CoverSample {
  positions: Float32Array;
  colors: Float32Array;
}

/** 从封面图采样像素颜色与平面坐标；data-URI SVG 不会污染 canvas */
async function sampleCover(src: string | undefined): Promise<CoverSample> {
  const positions = new Float32Array(PARTICLES * 3);
  const colors = new Float32Array(PARTICLES * 3);
  const target = { positions, colors };

  let px: Uint8ClampedArray | null = null;
  let side = 0;

  if (src) {
    try {
      const img = new Image();
      img.decoding = 'async';
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('cover load failed'));
        img.src = src;
      });
      const S = 128;
      const cv = document.createElement('canvas');
      cv.width = S;
      cv.height = S;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0, S, S);
        px = ctx.getImageData(0, 0, S, S).data;
        side = S;
      }
    } catch {
      px = null;
    }
  }

  for (let i = 0; i < PARTICLES; i++) {
    const u = Math.random();
    const v = Math.random();
    let r: number;
    let g: number;
    let b: number;

    if (px && side) {
      const sx = Math.min(side - 1, Math.floor(u * side));
      const sy = Math.min(side - 1, Math.floor(v * side));
      const o = (sy * side + sx) * 4;
      r = px[o]! / 255;
      g = px[o + 1]! / 255;
      b = px[o + 2]! / 255;
    } else {
      /* 没有封面时退到冷色渐变，仍然有层次 */
      r = 0.16 + v * 0.22;
      g = 0.30 + u * 0.36;
      b = 0.42 + (1 - Math.abs(u - 0.5) * 2) * 0.4;
    }

    positions[i * 3] = (u - 0.5) * 2;
    positions[i * 3 + 1] = (0.5 - v) * 2;
    positions[i * 3 + 2] = 0;

    /* 轻微提亮，粒子在暗背景上更容易读出节奏 */
    colors[i * 3] = Math.min(1, r * 1.35 + 0.04);
    colors[i * 3 + 1] = Math.min(1, g * 1.35 + 0.04);
    colors[i * 3 + 2] = Math.min(1, b * 1.35 + 0.05);
  }

  return target;
}

const VERT = /* glsl */ `
  uniform float uTime, uIntensity, uDepth, uPointScale, uSpeed, uTwist, uScatter, uBurst;
  uniform float uBass, uMid, uTreble, uBeat, uPreset, uPixelRatio;
  attribute vec3 aColor;
  attribute float aRand;
  varying vec3 vColor;
  varying float vFade;

  vec3 orbit(vec3 p, float ang) {
    float c = cos(ang), s = sin(ang);
    return vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
  }

  void main() {
    vColor = aColor;
    vec3 p = position;

    if (uPreset < 0.5) {
      /* 0 emily 封面粒子：贴近平面，随低频做景深起伏 */
      p.z += sin(p.x * 4.2 + uTime * 0.9 * uSpeed) * 0.055 * (0.4 + uBass * 2.6) * uDepth * 3.0;
      p.y += sin(uTime * 0.6 + aRand * 6.28) * 0.012;
      p.xy *= 1.0 + uBeat * 0.055 * uIntensity;
    } else if (uPreset < 1.5) {
      /* 1 滚筒：卷成圆柱并沿轴推进 */
      float a = p.x * 3.14159 + uTime * 0.35 * uSpeed;
      float r = 0.95 + p.y * 0.18 + uBass * 0.30 * uIntensity;
      p = vec3(cos(a) * r, p.y * 1.9 + sin(uTime * 0.5) * 0.08, sin(a) * r);
      p = orbit(p, uTwist * 1.4 + uTime * 0.12);
    } else {
      /* 2 星球：球壳点云，随中频呼吸 */
      vec3 s = normalize(vec3(p.x, p.y, 0.35)) * (1.0 + uMid * 0.25);
      p = s * (0.86 + uBass * 0.30 * uIntensity);
      p = orbit(p, uTime * 0.16 * uSpeed + uTwist);
    }

    /* 散射与爆点 */
    p += vec3(sin(aRand * 12.0 + uTime), cos(aRand * 9.0 + uTime * 1.3), sin(aRand * 7.0)) * uScatter * 0.35;
    p *= 1.0 + uBurst * 0.22;

    vFade = clamp(0.35 + uBass * 1.5 + uBeat * 0.7, 0.0, 1.0);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    /* 目标点径约 2~4px：16000 个加色混合的点再大就会糊成白块 */
    gl_PointSize = uPointScale * (1.0 + uTreble * 1.2) * (11.0 * uPixelRatio / max(0.35, -mv.z));
  }
`;

const FRAG = /* glsl */ `
  uniform float uColorBoost, uTintStrength, uBgFade, uBloomStrength;
  uniform vec3 uTintColor;
  varying vec3 vColor;
  varying float vFade;

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = dot(d, d);
    if (r > 0.25) discard;
    float soft = smoothstep(0.25, 0.0, r);

    vec3 c = vColor * uColorBoost;
    c = mix(c, uTintColor, uTintStrength * 0.55);
    /* 辉光靠叠加亮度模拟，不引 postprocessing 依赖 */
    c += c * uBloomStrength * soft * 0.9;

    float a = soft * mix(0.06, 0.42, vFade) * (1.0 - uBgFade * 0.55);
    gl_FragColor = vec4(c, a);
  }
`;

export function VisualStage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<string | undefined>(undefined);
  const geoRef = useRef<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(host.clientWidth || window.innerWidth, host.clientHeight || window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, (host.clientWidth || 1) / (host.clientHeight || 1), 0.1, 100);
    camera.position.set(0, 0, 3.2);

    const sample = sampleCover(undefined);
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLES * 3);
    const colors = new Float32Array(PARTICLES * 3);
    const rand = new Float32Array(PARTICLES);
    for (let i = 0; i < PARTICLES; i++) rand[i] = Math.random();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
    geoRef.current = geometry;

    const uniforms = {
      uTime: { value: 0 },
      uIntensity: { value: 0.85 },
      uDepth: { value: 0.2 },
      uPointScale: { value: 1 },
      uSpeed: { value: 1 },
      uTwist: { value: 0 },
      uScatter: { value: 0 },
      uBurst: { value: 0 },
      uColorBoost: { value: 1.1 },
      uTintStrength: { value: 0.25 },
      uTintColor: { value: new THREE.Color('#9db8cf') },
      uBgFade: { value: 0.2 },
      uBloomStrength: { value: 0.62 },
      uPreset: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uBeat: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    void sample.then((s) => {
      (geometry.getAttribute('position') as THREE.BufferAttribute).array.set(s.positions);
      (geometry.getAttribute('aColor') as THREE.BufferAttribute).array.set(s.colors);
      geometry.getAttribute('position').needsUpdate = true;
      geometry.getAttribute('aColor').needsUpdate = true;
    });

    /* 轨道镜头：拖拽旋转 + 滚轮推拉，对应原版 cameraViewMode:'orbit' */
    const orbit = { theta: 0, phi: 0, radius: 3.2, dragging: false, lastX: 0, lastY: 0 };
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-ui-layer]')) return;
      orbit.dragging = true;
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!orbit.dragging) return;
      orbit.theta += (e.clientX - orbit.lastX) * 0.0042;
      orbit.phi = Math.max(-1.1, Math.min(1.1, orbit.phi + (e.clientY - orbit.lastY) * 0.0032));
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
    };
    const onUp = () => { orbit.dragging = false; };
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('[data-ui-layer]')) return;
      orbit.radius = Math.max(1.5, Math.min(7.5, orbit.radius + e.deltaY * 0.0022));
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('wheel', onWheel, { passive: true });

    const onResize = () => {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    let raf = 0;
    const start = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const fx = useFxStore.getState().fx;
      const playing = usePlayerStore.getState().playing;

      uniforms.uTime.value = (now - start) / 1000;
      uniforms.uPreset.value = fx.preset <= 2 ? fx.preset : 0;
      uniforms.uIntensity.value = fx.intensity;
      uniforms.uDepth.value = fx.depth;
      uniforms.uPointScale.value = fx.point * (fx.coverResolution / 1.55);
      uniforms.uSpeed.value = playing ? fx.speed : fx.speed * 0.25;
      uniforms.uTwist.value = fx.twist;
      uniforms.uScatter.value = fx.scatter;
      uniforms.uColorBoost.value = fx.color;
      uniforms.uBgFade.value = fx.bgFade;
      uniforms.uBloomStrength.value = fx.bloom ? fx.bloomStrength : fx.bloomStrength * 0.35;
      uniforms.uTintColor.value.set(fx.visualTintMode === 'auto' ? fx.visualTintColor : fx.visualTintColor);
      uniforms.uTintStrength.value = fx.visualTintMode === 'auto' ? 0.22 : 0.5;

      /* 暂停时电平自然衰减，不留残留抖动 */
      const k = playing ? 1 : 0;
      uniforms.uBass.value += (levels.smoothBass * k - uniforms.uBass.value) * 0.18;
      uniforms.uMid.value += (levels.smoothMid * k - uniforms.uMid.value) * 0.16;
      uniforms.uTreble.value += (levels.smoothTreb * k - uniforms.uTreble.value) * 0.14;
      uniforms.uBeat.value += (levels.beatPulse * k - uniforms.uBeat.value) * 0.3;
      uniforms.uBurst.value *= 0.94;
      if (levels.beatOnsetFlag && playing) uniforms.uBurst.value = Math.min(1, uniforms.uBurst.value + levels.beatPulse * 0.5);

      const idle = playing ? 0.045 : 0.012;
      const shake = fx.cinema ? levels.beatPulse * fx.cinemaShake * 0.06 : 0;
      camera.position.x = Math.sin(orbit.theta) * Math.cos(orbit.phi) * orbit.radius + shake;
      camera.position.y = Math.sin(orbit.phi) * orbit.radius + (fx.lyricVerticalFloat ? Math.sin(now / 2400) * idle * 3 : 0);
      camera.position.z = Math.cos(orbit.theta) * Math.cos(orbit.phi) * orbit.radius;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('wheel', onWheel);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      geoRef.current = null;
    };
  }, []);

  /* 切歌时重新采样封面颜色 */
  const currentId = usePlayerStore((s) => (s.currentIdx >= 0 ? s.queue[s.currentIdx]?.id ?? null : null));
  useEffect(() => {
    if (!currentId) return;
    const song = usePlayerStore.getState().current();
    if (!song || song.cover === coverRef.current) return;
    coverRef.current = song.cover;

    let cancelled = false;
    void sampleCover(song.cover).then((s) => {
      const geo = geoRef.current;
      if (!geo || cancelled) return;
      (geo.getAttribute('position') as THREE.BufferAttribute).array.set(s.positions);
      (geo.getAttribute('aColor') as THREE.BufferAttribute).array.set(s.colors);
      geo.getAttribute('position').needsUpdate = true;
      geo.getAttribute('aColor').needsUpdate = true;
    });
    return () => { cancelled = true; };
  }, [currentId]);

  return <div id="canvas-container" ref={hostRef} className="absolute inset-0 z-0" aria-hidden="true" />;
}
