import { apiGet, apiPost } from '@/lib/http';
import type { AppVersionResponse, UpdateLatestResponse } from '@/types/api';
import type { Provider, Track } from '@/types/track';

/** 播客 / 电台 / DJ 长音频 */

export interface PodcastProgramDto {
  id: string;
  name: string;
  desc?: string;
  cover?: string;
  duration?: number;
  listenerCount?: number;
  publishTime?: number;
  mainUrl?: string;
}

export function fetchPodcastDetail(id: string, signal?: AbortSignal) {
  return apiGet<{ code: number; podcast: unknown; programs: PodcastProgramDto[] }>(
    '/api/podcast/detail', { id }, signal,
  );
}

export function fetchPodcastPrograms(rid: string, limit = 20, offset = 0, signal?: AbortSignal) {
  return apiGet<{ code: number; programs: PodcastProgramDto[]; more: boolean; lastTime: number }>(
    '/api/podcast/programs', { rid, limit, offset }, signal,
  );
}

export function fetchMyPodcasts(signal?: AbortSignal) {
  return apiGet<{ code: number; subscribe: { id: string; name: string; cover?: string }[]; count: number }>(
    '/api/podcast/my', undefined, signal,
  );
}

export interface BeatMap {
  bpm: number;
  duration: number;
  intro: number;
  beats: number[];
  strong: number[];
  generatedBy?: string;
}

/**
 * DJ 离线锁拍（/api/podcast/dj-beatmap → {ok, map}）。
 * 真实后端跑 dj-analyzer.js + music-tempo；本工程拿确定的拍点图，
 * 因此 DJ 视觉模式的节奏是真实的（来自 mock 的 BPM），但不是歌曲实测结果。
 */
export async function fetchDjBeatmap(url: string, duration: number, intro = 0, signal?: AbortSignal): Promise<BeatMap | null> {
  const res = await apiGet<{ ok: boolean; map: BeatMap }>('/api/podcast/dj-beatmap', { url, duration, intro }, signal)
    .catch(() => null);
  return res?.ok ? res.map : null;
}

export function podcastTrackFrom(program: PodcastProgramDto, channel: { id: string; name: string; cover?: string }): Track {
  const duration = program.duration ?? 0;
  return {
    provider: 'netease',
    source: 'podcast',
    type: 'podcast',
    id: program.id,
    name: program.name,
    artist: channel.name,
    album: channel.name,
    cover: program.cover ?? channel.cover,
    duration,
    durationMs: duration * 1000,
    programId: program.id,
    radioId: channel.id,
    radioName: channel.name,
    playable: true,
  };
}

/* ===================== 听歌统计 ===================== */

export interface ListenReportPayload {
  key: string;
  name: string;
  artist?: string;
  provider: Provider;
  listenMs: number;
  completed: boolean;
  context: string;
}

export function reportListen(payload: ListenReportPayload): Promise<{ ok: boolean }> {
  return apiPost('/api/listen/report', payload);
}

export interface ListenTotal {
  ok: boolean;
  totalListenMs: number;
  sessions: number;
  daily: Record<string, { listenMs: number; sessions: number; completed: number }>;
}

export function fetchListenTotal(provider?: Provider, signal?: AbortSignal): Promise<ListenTotal> {
  return apiGet<ListenTotal>('/api/listen/total', { provider }, signal);
}

/* ===================== 版本与更新 ===================== */

export function fetchAppVersion(signal?: AbortSignal): Promise<AppVersionResponse> {
  return apiGet<AppVersionResponse>('/api/app/version', undefined, signal);
}

export function fetchUpdateLatest(signal?: AbortSignal): Promise<UpdateLatestResponse> {
  return apiGet<UpdateLatestResponse>('/api/update/latest', undefined, signal);
}
