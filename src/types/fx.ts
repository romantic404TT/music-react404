/**
 * 视觉参数。键名逐字取自 public/js/modules/00-state/04-fx-defaults.js 的 fxDefaults。
 *
 * 原版有约 190 个键（USER_FX_SHARE_KEYS）。本工程只实现驱动简化粒子舞台所需的子集，
 * 未实现的键不在此声明——不是遗漏，是刻意不假装全量复刻。
 */
export interface FxState {
  /** 0..12，见 PRESET_META */
  preset: number;
  intensity: number;
  cinemaShake: number;
  depth: number;
  coverResolution: number;
  point: number;
  speed: number;
  twist: number;
  color: number;
  scatter: number;
  bgFade: number;
  bloomStrength: number;
  bloom: boolean;
  edge: boolean;
  aiDepth: boolean;
  floatLayer: boolean;
  cinema: boolean;

  /* ---- 歌词 ---- */
  particleLyrics: boolean;
  lyricGlow: boolean;
  lyricGlowBeat: boolean;
  lyricGlowLinked: boolean;
  lyricGlowStrength: number;
  lyricGlowColor: string;
  lyricBackgroundAdapt: number;
  lyricScale: number;
  lyricOffsetX: number;
  lyricOffsetY: number;
  lyricOffsetZ: number;
  lyricTiltX: number;
  lyricTiltY: number;
  lyricColorMode: 'auto' | 'custom';
  lyricColor: string;
  lyricHighlightMode: 'auto' | 'custom';
  lyricHighlightColor: string;
  lyricDisplayMode: 'single' | 'dual' | 'triple' | 'cinema' | 'custom';
  lyricTranslationMode: 'off' | 'current' | 'dual' | 'multi';
  lyricMotionStyle: 'glass' | 'smooth' | 'float' | 'quick' | 'shine' | 'glitch';
  lyricCustomLineCount: number;
  lyricContextOpacity: number;
  lyricContextSpread: number;
  lyricTranslationGap: number;
  lyricTranslationScale: number;
  lyricTranslationOpacity: number;
  lyricEdgeFade: number;
  lyricFont: 'sans' | 'serif' | 'mono';
  lyricLetterSpacing: number;
  lyricLineHeight: number;
  lyricWeight: number;
  lyricVerticalFloat: boolean;
  lyricPauseHold: boolean;
  lyricCameraLock: boolean;

  /* ---- 背景与配色 ---- */
  visualTintMode: 'auto' | 'custom';
  visualTintColor: string;
  uiAccentColor: string;
  homeAccentColor: string;
  homeIconColor: string;
  visualIconColor: string;
  backgroundColorMode: 'cover' | 'solid' | 'image';
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundGlassOpacity: number;
  backgroundStarRiver: boolean;
  coverBackdropAdapt: boolean;
  /** 原版控制台玻璃色差滑条 */
  controlGlassChromaticOffset: number;

  /* ---- 歌单面板玻璃 ---- */
  playlistPanelGlassBlur: number;
  playlistPanelGlassDensity: number;
  playlistPanelOpenDuration: number;
  playlistPanelCloseDuration: number;

  /* ---- 3D 歌单架（DOM 侧只做开关与配色，几何在 GL 里） ---- */
  shelf: 'off' | 'side' | 'stage';
  shelfPresence: 'auto' | 'always';
  shelfCameraMode: 'dynamic' | 'static';
  shelfPinnedOpen: boolean;
  shelfShowPodcasts: boolean;
  shelfMergeCollections: boolean;
  shelfAccentColor: string;
  shelfSize: number;
  shelfOpacity: number;
  shelfBgOpacity: number;
  shelfAngleY: number;
  shelfOffsetX: number;
  shelfOffsetY: number;
  shelfOffsetZ: number;

  /* ---- 镜头 ---- */
  cam: 'off' | 'gesture';
  cameraViewMode: 'orbit' | 'free';

  /* ---- 桌面歌词 ---- */
  desktopLyrics: boolean;
  desktopLyricsSize: number;
  desktopLyricsOpacity: number;
  desktopLyricsY: number;
  desktopLyricsClickThrough: boolean;
  desktopLyricsCinema: boolean;
  desktopLyricsHighlight: boolean;
}

