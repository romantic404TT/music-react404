import { apiGet } from '@/lib/http';
import type { DiscoverHomeResponse, WeatherRadioResponse } from '@/types/api';
import type { PodcastChannel, Track } from '@/types/track';
import type { Provider } from '@/types/track';

/** 首页聚合数据与天气电台 */

export function fetchDiscoverHome(signal?: AbortSignal): Promise<DiscoverHomeResponse> {
  return apiGet<DiscoverHomeResponse>('/api/discover/home', undefined, signal);
}

export interface WeatherLocation {
  ok: boolean;
  city: string;
  lat: number;
  lon: number;
  resolvedBy: string;
}

export function fetchIpLocation(signal?: AbortSignal): Promise<WeatherLocation> {
  return apiGet<WeatherLocation>('/api/weather/ip-location', undefined, signal);
}

export interface WeatherRadio {
  ok: boolean;
  location: WeatherRadioResponse['location'];
  weather: Record<string, unknown> | null;
  queue: Track[];
  fallback: boolean;
  reason?: string;
}

/**
 * 天气电台。原版：坐标缺失或 Open-Meteo 超时时返回临时电台队列，
 * 所以 fallback 分支不是错误，是正常降级路径，界面上要能区分。
 */
export function fetchWeatherRadio(lat: number, lon: number, city?: string, signal?: AbortSignal): Promise<WeatherRadio> {
  return apiGet<WeatherRadio>('/api/weather/radio', { lat, lon, city }, signal);
}

/** 平台推荐弹窗的数据源（酷狗 recommendations 与汽水 feed） */
export function fetchPlatformRecommendations(provider: Provider, signal?: AbortSignal): Promise<{ songs: Track[] }> {
  const path = provider === 'kugou' ? '/api/kugou/recommendations' : '/api/qishui/feed';
  return apiGet<{ songs: Track[] }>(path, undefined, signal);
}

export interface PodcastList {
  code: number;
  podcasts?: PodcastChannel[];
  categories?: PodcastChannel[];
}

export function fetchHotPodcasts(limit = 12, signal?: AbortSignal): Promise<PodcastList> {
  return apiGet<PodcastList>('/api/podcast/hot', { limit }, signal);
}
