import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '@/store/uiStore';

/**
 * 启动页。原版是 #splash-veil 的全屏接管：只有字标、一句副文案和「点击进入」，
 * 不依赖播放器，也不读任何接口，所以断网 / 未登录时同样能渲染。
 *
 * 进入方式与原版一致：点击任意位置、Enter、空格三选一，
 * 走 uiStore.enterApp() 关掉 splashActive，再由路由切到 /home。
 */

const LETTERS_HEADING = ['M', 'i', 'n', 'e'];
const LETTERS_RADIO = ['r', 'a', 'd', 'i', 'o'];

/** 轮播的那句「实时」说明：本工程的音频全部由 Web Audio 现场合成 */
const LIVE_NOTES = [
  '音频由 Web Audio 现场合成，没有真实版权曲目',
  '接口层由 MSW 拦截，字段与 Mineradio 2.2.0 后端一致',
  '视觉舞台跑在 WebGL 粒子上，可在控制台里调',
  '登录态是模拟的，扫码与 Cookie 都不会上传任何凭据',
];

export function SplashPage() {
  const navigate = useNavigate();
  const [noteIdx, setNoteIdx] = useState(0);

  const enter = useCallback(() => {
    useUiStore.getState().enterApp();
    navigate('/home', { replace: true });
  }, [navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        enter();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enter]);

  useEffect(() => {
    const timer = setInterval(() => setNoteIdx((i) => (i + 1) % LIVE_NOTES.length), 3400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      id="splash-veil"
      role="button"
      tabIndex={0}
      aria-label="点击进入 Mineradio"
      onClick={enter}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
      }}
      className="fixed inset-0 z-[70] flex cursor-pointer select-none flex-col items-center justify-center overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at 50% 38%, rgba(var(--home-accent-rgb), .10), transparent 44%),' +
          'radial-gradient(ellipse at 78% 84%, rgba(var(--fc-accent-rgb), .05), transparent 52%),' +
          'linear-gradient(180deg, #0b0d10 0%, var(--fc-bg) 58%, #050607 100%)',
      }}
    >
      {/* 背景里两团极慢呼吸的光，纯 CSS，不用 canvas，避免和视觉舞台抢上下文 */}
      <span
        className="pointer-events-none absolute left-[14%] top-[18%] h-[38vmin] w-[38vmin] rounded-full animate-pulse-soft"
        style={{ background: 'radial-gradient(circle, rgba(var(--home-accent-rgb), .16), transparent 62%)', filter: 'blur(38px)' }}
      />
      <span
        className="pointer-events-none absolute bottom-[12%] right-[12%] h-[30vmin] w-[30vmin] rounded-full animate-pulse-soft"
        style={{ background: 'radial-gradient(circle, rgba(var(--visual-icon-rgb), .14), transparent 64%)', filter: 'blur(42px)', animationDelay: '900ms' }}
      />

      <div className="relative flex flex-col items-center px-6 text-center">
        <p className="label-caps mb-6 animate-fade-rise" style={{ animationDelay: '40ms' }}>
          immersive music player
        </p>

        <h1 className="wordmark flex items-baseline justify-center text-[clamp(46px,9vw,116px)] font-black leading-none">
          {LETTERS_HEADING.map((ch, i) => (
            <span key={`m-${i}`} className="inline-block animate-fade-rise text-[var(--fc-ink)]" style={{ animationDelay: `${120 + i * 70}ms` }}>
              {ch}
            </span>
          ))}
          {LETTERS_RADIO.map((ch, i) => (
            <span
              key={`r-${i}`}
              className="inline-block animate-fade-rise"
              style={{ animationDelay: `${400 + i * 70}ms`, color: 'var(--home-accent)', textShadow: '0 0 42px rgba(var(--home-accent-rgb), .38)' }}
            >
              {ch}
            </span>
          ))}
        </h1>

        <p
          className="mt-7 max-w-[420px] animate-fade-rise text-[13px] leading-relaxed text-[var(--fc-ink-2)]"
          style={{ animationDelay: '820ms' }}
        >
          一个把封面、歌词与粒子舞台放在同一层光里的播放器。
          <br />
          先决定要不要被打扰，再决定听什么。
        </p>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            enter();
          }}
          className="btn btn--primary mt-10 h-11 animate-fade-rise px-7 text-[13px]"
          style={{ animationDelay: '960ms' }}
        >
          点击进入
          <span className="font-mono text-[10px] opacity-70">ENTER</span>
        </button>

        <div
          className="mt-9 flex h-[18px] items-center gap-2 animate-fade-rise"
          style={{ animationDelay: '1120ms' }}
          aria-live="polite"
        >
          <i className="source-dot" data-provider="local" />
          <span className="font-mono text-[10.5px] tracking-[.04em] text-[var(--fc-muted)]">
            实时 · {LIVE_NOTES[noteIdx]}
          </span>
        </div>

        <p className="mt-2 font-mono text-[10px] text-[var(--fc-muted)] opacity-70">
          Mineradio 2.2.0 · React 复刻 · 空格或 Enter 亦可进入
        </p>
      </div>
    </div>
  );
}
