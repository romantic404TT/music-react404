import { useLyrics } from '@/hooks/useLyrics';
import { useFxStore } from '@/store/fxStore';
import { usePlayerStore } from '@/store/playerStore';

/**
 * 歌词舞台。
 *
 * 原版的歌词是 WebGL 文字网格（02-visual 的 12-lyrics-row-layers / 14-stage-lyrics-rendering
 * 合计约 290KB，含遮罩纹理与 shader）。这里退化为 DOM 多层歌词，但保留原版三组语义：
 *   · lyricDisplayMode  single / dual / triple / cinema 决定同屏行数；
 *   · lyricTranslationMode 控制译文是否出现（原文 / 当前行 / 双语 / 多行）；
 *   · lyricContextOpacity / lyricContextSpread 决定上下文行的透明度与间距。
 * particleLyrics 关闭时整层隐藏，与控制条上的「词」按钮联动。
 */

const DISPLAY_LINES: Record<string, number> = { single: 1, dual: 2, triple: 3, cinema: 5, custom: 5 };

export function LyricsOverlay() {
  const song = usePlayerStore((s) => s.current());
  const position = usePlayerStore((s) => s.position);
  const playing = usePlayerStore((s) => s.playing);
  const fx = useFxStore((s) => s.fx);
  const { lines, activeIdx } = useLyrics(song, position);

  if (!fx.particleLyrics || !song || !lines.length) return null;

  const count = DISPLAY_LINES[fx.lyricDisplayMode] ?? 3;
  const half = Math.floor(count / 2);
  const from = Math.max(0, Math.min(activeIdx - half, lines.length - count));
  const window_ = lines.slice(from, from + count);

  const highlight = fx.lyricHighlightMode === 'auto' ? fx.lyricGlowColor : fx.lyricHighlightColor;
  const showTrans = fx.lyricTranslationMode !== 'off';

  return (
    <div
      data-ui-layer
      id="stage-lyrics"
      className="pointer-events-none absolute inset-x-0 bottom-[190px] z-20 flex flex-col items-center gap-1 px-8 text-center"
      style={{
        opacity: playing ? 1 : 0.72,
        transition: 'opacity var(--dur-bar) var(--ease-mr)',
        textShadow: fx.lyricGlow
          ? `0 0 ${(fx.lyricGlowStrength * 34).toFixed(1)}px ${fx.lyricGlowColor}, 0 2px 18px rgba(0,0,0,.65)`
          : '0 2px 14px rgba(0,0,0,.6)',
      }}
    >
      {window_.map((line, i) => {
        const absolute = from + i;
        const active = absolute === activeIdx;
        const distance = Math.abs(absolute - activeIdx);
        const contextAlpha = active
          ? 1
          : Math.max(0.12, fx.lyricContextOpacity - distance * (1 - fx.lyricContextSpread) * 0.22);

        return (
          <div key={`${line.time}-${i}`} style={{ transform: `scale(${active ? fx.lyricScale : fx.lyricScale * 0.94})` }}>
            <p
              className="mx-auto max-w-[82vw] truncate text-balance"
              style={{
                color: active ? highlight : 'var(--fc-ink)',
                opacity: contextAlpha,
                fontSize: `${(active ? 27 : 19) * fx.lyricScale}px`,
                fontWeight: fx.lyricWeight,
                lineHeight: fx.lyricLineHeight,
                letterSpacing: `${fx.lyricLetterSpacing / 100}em`,
                transition: 'opacity .34s var(--ease-mr), color .34s var(--ease-mr), font-size .34s var(--ease-mr)',
              }}
            >
              {line.text}
            </p>
            {showTrans && line.trans && (active || fx.lyricTranslationMode === 'multi') && (
              <p
                className="mx-auto mt-1 max-w-[70vw] truncate"
                style={{
                  color: 'var(--fc-muted)',
                  opacity: fx.lyricTranslationOpacity * (active ? 1 : 0.6),
                  fontSize: `${15 * fx.lyricTranslationScale}px`,
                }}
              >
                {line.trans}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
