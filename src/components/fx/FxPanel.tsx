import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { IconCheck, IconChevron, IconClose, IconRefresh, IconVisual } from '@/components/ui/Icons';
import { Segmented, Slider } from '@/components/ui/primitives';
import { formatDateStamp } from '@/lib/format';
import { useFxStore } from '@/store/fxStore';
import { useUiStore } from '@/store/uiStore';
import { FX_DEFAULTS, MAX_VISUAL_PRESET_INDEX, PRESET_DISPLAY_ORDER, PRESET_META } from '@/types/fx';
import type { FxState, PresetMeta } from '@/types/fx';

/**
 * 视觉控制台（原版 #fx-fab / #fx-panel）。
 *
 * 原版是一块贴在窗口右缘的长滚动面板：预设网格、十几个滑条、颜色选择器、
 * 用户存档 13 槽、导入导出，全塞在同一页里靠折叠块分段。这里把同样的控件
 * 拆成预设 / 外观 / 歌词 / 动态 / 高级 五页签，每个控件直接读写 useFxStore，
 * 参数名与 FxState 逐字一致，所以舞台与歌词层不需要额外适配层。
 *
 * 有一条刻意保留的诚实性：只有真正被渲染层消费的开关才假装生效，
 * 未复刻的部分（GLSL 预设、WebGL 歌单架、图片背景、深度图）在 UI 上明说，
 * 点击时要么提示要么只存偏好，不伪造效果。
 */

type FxSection = 'preset' | 'look' | 'lyric' | 'motion' | 'advanced';

/** FxState 里按值类型分出来的键族，滑条与开关据此拿到精确的 setParam 重载 */
type NumKey = { [K in keyof FxState]-?: FxState[K] extends number ? K : never }[keyof FxState];
type BoolKey = { [K in keyof FxState]-?: FxState[K] extends boolean ? K : never }[keyof FxState];

const SECTION_TABS: { value: FxSection; label: string }[] = [
  { value: 'preset', label: '预设' },
  { value: 'look', label: '外观' },
  { value: 'lyric', label: '歌词' },
  { value: 'motion', label: '动态' },
  { value: 'advanced', label: '高级' },
];

const AUTO_CUSTOM: { value: 'auto' | 'custom'; label: string }[] = [
  { value: 'auto', label: '自动' },
  { value: 'custom', label: '自定义' },
];

const TINT_MODES: { value: FxState['visualTintMode']; label: string }[] = [
  { value: 'auto', label: '封面取色' },
  { value: 'custom', label: '固定色' },
];

const BG_MODES: { value: FxState['backgroundColorMode']; label: string }[] = [
  { value: 'cover', label: '封面' },
  { value: 'solid', label: '纯色' },
  { value: 'image', label: '图片' },
];

const DISPLAY_MODES: { value: FxState['lyricDisplayMode']; label: string }[] = [
  { value: 'single', label: '单行' },
  { value: 'dual', label: '双行' },
  { value: 'triple', label: '三行' },
  { value: 'cinema', label: '沉浸' },
  { value: 'custom', label: '自定' },
];

const TRANSLATION_MODES: { value: FxState['lyricTranslationMode']; label: string }[] = [
  { value: 'off', label: '关闭' },
  { value: 'current', label: '当前' },
  { value: 'dual', label: '双行' },
  { value: 'multi', label: '多行' },
];

const MOTION_STYLES: { value: FxState['lyricMotionStyle']; label: string }[] = [
  { value: 'glass', label: '玻璃' },
  { value: 'smooth', label: '柔滑' },
  { value: 'float', label: '漂浮' },
  { value: 'quick', label: '快速' },
  { value: 'shine', label: '线光' },
  { value: 'glitch', label: '故障' },
];

const LYRIC_FONTS: { value: FxState['lyricFont']; label: string }[] = [
  { value: 'sans', label: '默认' },
  { value: 'serif', label: '衬线' },
  { value: 'mono', label: '等宽' },
];

