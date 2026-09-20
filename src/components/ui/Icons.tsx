import type { SVGProps } from 'react';

/**
 * 内联描边图标。
 *
 * 原版没有图标字体、没有 sprite，每个按钮里手写一段 stroke="currentColor" 的 SVG
 * （另有 × › ? 词 DIY 这类纯文字按钮，那几个在对应组件里直接写字符）。
 * 这里保持同一做法，只把重复用到的抽出来。
 */

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M8 5.6v12.8L19 12z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconPause = (p: P) => (
  <Svg {...p}>
    <rect x="7" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="13.4" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconPrev = (p: P) => (
  <Svg {...p}>
    <path d="M17 5.5v13L8 12z" fill="currentColor" stroke="none" />
    <path d="M6 5v14" />
  </Svg>
);

export const IconNext = (p: P) => (
  <Svg {...p}>
    <path d="M7 5.5v13L16 12z" fill="currentColor" stroke="none" />
    <path d="M18 5v14" />
  </Svg>
);

export const IconLoop = (p: P) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 0 1 8-8h5" />
    <path d="M14 1.8 17.4 4 14 6.2" />
    <path d="M20 12a8 8 0 0 1-8 8H7" />
    <path d="M10 22.2 6.6 20 10 17.8" />
  </Svg>
);

export const IconShuffle = (p: P) => (
  <Svg {...p}>
    <path d="M3 6h3.5l4 12h4" />
    <path d="M3 18h3.5l4-12h4" />
    <path d="M17 4l3 2-3 2" />
    <path d="M17 16l3 2-3 2" />
  </Svg>
);

export const IconSingle = (p: P) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 0 1 8-8h5" />
    <path d="M14 1.8 17.4 4 14 6.2" />
    <path d="M20 12a8 8 0 0 1-8 8H7" />
    <path d="M10 22.2 6.6 20 10 17.8" />
    <text x="12" y="15.2" fontSize="7.5" fill="currentColor" stroke="none" textAnchor="middle" fontFamily="var(--font-mono)">1</text>
  </Svg>
);

export const IconHeart = ({ filled, ...p }: P & { filled?: boolean }) => (
  <Svg {...p}>
    <path
      d="M12 20s-7.2-4.6-7.2-9.4A3.9 3.9 0 0 1 12 8.3a3.9 3.9 0 0 1 7.2 2.3C19.2 15.4 12 20 12 20z"
      fill={filled ? 'currentColor' : 'none'}
    />
  </Svg>
);

export const IconCollect = (p: P) => (
  <Svg {...p}>
    <path d="M6 4h12v16l-6-4.4L6 20z" />
    <path d="M9.5 9.5h5" />
    <path d="M12 7v5" />
  </Svg>
);

export const IconQueue = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h11" />
    <path d="M4 12h11" />
    <path d="M4 17h7" />
    <circle cx="18" cy="16" r="2.6" />
    <path d="M20.6 16V9.5l-2.4.7" />
  </Svg>
);

export const IconVolume = ({ muted, ...p }: P & { muted?: boolean }) => (
  <Svg {...p}>
    <path d="M4 9.5h3L11.5 6v12L7 14.5H4z" />
    {muted ? <path d="M15.5 9.5l4 5M19.5 9.5l-4 5" /> : <><path d="M15 9.6a3.6 3.6 0 0 1 0 4.8" /><path d="M17.6 7.2a7.2 7.2 0 0 1 0 9.6" /></>}
  </Svg>
);

export const IconImmersive = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.4" />
    <path d="M3 10h18" opacity=".45" />
  </Svg>
);

export const IconFullscreen = (p: P) => (
  <Svg {...p}>
    <path d="M4 9V4h5" />
    <path d="M20 9V4h-5" />
    <path d="M4 15v5h5" />
    <path d="M20 15v5h-5" />
  </Svg>
);

export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="10.8" cy="10.8" r="6.2" />
    <path d="M15.4 15.4 20 20" />
  </Svg>
);

export const IconVisual = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2" />
    <path d="M5.9 5.9l1.6 1.6M16.5 16.5l1.6 1.6M18.1 5.9l-1.6 1.6M7.5 16.5l-1.6 1.6" opacity=".6" />
  </Svg>
);

export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconChevron = ({ dir = 'right', ...p }: P & { dir?: 'left' | 'right' | 'up' | 'down' }) => {
  const d = dir === 'right' ? 'M9 5l7 7-7 7' : dir === 'left' ? 'M15 5l-7 7 7 7' : dir === 'up' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7';
  return <Svg {...p}><path d={d} /></Svg>;
};

export const IconUser = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8.4" r="3.6" />
    <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
  </Svg>
);

export const IconRefresh = (p: P) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4.4h-4.4" />
  </Svg>
);

export const IconUpload = (p: P) => (
  <Svg {...p}>
    <path d="M12 16V4" />
    <path d="M7 8.6 12 4l5 4.6" />
    <path d="M4 15v3.4A1.6 1.6 0 0 0 5.6 20h12.8A1.6 1.6 0 0 0 20 18.4V15" />
  </Svg>
);

export const IconLoading = ({ size = 18, ...p }: P) => (
  <Svg size={size} {...p}>
    <circle cx="12" cy="12" r="8" opacity=".22" />
    <path d="M20 12a8 8 0 0 0-8-8" />
  </Svg>
);

export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 12.5l4.6 4.6L19.5 6.8" />
  </Svg>
);

export const IconQuality = (p: P) => (
  <Svg {...p}>
    <path d="M4 12h2.4l2-5 3 12 2.6-9 1.8 5H20" />
  </Svg>
);

export const IconHide = (p: P) => (
  <Svg {...p}>
    <path d="M3 12s3.6-6 9-6 9 6 9 6-3.6 6-9 6-9-6-9-6z" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M4 20 20 4" opacity=".7" />
  </Svg>
);

export const IconLibrary = (p: P) => (
  <Svg {...p}>
    <path d="M5 4h3v16H5z" />
    <path d="M10.5 4h3v16h-3z" />
    <path d="M16 5.4l2.8.8-3.6 14.2-2.8-.8z" />
  </Svg>
);

export const IconMic = (p: P) => (
  <Svg {...p}>
    <rect x="9.2" y="3" width="5.6" height="10.4" rx="2.8" />
    <path d="M5.8 11.4a6.2 6.2 0 0 0 12.4 0" />
    <path d="M12 17.6V21" />
  </Svg>
);
