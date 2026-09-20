import type { Config } from 'tailwindcss';

/**
 * 令牌取自原版 public/css/index.css 的四个 :root 块（第 367 / 400 / 409 / 423 行），
 * 值逐字保留，便于与原稿对色。
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fc: {
          bg: '#08090B',
          paper: '#0E1014',
          ink: '#E8ECEF',
          ink2: '#D2D7DC',
          muted: '#8A9099',
          hair: '#1A1D22',
          hair2: '#262A31',
          accent: '#FFFFFF',
          blue: '#2442ff',
          warm: '#f8f4ee',
        },
        chill: {
          ink: '#030608',
          deep: '#061116',
          cyan: '#8fe9ff',
          blue: '#73a7ff',
          mint: '#9cffdf',
        },
        champagne: {
          DEFAULT: '#f4d28a',
          deep: '#9a6f2c',
        },
        home: {
          accent: '#00f5d4',
          icon: '#f4d28a',
        },
        visual: {
          tint: '#9db8cf',
          icon: '#7fd8ff',
        },
        source: {
          netease: '#d95b67',
          qq: '#00F5D4',
          kugou: '#00F5D4',
          qishui: '#45d68f',
          spotify: '#1ed760',
          local: '#9db8cf',
        },
      },
      fontFamily: {
        sans: [
          'Noto Sans SC',
          'PingFang SC',
          'HarmonyOS Sans SC',
          'Alibaba PuHuiTi',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'Geist Mono', 'SF Mono', 'ui-monospace', 'monospace'],
        wordmark: ['Cinzel Decorative', 'UnifrakturCook', 'Georgia', 'serif'],
      },
      borderRadius: {
        bar: '50px',
        modal: '18px',
        ctrl: '11px',
        card: '16px',
        tile: '22px',
      },
      width: {
        bottombar: 'min(1080px, calc(100vw - 56px))',
        home: 'min(1240px, calc(100vw - 72px))',
        fxpanel: 'min(444px, calc(100vw - 48px))',
        playlist: '340px',
      },
      blur: {
        panel: '22px',
        saved: '12px',
        icon: '20px',
      },
      transitionTimingFunction: {
        mr: 'cubic-bezier(.16,1,.3,1)',
        mr2: 'cubic-bezier(.22,1,.36,1)',
      },
      transitionDuration: {
        btn: '180ms',
        bar: '340ms',
        panel: '420ms',
        home: '700ms',
        canvas: '760ms',
        splash: '620ms',
      },
      boxShadow: {
        'glass-bar':
          'inset 0 0 2px 1px rgba(255,255,255,.35), inset 0 0 10px 4px rgba(255,255,255,.15), 0 4px 16px rgba(17,17,26,.05), 0 8px 24px rgba(17,17,26,.05), 0 16px 56px rgba(17,17,26,.05)',
        'glass-panel':
          '0 24px 78px rgba(0,0,0,.44), 0 0 0 1px rgba(255,255,255,.045), inset 0 1px 0 rgba(255,255,255,.18), inset 0 -18px 42px rgba(0,0,0,.16)',
        glass:
          '0 22px 64px rgba(0,0,0,.30), 0 0 34px rgba(0,245,212,.052), inset 0 1px 0 rgba(255,255,255,.16), inset 0 -24px 58px rgba(0,0,0,.16)',
      },
      keyframes: {
        'fade-rise': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'veil-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pulse-soft': {
          '0%,100%': { opacity: '.55' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-rise': 'fade-rise 420ms cubic-bezier(.16,1,.3,1) both',
        'veil-in': 'veil-in 340ms cubic-bezier(.16,1,.3,1) both',
        'pulse-soft': 'pulse-soft 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
