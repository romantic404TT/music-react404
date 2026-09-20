/**
 * 合成音频底床。
 *
 * mock 层不可能给出真实音乐流，但粒子舞台需要真实信号才有意义，
 * 所以 /api/audio 直接回一段程序化生成的 WAV：含 kick 于固定 BPM、
 * 低频持续音、和声垫与噪声踩镲。WebAudio AnalyserNode 读到的是真采样，
 * 原版那套 bass / mid / treble 分带与 onset 检测逻辑因此能照常跑。
 *
 * 长度固定 12 秒循环播放；播放进度由 metadata 时长驱动的时钟负责（见 hooks/useAudioEngine）。
 */

export const SAMPLE_RATE = 22050;
export const LOOP_SECONDS = 12;

/** 由曲目 id 派生 BPM（80~128），保证同一首歌每次刷新节奏一致 */
export function bpmFor(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return 80 + (h % 49);
}

function noiseTable(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 2147483648) - 1;
  };
}

/** 生成 16-bit 单声道 PCM */
export function renderLoopSamples(seed: string): Float32Array {
  const bpm = bpmFor(seed);
  const total = Math.floor(SAMPLE_RATE * LOOP_SECONDS);
  const out = new Float32Array(total);
  const rnd = noiseTable(seed.length * 7919 + 13);

  const beatSamples = (60 / bpm) * SAMPLE_RATE;
  const bar = beatSamples * 4;
  // 和声垫：三个正弦叠加，根音按 seed 变化
  const root = 55 * Math.pow(2, ((hashSmall(seed) % 7) * 2) / 12);
  const partials = [1, 1.5, 2, 2.5, 3];

  let kickPhase = 0;
  let hatPhase = 0;
  let kickEnv = 0;
  let hatEnv = 0;

  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE;

    /* 低频持续 */
    let s = 0.16 * Math.sin(2 * Math.PI * root * t);
    s += 0.07 * Math.sin(2 * Math.PI * root * 2 * t + 0.4);

    /* 和声垫，慢速 LFO 控制音量 */
    const pad = 0.055 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.11 * t));
    for (let p = 0; p < partials.length; p++) {
      s += pad * Math.sin(2 * Math.PI * root * 4 * partials[p]! * t + p);
    }

    /* 中频旋律线：按拍走五声音阶 */
    const stepIdx = Math.floor(i / (beatSamples / 2)) % 8;
    const scale = [0, 3, 5, 7, 10, 12, 10, 7];
    const melodyFreq = root * 8 * Math.pow(2, (scale[stepIdx] ?? 0) / 12);
    const melodyGate = 0.5 + 0.5 * Math.sin(2 * Math.PI * (SAMPLE_RATE / beatSamples / 2) * (i % (beatSamples / 2)));
    s += 0.05 * melodyGate * Math.sin(2 * Math.PI * melodyFreq * t);

    /* kick：每拍一次，指数衰减 */
    kickPhase += 1;
    if (kickPhase >= beatSamples) {
      kickPhase -= beatSamples;
      kickEnv = 1;
    }
    if (kickEnv > 0.0004) {
      s += 0.55 * kickEnv * Math.sin(2 * Math.PI * (48 + 90 * kickEnv) * (i / SAMPLE_RATE));
      kickEnv *= 0.9975;
    }

    /* 踩镲：8 分音符的高通噪声 */
    hatPhase += 1;
    if (hatPhase >= beatSamples / 2) {
      hatPhase -= beatSamples / 2;
      hatEnv = 0.5 + rnd() * 0.2;
    }
    if (hatEnv > 0.0006) {
      s += 0.1 * hatEnv * rnd();
      hatEnv *= 0.982;
    }

    /* 每小节首拍给一个明显的强 onset，供 beatPulse 捕捉 */
    if (i % Math.floor(bar) < 48) s += 0.22 * (1 - (i % Math.floor(bar)) / 48);

    out[i] = Math.max(-1, Math.min(1, s * 0.82));
  }

  /* 循环接缝处交叉淡化，避免爆音 */
  const fade = Math.floor(SAMPLE_RATE * 0.04);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    const a = out[i]!;
    const b = out[total - fade + i]!;
    out[i] = a * k + b * (1 - k);
    out[total - fade + i] = b * k + a * (1 - k);
  }

  return out;
}

function hashSmall(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/** 打包成 WAV（RIFF/PCM 单声道 16-bit） */
export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Uint8Array {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataSize, true);

  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    o += 2;
  }

  return new Uint8Array(buf);
}

const cache = new Map<string, Uint8Array>();

export function getWavBytes(seed: string): Uint8Array {
  const hit = cache.get(seed);
  if (hit) return hit;
  const wav = encodeWav(renderLoopSamples(seed));
  cache.set(seed, wav);
  return wav;
}