const CAM_MODES: { value: FxState['cam']; label: string }[] = [
  { value: 'off', label: '关闭' },
  { value: 'gesture', label: '手势' },
];

const CAMERA_VIEWS: { value: FxState['cameraViewMode']; label: string }[] = [
  { value: 'orbit', label: '环绕' },
  { value: 'free', label: '自由' },
];

const SHELF_MODES: { value: FxState['shelf']; label: string }[] = [
  { value: 'off', label: '关闭' },
  { value: 'side', label: '侧栏' },
  { value: 'stage', label: '舞台' },
];

const SHELF_PRESENCE: { value: FxState['shelfPresence']; label: string }[] = [
  { value: 'auto', label: '自动' },
  { value: 'always', label: '常驻' },
];

const SHELF_CAMERA_MODES: { value: FxState['shelfCameraMode']; label: string }[] = [
  { value: 'dynamic', label: '动态' },
  { value: 'static', label: '静止' },
];

/** 原版 presetDisplayOrder：展示顺序与自然序号不同，这里保持一致 */
const PRESET_CARDS: PresetMeta[] = PRESET_DISPLAY_ORDER.map(
  (index) => PRESET_META.find((meta) => meta.index === index),
).filter((meta): meta is PresetMeta => meta !== undefined);

const ARCHIVE_SLOTS: number[] = Array.from({ length: MAX_VISUAL_PRESET_INDEX + 1 }, (_unused, i) => i);

const IMPLEMENTED_PRESETS = PRESET_META.filter((meta) => meta.implemented).length;

const pct = (v: number) => `${Math.round(v * 100)}%`;
const plain = (v: number) => String(Math.round(v));
const degree = (v: number) => `${Math.round(v)}°`;
const seconds = (v: number) => `${Math.round(v * 1000)} ms`;

/* ------------------------------------------------------------------ 局部控件 */

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="label-caps mb-1.5">{title}</div>
      {note && (
        <p className="mb-2 text-[10.5px] leading-relaxed text-[var(--fc-muted)]">{note}</p>
      )}
      {children}
    </section>
  );
}

/** 数值滑条行：键名即 FxState 字段，读值与写入都走 store */
function SliderRow({
  k, label, min = 0, max = 1, step = 0.01, format,
}: {
  k: NumKey; label: string; min?: number; max?: number; step?: number; format?: (v: number) => string;
}) {
  const value = useFxStore((s) => s.fx[k]);
  const setParam = useFxStore((s) => s.setParam);
  return (
    <Slider
      className="py-[5px]"
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      format={format}
      onChange={(v) => setParam(k, v)}
    />
  );
}

/** 带标签的开关行（Tailwind 画的胶囊 switch），对应原版 .fx-toggle */
function ToggleRow({ k, label, hint }: { k: BoolKey; label: string; hint?: string }) {
  const on = useFxStore((s) => s.fx[k]);
  const setParam = useFxStore((s) => s.setParam);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setParam(k, !on)}
      className="flex w-full items-center justify-between gap-3 rounded-[10px] px-1 py-[7px] text-left transition-colors hover:bg-white/5"
    >
      <span className="min-w-0">
        <span className="block truncate text-[12px] text-[var(--fc-ink-2)]">{label}</span>
        {hint && <span className="block truncate text-[10.5px] text-[var(--fc-muted)]">{hint}</span>}
      </span>
      <span
        className="relative inline-flex h-[18px] w-[33px] shrink-0 items-center rounded-full border"
        style={{
          borderColor: on ? 'var(--glass-border)' : 'var(--glass-border-soft)',
          background: on ? 'rgba(var(--home-accent-rgb), .22)' : 'rgba(255, 255, 255, .07)',
          transition: 'background .18s var(--ease-mr), border-color .18s var(--ease-mr)',
        }}
      >
        <span
          className="absolute left-[2px] h-[12px] w-[12px] rounded-full"
          style={{
            transform: `translateX(${on ? 15 : 0}px)`,
            background: on ? 'var(--home-accent)' : 'var(--fc-muted)',
            transition: 'transform .18s var(--ease-mr), background .18s var(--ease-mr)',
          }}
        />
      </span>
    </button>
  );
}

