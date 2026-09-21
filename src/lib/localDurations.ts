import { STORAGE_KEYS, readJson, writeJson } from './storage';

/**
 * 本地文件的时长在构建期拿不到（不为此引解码库，也不猜码率），
 * 所以第一次播放时由 audio 元素报出真实 duration 后记进 localStorage，
 * 下次启动列表里直接就是准的。没测过的曲目是 0，界面显示 –:–。
 */

function load(): Record<string, number> {
  return readJson<Record<string, number>>(STORAGE_KEYS.localDurations, {});
}

export function rememberedDuration(id: string): number {
  return load()[id] ?? 0;
}

export function rememberDuration(id: string, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const store = load();
  const rounded = Math.round(seconds);
  if (store[id] === rounded) return;
  store[id] = rounded;
  writeJson(STORAGE_KEYS.localDurations, store);
}
