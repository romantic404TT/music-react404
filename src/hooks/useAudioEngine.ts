import { useEffect, useRef } from 'react';
import { FFT_SIZE, levels } from '@/lib/audioLevels';
import { clamp } from '@/lib/format';
import { rememberDuration } from '@/lib/localDurations';
import { usePlayerStore, commitListenFlush, commitListenTick } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';

/**
 * 音频引擎：一个 <audio> + AudioContext + AnalyserNode + GainNode。
 *
 * 为什么要自己造时钟：mock 的 /api/audio 回的是 12 秒合成底床（见 mocks/audio/synth.ts），
 * 而接口返回的 metadata 时长是 4 分钟。所以这里
 *   · 真实音频元素只负责出声与提供频谱（循环底床）；
 *   · 进度由 performance.now() 推进的虚拟时钟负责，seek 时把底床对齐到 position % bed。
 * 这样分析器读到的是真采样，粒子跟着真节奏动，而进度条仍然走完一整首歌。
 *
 * 分带与 onset 的变量名沿用原版 00-state/00-core-stores.js：
 * bass / mid / treble / audioEnergy / beatPulse / smoothXxx / xxxPeak / beatOnsetFlag。
 */

const BIN_HZ_APPROX = 22050 / FFT_SIZE;

export function useAudioEngine(): { audioRef: React.RefObject<HTMLAudioElement | null> } {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const freqRef = useRef<Uint8Array>(new Uint8Array(FFT_SIZE / 2));
  const timeRef = useRef<Uint8Array>(new Uint8Array(FFT_SIZE));

  /** 虚拟时钟基准（仅用于合成底床；真实文件直接用元素时钟） */
  const clockRef = useRef({ base: 0, wallAt: 0, running: false, bed: 12 });
  const localRef = useRef(false);
  const lastTickRef = useRef(0);
  const listenAccRef = useRef(0);
  const prevEnergyRef = useRef(0);
  const sourceUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const el = new Audio();
    el.preload = 'auto';
    el.loop = true;
    el.crossOrigin = 'anonymous';
    audioRef.current = el;

    /* 真实文件播完：记一次完播，再交给 store 按播放模式推进 */
    const onEnded = () => {
      if (!localRef.current) return;
      commitListenFlush(true);
      void usePlayerStore.getState().next(false);
    };
    el.addEventListener('ended', onEnded);

    /* 清单里没有时长（构建期解不了 mp3），第一次读到 metadata 时记进本地存储，
       下次启动列表上直接就是准确值 */
    const onMeta = () => {
      if (!localRef.current) return;
      const song = usePlayerStore.getState().current();
      if (song && Number.isFinite(el.duration) && el.duration > 0) rememberDuration(song.id, el.duration);
    };
    el.addEventListener('loadedmetadata', onMeta);

    const unsubscribe = () => {
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('loadedmetadata', onMeta);
      el.pause();
      el.src = '';
      void ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
    };
    return unsubscribe;
  }, []);

  /** 首次用户手势后才能建 AudioContext（浏览器自动播放策略） */
  const ensureGraph = (): AudioContext | null => {
    const el = audioRef.current;
    if (!el) return null;
    if (ctxRef.current) return ctxRef.current;

    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    const ctx = new Ctor();
    const source = ctx.createMediaElementSource(el);
    const analyser = ctx.createAnalyser();
    const gain = ctx.createGain();

    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.72;
    gain.gain.value = currentGain();

    /* 链路：mediaElement → gain（淡入淡出/音量）→ analyser → destination */
    source.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);

    ctxRef.current = ctx;
    analyserRef.current = analyser;
    gainRef.current = gain;
    return ctx;
  };

  const currentGain = (): number => {
    const { volume } = useSettingsStore.getState();
    return clamp(volume, 0, 1);
  };

  /* ---------- 音源切换 ---------- */
  useEffect(() => {
    const apply = () => {
      const { source } = usePlayerStore.getState();
      const el = audioRef.current;
      if (!el || !source?.url) return;
      if (sourceUrlRef.current === source.url) return;
      sourceUrlRef.current = source.url;

      /* 真实文件不能循环，播完由 ended 事件推进下一首；
         合成底床只有 12 秒，必须循环才能撑满整首歌的时长。 */
      localRef.current = source.local === true;
      el.loop = !localRef.current;

      el.src = source.url;
      clockRef.current.base = usePlayerStore.getState().position;
      clockRef.current.wallAt = performance.now();
      if (localRef.current) {
        // 真实时长要等 metadata 到位，先清掉上一首的残留
        usePlayerStore.getState().setDuration(0);
      }
      el.load();
    };
    apply();
    return usePlayerStore.subscribe(apply);
  }, []);

  /* ---------- 播放 / 暂停 + 淡入淡出 ---------- */
  useEffect(() => {
    let prevPlaying: boolean | null = null;

    const apply = () => {
      const { playing } = usePlayerStore.getState();
      /* zustand 的 subscribe 在任意字段变化时都会触发；这里只响应 playing 的跳变，
         否则每次 setPosition 都会把虚拟时钟的基准重置回当前进度。 */
      if (prevPlaying === playing) return;
      prevPlaying = playing;

      const el = audioRef.current;
      if (!el) return;

      if (playing) {
        const ctx = ensureGraph();
        void ctx?.resume().catch(() => undefined);
        const gain = gainRef.current;
        const target = currentGain();
        if (gain && ctx) {
          const { fadeInMs } = useSettingsStore.getState().fade;
          gain.gain.cancelScheduledValues(ctx.currentTime);
          gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), ctx.currentTime);
          gain.gain.linearRampToValueAtTime(Math.max(0.0001, target), ctx.currentTime + fadeInMs / 1000);
        }
        clockRef.current.base = usePlayerStore.getState().position;
        clockRef.current.wallAt = performance.now();
        clockRef.current.running = true;
        el.play().catch(() => {
          /* 自动播放被拦：控制台保持可点，提示手动继续 —— 原版同款处理 */
          useUiStore.getState().pushToast('浏览器拦截了自动播放，点一下播放键继续', 'warn');
          usePlayerStore.getState().setPlaying(false);
        });
      } else {
        const ctx = ctxRef.current;
        const gain = gainRef.current;
        if (gain && ctx) {
          const { fadeOutMs } = useSettingsStore.getState().fade;
          gain.gain.cancelScheduledValues(ctx.currentTime);
          gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + fadeOutMs / 1000);
          setTimeout(() => audioRef.current?.pause(), fadeOutMs);
        } else {
          el.pause();
        }
        clockRef.current.running = false;
        clockRef.current.base = usePlayerStore.getState().position;
        commitListenFlush(false);
      }
    };

    apply();
    return usePlayerStore.subscribe(apply);
  }, []);

  /* ---------- 音量 ---------- */
  useEffect(() => useSettingsStore.subscribe((s) => {
    const ctx = ctxRef.current;
    const gain = gainRef.current;
    if (!gain || !ctx || !usePlayerStore.getState().playing) return;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(Math.max(0.0001, s.volume), ctx.currentTime, 0.02);
  }), []);

  /* ---------- seek ---------- */
  useEffect(() => {
    let last = usePlayerStore.getState().position;
    return usePlayerStore.subscribe((s) => {
      const el = audioRef.current;
      if (!el) return;
      if (Math.abs(s.position - last) > 1.5) {
        if (localRef.current) {
          // 真实文件直接原生 seek，不做取模
          try {
            el.currentTime = s.position;
          } catch {
            /* 元数据还没就绪，忽略一次 */
          }
          last = s.position;
          return;
        }
        clockRef.current.base = s.position;
        clockRef.current.wallAt = performance.now();
        const bed = clockRef.current.bed;
        try {
          el.currentTime = s.position % bed;
        } catch {
          /* 元数据还没就绪，忽略一次 */
        }
      }
      last = s.position;
    });
  }, []);

  /* ---------- 主循环：时钟 + 频谱 + 收听计时 ---------- */
  useEffect(() => {
    let raf = 0;
    let lastUi = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);

      const store = usePlayerStore.getState();
      const clock = clockRef.current;
      const el = audioRef.current;

      if (!localRef.current && el && el.duration && el.duration > 1 && Math.abs(clock.bed - el.duration) > 0.2) {
        clock.bed = el.duration;
      }

      if (localRef.current) {
        /* 真实文件：元素自己就是权威时钟，不要用墙钟去推算 */
        if (el && Number.isFinite(el.duration) && el.duration > 0) {
          if (Math.abs(store.duration - el.duration) > 0.5) store.setDuration(el.duration);
          if (now - lastUi > 240) {
            lastUi = now;
            store.setPosition(el.currentTime);
          }
        }
      } else if (clock.running) {
        const position = clock.base + (now - clock.wallAt) / 1000;
        const dur = store.duration || store.current()?.duration || 0;
        if (dur && position >= dur) {
          clock.base = 0;
          clock.wallAt = now;
          commitListenFlush(true);
          void store.next(false);
        } else if (now - lastUi > 240) {
          lastUi = now;
          store.setPosition(position);
        }
      }

      /* 收听时长：单帧增量上限 4200ms，攒够 5s 落一次账（原版同规则） */
      if (clock.running && el && !el.paused && lastTickRef.current) {
        listenAccRef.current += clamp(now - lastTickRef.current, 0, 4200);
        if (listenAccRef.current >= 5000) {
          commitListenTick(listenAccRef.current);
          listenAccRef.current = 0;
        }
      }
      lastTickRef.current = now;

      sampleLevels();
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const sampleLevels = () => {
    const analyser = analyserRef.current;
    if (!analyser) {
      levels.ready = false;
      return;
    }

    const freq = freqRef.current;
    const time = timeRef.current;
    analyser.getByteFrequencyData(freq as Uint8Array<ArrayBuffer>);
    analyser.getByteTimeDomainData(time as Uint8Array<ArrayBuffer>);
    levels.spectrum = freq;
    levels.waveform = time;

    const band = (from: number, to: number) => {
      let sum = 0;
      const a = Math.max(0, Math.floor(from / BIN_HZ_APPROX));
      const b = Math.min(freq.length - 1, Math.floor(to / BIN_HZ_APPROX));
      for (let i = a; i <= b; i++) sum += freq[i]!;
      return b >= a ? sum / (b - a + 1) / 255 : 0;
    };

    const bass = band(20, 140);
    const mid = band(140, 2000);
    const treble = band(2000, 8000);
    const energy = clamp(bass * 0.6 + mid * 0.3 + treble * 0.1, 0, 1);

    levels.bass = bass;
    levels.mid = mid;
    levels.treble = treble;
    levels.audioEnergy = energy;

    levels.smoothBass += (bass - levels.smoothBass) * 0.16;
    levels.smoothMid += (mid - levels.smoothMid) * 0.14;
    levels.smoothTreb += (treble - levels.smoothTreb) * 0.12;
    levels.smoothEnergy += (energy - levels.smoothEnergy) * 0.18;

    levels.bassPeak = Math.max(bass, levels.bassPeak * 0.985);
    levels.midPeak = Math.max(mid, levels.midPeak * 0.985);
    levels.treblePeak = Math.max(treble, levels.treblePeak * 0.985);
    levels.energyPeak = Math.max(energy, levels.energyPeak * 0.99);

    /* onset：能量抬升超过上一帧一定量，且高于本帧均值 */
    const delta = energy - prevEnergyRef.current;
    prevEnergyRef.current = energy;
    if (delta > 0.055 && energy > levels.smoothEnergy * 1.05) {
      levels.beatOnsetFlag = true;
      levels.beatPulse = clamp(levels.beatPulse + delta * 4.2, 0, 1.6);
      levels.lastStrongDrop = performance.now();
    } else {
      levels.beatOnsetFlag = false;
    }
    levels.beatPulse *= 0.905;
    levels.ready = true;
  };

  return { audioRef };
}