/** 标签 + 胶囊单选，值类型由调用方的 FxState 字段推出来 */
function SegRow<T extends string>({
  label, hint, value, options, onChange,
}: {
  label: string; hint?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-[5px]">
      <span className="min-w-0 text-[12px] text-[var(--fc-ink-2)]">
        {label}
        {hint && <span className="ml-1.5 text-[10.5px] text-[var(--fc-muted)]">{hint}</span>}
      </span>
      <Segmented value={value} options={options} onChange={onChange} />
    </div>
  );
}

/** 颜色行：色块里嵌一个透明的 input[type=color]，对应原版 .lyric-color-row */
function ColorRow({
  label, value, hint, disabled, onChange, onReset,
}: {
  label: string; value: string; hint?: string; disabled?: boolean;
  onChange: (v: string) => void; onReset: () => void;
}) {
  return (
    <div className={`flex items-center gap-2.5 py-[6px] ${disabled ? 'opacity-45' : ''}`}>
      <span
        className="relative h-7 w-7 shrink-0 overflow-hidden rounded-[9px] border"
        style={{ background: value, borderColor: 'var(--glass-border-soft)' }}
      >
        <input
          type="color"
          value={value}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          className="absolute h-[200%] w-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer border-0 bg-transparent p-0"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] text-[var(--fc-ink-2)]">{label}</span>
        <span className="block truncate font-mono text-[10px] uppercase text-[var(--fc-muted)]">
          {hint ?? value}
        </span>
      </span>
      <button type="button" className="btn h-[24px] shrink-0 !px-2 !text-[11px]" onClick={onReset}>
        默认
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- 预设 */

function PresetPane() {
  const preset = useFxStore((s) => s.fx.preset);
  const applyPresetIndex = useFxStore((s) => s.applyPresetIndex);
  const pushToast = useUiStore((s) => s.pushToast);

  return (
    <Group
      title="视觉预设"
      note={`原版有 13 个预设、各自一段 GLSL。本次只复刻 ${IMPLEMENTED_PRESETS} 个，其余卡片照原顺序展示配色，但点进去会说明未复刻。`}
    >
      <div className="grid grid-cols-2 gap-2">
        {PRESET_CARDS.map((meta) => {
          const active = preset === meta.index;
          return (
            <button
              key={meta.index}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (meta.implemented) {
                  applyPresetIndex(meta.index);
                  return;
                }
                pushToast(`「${meta.name}」预设的 GLSL 未在本次复刻范围内`, 'warn');
              }}
              className="flex flex-col items-start gap-1 rounded-card border p-2.5 text-left transition-colors"
              style={{
                borderColor: active ? 'var(--home-accent)' : 'var(--glass-border-soft)',
                background: active ? 'rgba(var(--home-accent-rgb), .10)' : 'rgba(255, 255, 255, .035)',
              }}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="font-mono text-[9.5px] tracking-[.16em] text-[var(--fc-muted)]">
                  P{String(meta.index).padStart(2, '0')}
                </span>
                {active && <IconCheck size={12} className="text-[var(--home-accent)]" />}
              </span>
              <span className="truncate text-[12.5px] text-[var(--fc-ink)]">{meta.name}</span>
              <span className="line-clamp-2 text-[10.5px] leading-snug text-[var(--fc-muted)]">{meta.desc}</span>
              <span className="mt-0.5 flex w-full items-center gap-1.5">
                {meta.accent && (
                  <i className="h-2.5 w-2.5 rounded-full" style={{ background: meta.accent, boxShadow: `0 0 9px ${meta.accent}` }} />
                )}
                {meta.accent2 && (
                  <i className="h-2.5 w-2.5 rounded-full" style={{ background: meta.accent2, boxShadow: `0 0 9px ${meta.accent2}` }} />
                )}
                <span
                  className="ml-auto font-mono text-[9px] tracking-widest"
                  style={{ color: meta.implemented ? 'var(--home-accent)' : 'var(--champagne)' }}
                >
                  {meta.implemented ? 'READY' : 'NO GLSL'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Group>
  );
}

/* ---------------------------------------------------------------------- 外观 */

function LookPane() {
  const fx = useFxStore((s) => s.fx);
  const setParam = useFxStore((s) => s.setParam);

  return (
    <>
      <Group title="粒子主控" note="这几项直接喂给舞台的 uniform，拖动即时生效。">
        <SliderRow k="intensity" label="律动强度" min={0.2} max={1.6} />
        <SliderRow k="depth" label="立体感" min={0.2} max={1.8} />
        <SliderRow k="coverResolution" label="封面清晰度" min={0.75} max={1.55} />
        <SliderRow k="point" label="粒子尺寸" min={0.5} max={2.2} />
        <SliderRow k="speed" label="流速" min={0.2} max={2.5} />
        <SliderRow k="color" label="色彩张力" min={0.5} max={2} />
        <SliderRow k="scatter" label="离散感" min={0} max={0.5} />
        <SliderRow k="bgFade" label="背景压缩" min={0} max={1.2} />
        <SliderRow k="bloomStrength" label="溢光强度" min={0} max={1.6} />
        <ToggleRow k="bloom" label="溢光" hint="关闭时舞台只保留 35% 溢光强度" />
      </Group>

      <Group title="配色">
        <SegRow
          label="视觉主色来源"
          value={fx.visualTintMode}
          options={TINT_MODES}
          onChange={(v) => setParam('visualTintMode', v)}
        />
        <ColorRow
          label="视觉主色"
          value={fx.visualTintColor}
          hint={fx.visualTintMode === 'auto' ? `${fx.visualTintColor} · 弱着色` : fx.visualTintColor}
          onChange={(v) => setParam('visualTintColor', v)}
          onReset={() => setParam('visualTintColor', FX_DEFAULTS.visualTintColor)}
        />
      </Group>

      <Group
        title="背景与玻璃"
        note="「图片」用歌曲文件夹里那张图铺开当背景（本地曲目才有）；「封面」把封面糊成氛围光；桌面端的自选图片裁切本次不接管。"
      >
        <SegRow
          label="背景模式"
          value={fx.backgroundColorMode}
          options={BG_MODES}
          onChange={(v) => setParam('backgroundColorMode', v)}
        />
        <ColorRow
          label="背景纯色"
          value={fx.backgroundColor}
          disabled={fx.backgroundColorMode !== 'solid'}
          onChange={(v) => setParam('backgroundColor', v)}
          onReset={() => setParam('backgroundColor', FX_DEFAULTS.backgroundColor)}
        />
        <SliderRow k="backgroundOpacity" label="背景透明度" format={pct} />
        <SliderRow k="backgroundGlassOpacity" label="玻璃层透明" format={pct} />
        <SliderRow
          k="controlGlassChromaticOffset"
          label="控制台玻璃色差"
          min={30}
          max={140}
          step={1}
          format={plain}
        />
      </Group>
    </>
  );
}

/* ---------------------------------------------------------------------- 歌词 */

function LyricPane() {
  const fx = useFxStore((s) => s.fx);
  const setParam = useFxStore((s) => s.setParam);

  return (
    <>
      <Group title="歌词渲染">
        <ToggleRow k="particleLyrics" label="粒子歌词" hint="关闭后歌词层整块不渲染" />
        <ToggleRow k="lyricGlow" label="歌词溢光" />
        <ToggleRow k="lyricGlowBeat" label="溢光跟鼓点" hint="鼓点帧才提升辉光" />
        <ToggleRow k="lyricVerticalFloat" label="整体竖直浮动" hint="舞台摄像机随之呼吸" />
        <SliderRow k="lyricGlowStrength" label="溢光强度" min={0} max={0.85} />
      </Group>

      <Group title="行数与翻译">
        <SegRow
          label="显示行数"
          value={fx.lyricDisplayMode}
          options={DISPLAY_MODES}
          onChange={(v) => setParam('lyricDisplayMode', v)}
        />
        <SegRow
          label="双语翻译"
          value={fx.lyricTranslationMode}
          options={TRANSLATION_MODES}
          onChange={(v) => setParam('lyricTranslationMode', v)}
        />
        <SegRow
          label="动画风格"
          hint="仅记录偏好"
          value={fx.lyricMotionStyle}
          options={MOTION_STYLES}
          onChange={(v) => setParam('lyricMotionStyle', v)}
        />
        <SegRow
          label="字体"
          value={fx.lyricFont}
          options={LYRIC_FONTS}
          onChange={(v) => setParam('lyricFont', v)}
        />
        <SliderRow k="lyricContextOpacity" label="上下句清晰" min={0.25} max={1} format={pct} />
        <SliderRow k="lyricContextSpread" label="上下句间距" min={0.6} max={2.4} />
      </Group>

      <Group title="排版">
        <SliderRow k="lyricScale" label="歌词大小" min={0.35} max={1.65} />
        <SliderRow k="lyricOffsetY" label="垂直位置" min={-2.4} max={2.7} />
        <SliderRow k="lyricLetterSpacing" label="字间距" min={-0.04} max={0.18} step={0.005} />
        <SliderRow k="lyricLineHeight" label="行距" min={0.72} max={1.8} />
        <SliderRow k="lyricWeight" label="字重" min={500} max={900} step={50} format={plain} />
      </Group>

      <Group title="颜色" note="auto 档由溢光色与封面派生，自定义档才读下面的色值。">
        <SegRow
          label="歌词主色来源"
          value={fx.lyricColorMode}
          options={AUTO_CUSTOM}
          onChange={(v) => setParam('lyricColorMode', v)}
        />
        <ColorRow
          label="歌词主色"
          value={fx.lyricColor}
          disabled={fx.lyricColorMode !== 'custom'}
          onChange={(v) => setParam('lyricColor', v)}
          onReset={() => setParam('lyricColor', FX_DEFAULTS.lyricColor)}
        />
        <SegRow
          label="高亮色来源"
          value={fx.lyricHighlightMode}
          options={AUTO_CUSTOM}
          onChange={(v) => setParam('lyricHighlightMode', v)}
        />
        <ColorRow
          label="歌词高亮色"
          value={fx.lyricHighlightColor}
          disabled={fx.lyricHighlightMode !== 'custom'}
          onChange={(v) => setParam('lyricHighlightColor', v)}
          onReset={() => setParam('lyricHighlightColor', FX_DEFAULTS.lyricHighlightColor)}
        />
        <ToggleRow k="lyricGlowLinked" label="溢光色跟随主色" />
        <ColorRow
          label="歌词溢光色"
          value={fx.lyricGlowColor}
          disabled={fx.lyricGlowLinked}
          onChange={(v) => setParam('lyricGlowColor', v)}
          onReset={() => setParam('lyricGlowColor', FX_DEFAULTS.lyricGlowColor)}
        />
      </Group>
    </>
  );
}

/* ---------------------------------------------------------------------- 动态 */

function MotionPane() {
  const fx = useFxStore((s) => s.fx);
  const setParam = useFxStore((s) => s.setParam);

  return (
    <>
      <Group
        title="镜头与叠加"
        note="电影镜头与镜头晃动进舞台相机；浮空层、边缘检测、AI 深度图原版靠额外 GL 通道，这里只保存开关本身。"
      >
        <ToggleRow k="cinema" label="电影镜头" hint="开启后鼓点才推动镜头晃动" />
        <SliderRow k="cinemaShake" label="镜头晃动" min={0} max={1.8} />
        <ToggleRow k="floatLayer" label="浮空粒子层" />
        <ToggleRow k="aiDepth" label="AI 深度" hint="未接深度模型" />
        <ToggleRow k="edge" label="边缘检测" hint="未接后处理通道" />
        <SliderRow k="twist" label="扭曲" min={0} max={0.6} />
      </Group>

      <Group title="机位">
        <SegRow label="手势镜头" value={fx.cam} options={CAM_MODES} onChange={(v) => setParam('cam', v)} />
        <SegRow
          label="视角模式"
          value={fx.cameraViewMode}
          options={CAMERA_VIEWS}
          onChange={(v) => setParam('cameraViewMode', v)}
        />
      </Group>

      <Group title="桌面歌词" note="独立窗口由 Electron 主进程创建，Web 版只能保存这套偏好。">
        <ToggleRow k="desktopLyrics" label="桌面歌词" hint="需要桌面端另开置顶窗口" />
        {fx.desktopLyrics && (
          <>
            <SliderRow k="desktopLyricsSize" label="字号缩放" min={0.72} max={1.55} />
            <SliderRow k="desktopLyricsOpacity" label="不透明度" min={0.28} max={1} format={pct} />
            <SliderRow k="desktopLyricsY" label="纵向位置" min={0.08} max={0.92} format={pct} />
          </>
        )}
      </Group>
    </>
  );
}

/* ---------------------------------------------------------------------- 高级 */

function ArchiveGrid() {
  const archives = useFxStore((s) => s.archives);
  const previewSlot = useFxStore((s) => s.previewSlot);
  const saveArchive = useFxStore((s) => s.saveArchive);
  const applyArchive = useFxStore((s) => s.applyArchive);
  const deleteArchive = useFxStore((s) => s.deleteArchive);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  return (
    <div className="grid grid-cols-2 gap-2">
      {ARCHIVE_SLOTS.map((slot) => {
        const entry = archives[slot];
        const active = previewSlot === slot;
        return (
          <div
            key={slot}
            className="rounded-card border p-2"
            style={{
              borderColor: active ? 'var(--home-accent)' : 'var(--glass-border-soft)',
              background: active ? 'rgba(var(--home-accent-rgb), .09)' : 'rgba(255, 255, 255, .035)',
            }}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="label-caps">槽 {slot + 1}</span>
              {entry && (
                <span className="truncate font-mono text-[9.5px] text-[var(--fc-muted)]">
                  {formatDateStamp(new Date(entry.savedAt))}
                </span>
              )}
            </div>

            {entry ? (
              <>
                <p className="truncate text-[12px] text-[var(--fc-ink)]" title={entry.name}>{entry.name}</p>
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    className="btn h-[26px] min-w-0 flex-1 !px-2 !text-[11.5px]"
                    onClick={() => applyArchive(slot)}
                  >
                    应用
                    <IconChevron size={11} />
                  </button>
                  <button
                    type="button"
                    className="btn h-[26px] shrink-0 !px-2 !text-[11.5px]"
                    onClick={() => deleteArchive(slot)}
                  >
                    删除
                  </button>
                </div>
              </>
            ) : (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  className="field h-[26px] min-w-0 flex-1 !text-[11.5px]"
                  placeholder="存档名"
                  value={drafts[slot] ?? ''}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [slot]: e.target.value }))}
                />
                <button
                  type="button"
                  className="btn h-[26px] shrink-0 !px-2.5 !text-[11.5px]"
                  onClick={() => {
                    saveArchive(drafts[slot] ?? '', slot);
                    setDrafts((prev) => ({ ...prev, [slot]: '' }));
                  }}
                >
                  保存
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function AdvancedPane() {
  const fx = useFxStore((s) => s.fx);
  const archives = useFxStore((s) => s.archives);
  const setParam = useFxStore((s) => s.setParam);
  const resetFx = useFxStore((s) => s.resetFx);
  const exportArchives = useFxStore((s) => s.exportArchives);
  const importArchives = useFxStore((s) => s.importArchives);
  const pushToast = useUiStore((s) => s.pushToast);
  const [transfer, setTransfer] = useState('');

  const usedSlots = archives.filter(Boolean).length;

  const onExport = () => {
    const json = exportArchives();
    void copyToClipboard(json).then((ok) => {
      if (ok) {
        pushToast(`存档 JSON（${json.length} 字符）已复制到剪贴板`, 'ok');
        return;
      }
      setTransfer(json);
      pushToast('剪贴板被浏览器拒绝，导出内容已放进下方文本框，手动复制即可', 'error');
    });
  };

  const onImport = () => {
    const text = transfer.trim();
    if (!text) {
      pushToast('先把导出的 JSON 粘贴进文本框', 'warn');
      return;
    }
    const ok = importArchives(text);
    pushToast(
      ok ? '用户存档已导入，最多覆盖前 13 槽' : '导入失败：JSON 里必须带 archives 数组',
      ok ? 'ok' : 'error',
    );
    if (ok) setTransfer('');
  };

  return (
    <>
      <Group
        title="3D 歌单架"
        note="歌单架本体是原版的 WebGL 网格，本次复刻没有实现：这里的开关只把偏好写进 fx，切到侧栏或舞台不会出现架子。"
      >
        <SegRow label="歌单架" value={fx.shelf} options={SHELF_MODES} onChange={(v) => setParam('shelf', v)} />
        <SegRow
          label="出现时机"
          value={fx.shelfPresence}
          options={SHELF_PRESENCE}
          onChange={(v) => setParam('shelfPresence', v)}
        />
        <SegRow
          label="架上镜头"
          value={fx.shelfCameraMode}
          options={SHELF_CAMERA_MODES}
          onChange={(v) => setParam('shelfCameraMode', v)}
        />
        <ToggleRow k="shelfPinnedOpen" label="常驻展开" hint="沉浸式退出后按此恢复" />
        <ToggleRow k="shelfShowPodcasts" label="显示播客" />
        <ToggleRow k="shelfMergeCollections" label="合并收藏集" />
        <ColorRow
          label="歌单架主色"
          value={fx.shelfAccentColor}
          onChange={(v) => setParam('shelfAccentColor', v)}
          onReset={() => setParam('shelfAccentColor', FX_DEFAULTS.shelfAccentColor)}
        />
        <SliderRow k="shelfSize" label="歌单架大小" min={0.65} max={1.45} />
        <SliderRow k="shelfOpacity" label="整体透明度" min={0.25} max={1} format={pct} />
        <SliderRow k="shelfAngleY" label="侧向角度" min={-30} max={30} step={1} format={degree} />
      </Group>

      <Group title="歌单面板玻璃" note="面板的雾面与开合时长即时作用于右侧歌单面板。">
        <SliderRow k="playlistPanelGlassBlur" label="面板雾面" min={14} max={60} step={1} format={(v) => `${v.toFixed(0)} px`} />
        <SliderRow k="playlistPanelGlassDensity" label="面板遮挡" min={0.55} max={1} format={pct} />
        <SliderRow k="playlistPanelOpenDuration" label="面板唤出" min={0.08} max={0.72} format={seconds} />
        <SliderRow k="playlistPanelCloseDuration" label="面板收起" min={0.06} max={0.48} format={seconds} />
      </Group>

      <Group title="用户存档" note={`13 个槽位，存的是整份 fx 快照；当前已用 ${usedSlots} 槽。留空名称会自动编号。`}>
        <ArchiveGrid />
      </Group>

      <Group title="重置与迁移">
        <button
          type="button"
          className="btn mb-2 w-full"
          onClick={() => {
            resetFx();
            pushToast('视觉参数已回到出厂值', 'ok');
          }}
        >
          <IconRefresh size={13} />
          重置全部
        </button>
        <div className="mb-2 flex gap-2">
          <button type="button" className="btn flex-1" onClick={onExport}>
            导出存档
          </button>
          <button type="button" className="btn flex-1" onClick={onImport}>
            导入存档
          </button>
        </div>
        <textarea
          className="field h-[104px] resize-y whitespace-pre py-2 font-mono !text-[10.5px] leading-relaxed"
          placeholder="mineradio-user-fx-archive 的完整 JSON"
          spellCheck={false}
          value={transfer}
          onChange={(e) => setTransfer(e.target.value)}
        />
      </Group>
    </>
  );
}

const PANES: Record<FxSection, () => ReactNode> = {
  preset: PresetPane,
  look: LookPane,
  lyric: LyricPane,
  motion: MotionPane,
  advanced: AdvancedPane,
};

/* ---------------------------------------------------------------------- 外壳 */

/** 原版 #fx-fab：54px 圆钮，面板打开时让位 */
export function FxFab() {
  const state = useUiStore((s) => s.fxPanel);
  const toggleFxPanel = useUiStore((s) => s.toggleFxPanel);

  if (state === 'open') return null;

  return (
    <button
      type="button"
      id="fx-fab"
      data-ui-layer
      className="fx-fab fixed bottom-[132px] left-6 z-30 animate-fade-rise"
      title="视觉控制台"
      aria-label="打开视觉控制台"
      onClick={() => toggleFxPanel()}
    >
      <IconVisual size={21} />
    </button>
  );
}

/** 原版 #fx-panel：右侧贴边玻璃面板，五页签切换控件组 */
export function FxPanel() {
  const state = useUiStore((s) => s.fxPanel);
  const pinned = useUiStore((s) => s.fxPanelPinned);
  const toggleFxPanel = useUiStore((s) => s.toggleFxPanel);
  const toggleFxPinned = useUiStore((s) => s.toggleFxPinned);
  const [section, setSection] = useState<FxSection>('preset');
  const panelRef = useRef<HTMLElement>(null);
  const open = state === 'open';

  /* 未钉住时点面板外收起，对应原版鼠标移开即 hide */
  useEffect(() => {
    if (!open || pinned) return;
    const onPointerDown = (e: Event) => {
      const target = e.target as Node | null;
      if (panelRef.current?.contains(target)) return;
      toggleFxPanel(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, pinned, toggleFxPanel]);

  const Pane = PANES[section];

  return (
    <aside
      ref={panelRef}
      data-ui-layer
      id="fx-panel"
      aria-hidden={!open}
      className={`glass-panel fixed bottom-6 right-5 top-[70px] z-40 flex w-fxpanel flex-col overflow-hidden transition-all duration-panel ease-mr ${
        open ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-[110%] opacity-0'
      }`}
    >
      <div className="shrink-0 border-b border-[var(--glass-border-soft)] px-3.5 pb-2.5 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[14.5px] font-semibold tracking-wide text-[var(--fc-ink)]">视觉控制台</h2>
            <p className="label-caps mt-0.5 truncate">MINERADIO VISUALS · {pinned ? '已钉住' : '点别处收起'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              id="fx-pin-btn"
              className="ctrl-btn !h-7 !w-auto !px-2.5 text-[11.5px]"
              data-active={pinned}
              title={pinned ? '取消钉住：点击别处即收起' : '钉住：点击别处不收起'}
              aria-pressed={pinned}
              onClick={toggleFxPinned}
            >
              钉住
            </button>
            <button
              type="button"
              className="ctrl-btn h-7 w-7"
              aria-label="关闭视觉控制台"
              title="关闭"
              onClick={() => toggleFxPanel(false)}
            >
              <IconClose size={14} />
            </button>
          </div>
        </div>
        <Segmented
          className="mt-2.5 flex w-full justify-between"
          value={section}
          options={SECTION_TABS}
          onChange={setSection}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-6 pt-3">
        <Pane />
      </div>
    </aside>
  );
}
