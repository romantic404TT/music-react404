import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { levels } from '@/lib/audioLevels';
import { useFxStore } from '@/store/fxStore';
import { usePlayerStore } from '@/store/playerStore';

/**
 * 封面粒子舞台（近似实现）。
 *
 * 原版是 02-visual 那 16 个文件、约 600KB 代码加多套 GLSL。这里复刻的是同一套
 * "封面采样 → 点云 → 低频驱动"骨架，实现 3 个代表预设（0 emily / 1 滚筒 / 2 星球）。
 *
 * 这次的视觉升级参考了 cnolka/Aural-Pro（MIT，https://github.com/cnolka/Aural-Pro）
 * 的几个具体做法，需要署名的地方是：低频的 sqrt 响应曲线、高通分量的 smoothstep 门控、
 * 以及"核心 + 光晕"的点精灵衰减形状。simplex noise 用的是 Ashima / Stefan Gustavson
 * 的公开领域实现，属于通用技术。
 *
 * 刻意没用 UnrealBloomPass：本工程的背景是 DOM 层（封面模糊 + 渐变），
 * 合成器要把 alpha 一路穿到 composer 才不糊黑，风险高；改用同几何二次绘制的
 * 假辉光（窄核 + 宽晕加色），代价是一次 draw call，换来确定不会出黑屏。
 */

const PARTICLES = 16000;

interface CoverSample {
  positions: Float32Array;
  colors: Float32Array;
  luminance: Float32Array;
}

/** 从封面图采样像素颜色、平面坐标与亮度；data-URI SVG 不会污染 canvas */
async function sampleCover(src: string | undefined): Promise<CoverSample> {
  const positions = new Float32Array(PARTICLES * 3);
  const colors = new Float32Array(PARTICLES * 3);
  const luminance = new Float32Array(PARTICLES);

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
      r = 0.16 + v * 0.22;
      g = 0.3 + u * 0.36;
      b = 0.42 + (1 - Math.abs(u - 0.5) * 2) * 0.4;
    }

    positions[i * 3] = (u - 0.5) * 2;
    positions[i * 3 + 1] = (0.5 - v) * 2;
    positions[i * 3 + 2] = 0;

    /* 提亮并拉饱和：暗封面在加色混合下几乎看不见 */
    colors[i * 3] = Math.min(1, r * 1.45 + 0.05);
    colors[i * 3 + 1] = Math.min(1, g * 1.45 + 0.05);
    colors[i * 3 + 2] = Math.min(1, b * 1.5 + 0.07);

    luminance[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  return { positions, colors, luminance };
}

/* Ashima / Stefan Gustavson 的公开领域 simplex noise */
const SNOISE = /* glsl */ `
vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
float fbm3(vec3 p){
  float amp = 0.5;
  float sum = 0.0;
  for (int i = 0; i < 3; i++){
    sum += amp * snoise(p);
    p = p * 2.03 + 7.0;
    amp *= 0.5;
  }
  return sum;
}
`;