export const FX_DEFAULTS: FxState = {
  preset: 0,
  intensity: 0.85,
  cinemaShake: 0.5,
  depth: 0.2,
  coverResolution: 1.55,
  point: 1.0,
  speed: 1.0,
  twist: 0.0,
  color: 1.10,
  scatter: 0.0,
  bgFade: 0.20,
  bloomStrength: 0.62,
  bloom: false,
  edge: false,
  aiDepth: false,
  floatLayer: false,
  cinema: true,

  particleLyrics: true,
  lyricGlow: true,
  lyricGlowBeat: true,
  lyricGlowLinked: true,
  lyricGlowStrength: 0.28,
  lyricGlowColor: '#9db8cf',
  lyricBackgroundAdapt: 0.72,
  lyricScale: 1.0,
  lyricOffsetX: 0,
  lyricOffsetY: 0,
  lyricOffsetZ: 0,
  lyricTiltX: 0,
  lyricTiltY: 0,
  lyricColorMode: 'auto',
  lyricColor: '#7ec8d8',
  lyricHighlightMode: 'auto',
  lyricHighlightColor: '#fff0b8',
  lyricDisplayMode: 'cinema',
  lyricTranslationMode: 'multi',
  lyricMotionStyle: 'float',
  lyricCustomLineCount: 10,
  lyricContextOpacity: 0.54,
  lyricContextSpread: 1.96,
  lyricTranslationGap: 0.92,
  lyricTranslationScale: 0.65,
  lyricTranslationOpacity: 0.86,
  lyricEdgeFade: 0.32,
  lyricFont: 'sans',
  lyricLetterSpacing: 0,
  lyricLineHeight: 1.0,
  lyricWeight: 750,
  lyricVerticalFloat: true,
  lyricPauseHold: true,
  lyricCameraLock: false,

  visualTintMode: 'auto',
  visualTintColor: '#9db8cf',
  uiAccentColor: '#ffffff',
  homeAccentColor: '#ffffff',
  homeIconColor: '#ffffff',
  visualIconColor: '#ffffff',
  backgroundColorMode: 'cover',
  backgroundColor: '#000000',
  backgroundOpacity: 1,
  backgroundGlassOpacity: 0,
  backgroundStarRiver: true,
  coverBackdropAdapt: true,
  controlGlassChromaticOffset: 50,

  playlistPanelGlassBlur: 14,
  playlistPanelGlassDensity: 0.55,
  playlistPanelOpenDuration: 0.72,
  playlistPanelCloseDuration: 0.48,

  shelf: 'off',
  shelfPresence: 'auto',
  shelfCameraMode: 'dynamic',
  shelfPinnedOpen: false,
  shelfShowPodcasts: false,
  shelfMergeCollections: false,
  shelfAccentColor: '#9db8cf',
  shelfSize: 1,
  shelfOpacity: 1,
  shelfBgOpacity: 0.2,
  shelfAngleY: -15,
  shelfOffsetX: 0,
  shelfOffsetY: 0,
  shelfOffsetZ: 0,

  cam: 'off',
  cameraViewMode: 'orbit',

  desktopLyrics: false,
  desktopLyricsSize: 1.0,
  desktopLyricsOpacity: 0.92,
  desktopLyricsY: 0.76,
  desktopLyricsClickThrough: false,
  desktopLyricsCinema: false,
  desktopLyricsHighlight: false,
};

/**
 * 视觉预设元信息，名称取自 07-fx/00-preset-archive-data.js 的 presetMeta。
 * MAX_VISUAL_PRESET_INDEX = 12，原版 13 个预设；本工程实现标了 implemented 的 4 个，
 * 其余在控制台可见（含原版 accent 配色）但会提示尚未复刻。
 */
export interface PresetMeta {
  index: number;
  name: string;
  desc: string;
  accent?: string;
  accent2?: string;
  implemented: boolean;
}

export const PRESET_META: PresetMeta[] = [
  { index: 0, name: 'emily专辑封面', desc: '封面粒子 · 快速入场', implemented: true },
  { index: 1, name: '滚筒', desc: '横向滚动的粒子带', implemented: true },
  { index: 2, name: '星球', desc: '球形点云 · 深度呼吸', implemented: true },
  { index: 3, name: '虚空', desc: '散点深渊', implemented: false },
  { index: 4, name: '唱片', desc: '同心圆纹路', implemented: false },
  { index: 5, name: '星河', desc: '长尾流场', implemented: false },
  { index: 6, name: '安魂', desc: '骷髅 · YUI7W（依赖 assets/skull-decimation-points.bin）', implemented: false },
  { index: 7, name: '音域回响', desc: 'Sonic-Topography · 作者 Ajin', implemented: false },
  { index: 8, name: '音域回响 · Wallpaper', desc: '作者 CmzYa', implemented: false },
  { index: 9, name: '月蚀圣环', desc: 'ECLIPSE HALO', accent: '#e8c98d', accent2: '#8fd8ff', implemented: false },
  { index: 10, name: '雨幕霓虹', desc: 'NEON DRIZZLE', accent: '#67efff', accent2: '#ff6bb5', implemented: false },
  { index: 11, name: '折光蝶群', desc: 'PRISM FLOCK', accent: '#f0d7ff', accent2: '#75e6d1', implemented: false },
  { index: 12, name: '深海绽放', desc: 'ABYSSAL BLOOM', accent: '#75f0d0', accent2: '#8178ff', implemented: false },
];

/** 原版展示顺序（presetDisplayOrder），非自然序号 */
export const PRESET_DISPLAY_ORDER = [0, 9, 10, 11, 12, 6, 7, 8, 5, 4, 2, 1, 3];

export const MAX_VISUAL_PRESET_INDEX = 12;
export const VISUAL_PRESET_SCHEMA = 'skull-preset-v2';

/** 一个用户存档槽：mineradio-user-fx-archives-v1 的数组元素 */
export interface FxArchiveSlot {
  name: string;
  createdAt: number;
  savedAt: number;
  snapshot: FxState & { visualPresetSchema: string };
}
