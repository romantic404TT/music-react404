/**
 * 音频电平的单例可变容器。
 *
 * 刻意不进 Zustand：这些值每帧更新，放进 React 状态会让整棵树每秒重渲染 60 次。
 * 原版同理，用的是 window 上的 bass/mid/treble/audioEnergy/beatPulse 全局 var
 * （00-state/00-core-stores.js），粒子循环直接读取，不经任何响应式层。
 */

export interface AudioLevels {
  bass: number;
  mid: number;
  treble: number;
  audioEnergy: number;
  beatPulse: number;
  smoothBass: number;
  smoothMid: number;
  smoothTreb: number;
  smoothEnergy: number;
  bassPeak: number;
  midPeak: number;
  treblePeak: number;
  energyPeak: number;
  beatOnsetFlag: boolean;
  lastStrongDrop: number;
  bpm: number;
  /** FFT_SIZE=2048，与原版一致 */
  spectrum: Uint8Array;
  waveform: Uint8Array;
  ready: boolean;
}

export const FFT_SIZE = 2048;
export const BEAT_FFT_SIZE = 2048;

export const levels: AudioLevels = {
  bass: 0,
  mid: 0,
  treble: 0,
  audioEnergy: 0,
  beatPulse: 0,
  smoothBass: 0,
  smoothMid: 0,
  smoothTreb: 0,
  smoothEnergy: 0,
  bassPeak: 0,
  midPeak: 0,
  treblePeak: 0,
  energyPeak: 0,
  beatOnsetFlag: false,
  lastStrongDrop: 0,
  bpm: 0,
  spectrum: new Uint8Array(FFT_SIZE / 2),
  waveform: new Uint8Array(FFT_SIZE),
  ready: false,
};

/** 供 useAnalyser 每帧写入 */
export function resetLevels(): void {
  levels.bass = 0;
  levels.mid = 0;
  levels.treble = 0;
  levels.audioEnergy = 0;
  levels.beatPulse = 0;
  levels.ready = false;
}