const VERT = /* glsl */ `
  uniform float uTime, uIntensity, uDepth, uPointScale, uSpeed, uTwist, uScatter, uBurst;
  uniform float uBass, uMid, uTreble, uBeat, uPreset, uPixelRatio, uHalo;
  attribute vec3 aColor;
  attribute float aRand;
  attribute float aLum;
  varying vec3 vColor;
  varying float vFade;

  vec3 orbit(vec3 p, float ang){
    float c = cos(ang), s = sin(ang);
    return vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
  }

  void main() {
    vColor = aColor;
    vec3 p = position;

    /* 低频响应：sqrt 让弱拍也有存在感，线性读起来只是缓慢缩放 */
    float kick = sqrt(max(0.0, uBass)) * 0.30 + uBass * 0.05 + uBeat * 0.10;

    if (uPreset < 0.5) {
      /* 0 emily 封面粒子：亮度当地形高度，平面才有起伏 */
      p.z += (aLum - 0.45) * uDepth * 1.7 * (0.5 + uBass * 1.5);
      p.z += sin(p.x * 4.2 + uTime * 0.9 * uSpeed) * 0.035 * (0.4 + kick);
      p.xy *= 1.0 + (aLum - 0.5) * 0.10 + kick * 0.12 * uIntensity;
    } else if (uPreset < 1.5) {
      /* 1 滚筒 */
      float a = p.x * 3.14159 + uTime * 0.35 * uSpeed;
      float r = 0.95 + p.y * 0.18 + kick * 0.55;
      p = vec3(cos(a) * r, p.y * 1.9 + sin(uTime * 0.5) * 0.08, sin(a) * r);
      p = orbit(p, uTwist * 1.4 + uTime * 0.12);
    } else {
      /* 2 星球：球壳随中频呼吸 */
      vec3 s = normalize(vec3(p.x, p.y, 0.35)) * (1.0 + uMid * 0.25);
      p = s * (0.86 + kick * 0.55);
      p = orbit(p, uTime * 0.16 * uSpeed + uTwist);
    }

    /* 三维流场：让点自己游动，而不是整块平移 */
    vec3 flow = vec3(
      fbm3(p * 1.8 + uTime * 0.15),
      fbm3(p * 1.8 + vec3(31.4, 0.0, 0.0) + uTime * 0.12),
      fbm3(p * 1.8 + vec3(0.0, 17.2, 5.1) + uTime * 0.10)
    );
    p += flow * (0.018 + uMid * 0.055 + uScatter * 0.22) * uIntensity;

    /* 高通门控：高频到阈值才"咬"一口，而不是全程细碎抖动 */
    float jit = smoothstep(0.28, 0.62, uTreble);
    p += (aRand - 0.5) * jit * 0.09 * uIntensity;

    p *= 1.0 + uBurst * 0.20;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = max(0.35, -mv.z);

    /* 指数雾：把前景火星和后面的点群拉开层次 */
    float fog = exp(-pow(max(0.0, dist - 2.6) * 0.42, 2.0));
    vFade = clamp(0.30 + kick * 1.9 + uBeat * 0.5, 0.0, 1.0) * clamp(fog, 0.12, 1.0);

    gl_Position = projectionMatrix * mv;
    /* 核心约 5px、光晕约 15px。太小会淡成雾，太大加色累积会糊成白板。 */
    float base = 10.0;
    gl_PointSize = uPointScale * mix(1.0, 2.9, uHalo) * (base * uPixelRatio / dist);
  }
`;

const FRAG = /* glsl */ `
  uniform float uColorBoost, uTintStrength, uBgFade, uBloomStrength, uHalo;
  uniform vec3 uTintColor;
  varying vec3 vColor;
  varying float vFade;

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = dot(d, d);
    if (r > 0.25) discard;
    float q = r * 4.0;

    float core = pow(max(0.0, 1.0 - q), 8.0);
    float halo = 1.0 - smoothstep(0.0, 1.0, q);

    vec3 base = mix(vColor, uTintColor, uTintStrength * 0.55) * uColorBoost;
    /* 白热只提亮中心一小撮：16000 点 × 2 通道是加色累积，
       单点过曝一点点，整片就成白板。 */
    vec3 c = base * (halo * 0.5 + 0.6);
    c += mix(base, vec3(1.0), 0.34) * core * (0.30 + uBloomStrength * 0.65);

    float a = max(core * 0.62, halo * 0.16) * mix(0.16, 0.66, vFade) * (1.0 - uBgFade * 0.5);
    a *= mix(1.0, 0.42, uHalo);
    gl_FragColor = vec4(c, a);
  }
`;

