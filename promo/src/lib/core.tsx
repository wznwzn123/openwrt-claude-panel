import React, { createContext, useContext } from 'react';

/** 国内短视频平台合规版：插件名泛称化（竖屏 抖音/小红书/视频号 用） */
export const SafeCtx = createContext(false);
export const useSafe = () => useContext(SafeCtx);
import {
  cancelRender,
  continueRender,
  delayRender,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

/* ───────────── 字体锁定 + 加载断言（渲染前必须通过，否则整帧报错，严禁回退宋体/黑体） ───────────── */
export const FONT = {
  // 显式中文栈：PingFang SC / HarmonyOS Sans SC 为首选（本机无则跳过），Noto Sans SC 由本工程本地文件加载并断言
  sans: '"PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", sans-serif',
  mono: '"JetBrains Mono", "SF Mono", "Noto Sans SC", monospace',
};

const FONT_FILES: Array<[string, string, FontFaceDescriptors]> = [
  ['Noto Sans SC', 'fonts/NotoSansSC-VF.ttf', { weight: '100 900' }],
  ['JetBrains Mono', 'fonts/JetBrainsMono-Regular.ttf', { weight: '400' }],
  ['JetBrains Mono', 'fonts/JetBrainsMono-Medium.ttf', { weight: '500' }],
  ['JetBrains Mono', 'fonts/JetBrainsMono-Bold.ttf', { weight: '700' }],
];

let fontsStarted = false;
export const ensureFonts = () => {
  if (fontsStarted || typeof document === 'undefined') return;
  fontsStarted = true;
  const handle = delayRender('font-assert', { timeoutInMilliseconds: 60000 });
  Promise.all(
    FONT_FILES.map(([family, file, desc]) => {
      const ff = new FontFace(family, `url(${staticFile(file)})`, desc);
      return ff.load().then((f) => {
        (document.fonts as unknown as Set<FontFace>).add(f);
      });
    }),
  )
    .then(() => document.fonts.ready)
    .then(() => {
      const probes = [
        '400 40px "Noto Sans SC"',
        '600 40px "Noto Sans SC"',
        '800 40px "Noto Sans SC"',
        '400 40px "JetBrains Mono"',
        '700 40px "JetBrains Mono"',
      ];
      const failed = probes.filter((p) => !document.fonts.check(p, '路由器面板Ab9'));
      if (failed.length) throw new Error('FONT ASSERT FAILED: ' + failed.join(', '));
      continueRender(handle);
    })
    .catch((e) => cancelRender(e));
};

/* ───────────── 色彩 tokens（产品官网 tokens + 导演手记指定色） ───────────── */
export const C = {
  ink0: '#07090E',
  ink1: '#0F172A',
  hud: '#050507',
  blue: '#2563EB',
  violet: '#7C3AED',
  amber: '#D97757',
  cyan: '#06B6D4',
  // 产品自身 tokens（yrlove520.com computed styles）
  brand: '#007AFF',
  ok: '#34C759',
  warn: '#FF9500',
  danger: '#FF3B30',
  text: '#F5F7FB',
  text2: 'rgba(226,232,240,0.66)',
  text3: 'rgba(203,213,225,0.42)',
  hair: 'rgba(255,255,255,0.12)',
  iconA: '#6A4DFF',
  iconB: '#2F6BFF',
  iconC: '#00C2D8',
};

/* ───────────── 缓动 ───────────── */
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dsx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    x = clamp01(x);
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = dsx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (sx(t) - x) / d;
    }
    return sy(clamp01(t));
  };
};
export const EASE = {
  snappy: bezier(0.16, 1, 0.3, 1),
  out: bezier(0.22, 1, 0.36, 1),
  smooth: bezier(0.65, 0, 0.35, 1),
  swift: bezier(0.4, 0, 0.2, 1),
  exit: bezier(0.7, 0, 0.84, 0),
  inQuad: bezier(0.11, 0, 0.5, 0),
  linear: (t: number) => clamp01(t),
  sine: (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t)),
};
/** 秒制 ramp：t 当前秒，start 起点秒，dur 时长秒 */
export const ramp = (t: number, start: number, dur: number, ease: (x: number) => number = EASE.snappy) =>
  ease(clamp01((t - start) / Math.max(1e-6, dur)));
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** 导演手记指定的阻尼弹簧：stiffness 240 · damping 26 · mass 0.85 */
export const SPRING = { stiffness: 240, damping: 26, mass: 0.85 };
export const springAt = (
  t: number,
  start: number,
  fps: number,
  config: Partial<{ stiffness: number; damping: number; mass: number }> = SPRING,
) => (t < start ? 0 : spring({ frame: (t - start) * fps, fps, config: { ...SPRING, ...config } }));

/** 第五幕整体提前一小节（116 BPM ≈ 2.069s，取 60fps 整帧 124 帧）：第四幕压缩换来片尾 logo 定格与终止和弦 */
export const SHIFT5 = 124 / 60;

/** 当前时间（秒） */
export const useT = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return f / fps;
};
export const useV = () => {
  const { width, height } = useVideoConfig();
  return { vertical: height > width, W: width, H: height };
};

/* 确定性伪随机 */
export const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** 段内存活窗口：返回 0..1 的入场 × (1-出场) */
export const life = (t: number, a: number, b: number, fin = 0.4, fout = 0.35) =>
  ramp(t, a, fin, EASE.out) * (1 - ramp(t, b - fout, fout, EASE.exit));

export const Abs: React.FC<React.HTMLAttributes<HTMLDivElement> & { style?: React.CSSProperties }> = ({
  style,
  children,
  ...rest
}) => (
  <div {...rest} style={{ position: 'absolute', ...style }}>
    {children}
  </div>
);