function makeMaterial(halo: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.85 },
      uDepth: { value: 0.2 },
      uPointScale: { value: 1 },
      uSpeed: { value: 1 },
      uTwist: { value: 0 },
      uScatter: { value: 0 },
      uBurst: { value: 0 },
      uColorBoost: { value: 1.1 },
      uTintStrength: { value: 0.22 },
      uTintColor: { value: new THREE.Color('#9db8cf') },
      uBgFade: { value: 0.2 },
      uBloomStrength: { value: 0.62 },
      uPreset: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) },
      uHalo: { value: halo },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uBeat: { value: 0 },
    },
    vertexShader: SNOISE + VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

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

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLES * 3);
    const colors = new Float32Array(PARTICLES * 3);
    const lum = new Float32Array(PARTICLES);
    const rand = new Float32Array(PARTICLES);
    for (let i = 0; i < PARTICLES; i++) rand[i] = Math.random();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
    geometry.setAttribute('aLum', new THREE.BufferAttribute(lum, 1));
    geoRef.current = geometry;

    /* 同一份几何画两遍：宽晕打底，窄核在上 */
    const haloMat = makeMaterial(1);
    const coreMat = makeMaterial(0);
    const haloPoints = new THREE.Points(geometry, haloMat);
    const corePoints = new THREE.Points(geometry, coreMat);
    haloPoints.frustumCulled = false;
    corePoints.frustumCulled = false;
    haloPoints.renderOrder = 1;
    corePoints.renderOrder = 2;
    scene.add(haloPoints, corePoints);

    void sampleCover(undefined).then((s) => {
      (geometry.getAttribute('position') as THREE.BufferAttribute).array.set(s.positions);
      (geometry.getAttribute('aColor') as THREE.BufferAttribute).array.set(s.colors);
      (geometry.getAttribute('aLum') as THREE.BufferAttribute).array.set(s.luminance);
      geometry.getAttribute('position').needsUpdate = true;
      geometry.getAttribute('aColor').needsUpdate = true;
      geometry.getAttribute('aLum').needsUpdate = true;
    });

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
    /** 每个 uniform 都朝目标值缓动，滑条不会跳变 */
    const ease = (obj: { value: number }, target: number, k = 0.08) => { obj.value += (target - obj.value) * k; };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const fx = useFxStore.getState().fx;
      const playing = usePlayerStore.getState().playing;
      const t = (now - start) / 1000;

      const k = playing ? 1 : 0;
      ease(levelsUniforms(haloMat).uBass, levels.smoothBass * k);
      ease(levelsUniforms(haloMat).uMid, levels.smoothMid * k);
      ease(levelsUniforms(haloMat).uTreble, levels.smoothTreb * k);
      ease(levelsUniforms(haloMat).uBeat, levels.beatPulse * k, 0.22);

      const shared: Array<[string, number]> = [
        ['uTime', t],
        ['uPreset', fx.preset <= 2 ? fx.preset : 0],
        ['uIntensity', fx.intensity],
        ['uDepth', fx.depth],
        ['uPointScale', fx.point * (fx.coverResolution / 1.55)],
        ['uSpeed', playing ? fx.speed : fx.speed * 0.25],
        ['uTwist', fx.twist],
        ['uScatter', fx.scatter],
        ['uColorBoost', fx.color],
        ['uBgFade', fx.bgFade],
        ['uBloomStrength', fx.bloom ? fx.bloomStrength : fx.bloomStrength * 0.45],
        ['uTintStrength', fx.visualTintMode === 'auto' ? 0.2 : 0.5],
      ];

      for (const mat of [haloMat, coreMat]) {
        for (const [key, val] of shared) ease(mat.uniforms[key] as { value: number }, val);
        (mat.uniforms.uTintColor.value as THREE.Color).set(fx.visualTintColor);
        /* 爆点只给核心通道，晕通道靠自然衰减 */
        ease(mat.uniforms.uBurst as { value: number }, mat === coreMat ? burstRef.current : 0, 0.18);
      }
      if (levels.beatOnsetFlag && playing) burstRef.current = Math.min(1, burstRef.current + levels.beatPulse * 0.6);
      burstRef.current *= 0.93;

      if (!orbit.dragging) orbit.theta += 0.0012 + levels.beatPulse * 0.0022;

      const shake = fx.cinema ? levels.beatPulse * fx.cinemaShake * 0.05 : 0;
      camera.position.x = Math.sin(orbit.theta) * Math.cos(orbit.phi) * orbit.radius + shake;
      camera.position.y = Math.sin(orbit.phi) * orbit.radius + (fx.lyricVerticalFloat ? Math.sin(t * 0.42) * 0.035 : 0);
      camera.position.z = Math.cos(orbit.theta) * Math.cos(orbit.phi) * orbit.radius;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    const burstRef = { current: 0 };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('wheel', onWheel);
      geometry.dispose();
      haloMat.dispose();
      coreMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      geoRef.current = null;
    };
  }, []);

  /* 切歌时重新采样封面颜色与亮度 */
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
      (geo.getAttribute('aLum') as THREE.BufferAttribute).array.set(s.luminance);
      geo.getAttribute('position').needsUpdate = true;
      geo.getAttribute('aColor').needsUpdate = true;
      geo.getAttribute('aLum').needsUpdate = true;
    });
    return () => { cancelled = true; };
  }, [currentId]);

  return <div id="canvas-container" ref={hostRef} className="absolute inset-0 z-0" aria-hidden="true" />;
}

/** 电平只写一次，两通道共享同一份数值 */
function levelsUniforms(mat: THREE.ShaderMaterial) {
  return {
    uBass: mat.uniforms.uBass as { value: number },
    uMid: mat.uniforms.uMid as { value: number },
    uTreble: mat.uniforms.uTreble as { value: number },
    uBeat: mat.uniforms.uBeat as { value: number },
  };
}
