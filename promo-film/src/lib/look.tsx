// 视觉系统：配色、字体、极光底、玻璃卡、颗粒、逐词浮现。
// 配色直接取产品图标（src/www/panel/icon.svg）的渐变：#6a4dff → #2f6bff → #00c2d8，粉色 #ff5fb4 只做余光；
// 「在线」绿 #34c759、品牌蓝 #007aff 取自面板 CSS 变量。风格取 mg-styles-15 的「弥散渐变 / 玻璃拟态」+「线条动画」。
import React from 'react';
import { AbsoluteFill, staticFile, useCurrentFrame } from 'remotion';
import { EASE, clamp01, hash, ramp } from './ease';

export const C = {
  ink: '#05060d',
  violet: '#6a4dff',
  blue: '#2f6bff',
  cyan: '#00c2d8',
  pink: '#ff5fb4',
  green: '#34c759',
  brand: '#0a84ff',
  line: '#eef2ff',
  text: '#f4f6ff',
  dim: 'rgba(228,232,255,0.62)',
  faint: 'rgba(228,232,255,0.38)',
};

export const F = {
  sans: '"Inter Variable", "Noto Sans SC Variable", sans-serif',
  serif: '"Noto Serif SC Variable", serif',
  mono: '"JetBrains Mono Variable", "Noto Sans SC Variable", monospace',
};

// ── 极光底：4 个纯色大圆（径向渐变等效 blur 100px+），各自沿慢速闭合曲线漂移，周期 20–40 秒 ──
type Blob = { c: string; r: number; x: number; y: number; ax: number; ay: number; px: number; py: number; ph: number };
const BLOBS: Blob[] = [
  { c: '106,77,255', r: 900, x: 0.22, y: 0.3, ax: 0.1, ay: 0.08, px: 34, py: 27, ph: 0.3 },
  { c: '47,107,255', r: 1000, x: 0.78, y: 0.62, ax: 0.09, ay: 0.1, px: 29, py: 38, ph: 1.9 },
  { c: '0,194,216', r: 760, x: 0.62, y: 0.15, ax: 0.12, ay: 0.07, px: 40, py: 23, ph: 3.1 },
  { c: '255,95,180', r: 640, x: 0.12, y: 0.88, ax: 0.08, ay: 0.06, px: 31, py: 36, ph: 4.4 },
];
export const Aurora: React.FC<{ energy?: number; hue?: number; dark?: number }> = ({ energy = 0.6, hue = 0, dark = 0 }) => {
  const f = useCurrentFrame();
  const t = f / 30;
  const layers = BLOBS.map((b, i) => {
    const x = b.x + b.ax * Math.sin((t / b.px) * Math.PI * 2 + b.ph) + 0.02 * Math.sin(t * 0.21 + i);
    const y = b.y + b.ay * Math.cos((t / b.py) * Math.PI * 2 + b.ph * 1.3);
    const a = (i === 3 ? 0.35 : 0.62) * energy;
    return `radial-gradient(circle ${b.r}px at ${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%, rgba(${b.c},${a.toFixed(3)}) 0%, rgba(${b.c},${(a * 0.42).toFixed(3)}) 34%, rgba(${b.c},0) 70%)`;
  });
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <AbsoluteFill style={{ background: layers.join(','), filter: hue ? `hue-rotate(${hue}deg)` : undefined }} />
      {/* 暗角 + 压暗层 */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 70% at 50% 48%, rgba(5,6,13,0) 40%, rgba(5,6,13,0.72) 100%)' }} />
      {dark > 0 && <AbsoluteFill style={{ background: `rgba(5,6,13,${dark.toFixed(3)})` }} />}
    </AbsoluteFill>
  );
};

// 颗粒：mg-styles-15 assets/textures/grain/grain_fine_2048.png，每 2 帧换一次偏移，防 banding
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.07 }) => {
  const f = useCurrentFrame();
  const k = Math.floor(f / 2);
  const ox = Math.floor(hash(k * 3 + 1) * 1024), oy = Math.floor(hash(k * 7 + 2) * 1024);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity, mixBlendMode: 'overlay', backgroundImage: `url(${staticFile('tex/grain_fine_2048.png')})`, backgroundSize: '1024px 1024px', backgroundPosition: `${ox}px ${oy}px` }} />
  );
};

// 玻璃卡（mg-styles 配方：白 5–10% 填充 + 1px 30% 内描边 + 大圆角 + 背景模糊）
export const glass = (o: { radius?: number; fill?: number; blur?: number; edge?: number } = {}): React.CSSProperties => ({
  borderRadius: o.radius ?? 28,
  background: `linear-gradient(160deg, rgba(255,255,255,${((o.fill ?? 0.08) + 0.04).toFixed(3)}) 0%, rgba(255,255,255,${(o.fill ?? 0.08).toFixed(3)}) 45%, rgba(255,255,255,${((o.fill ?? 0.08) * 0.6).toFixed(3)}) 100%)`,
  boxShadow: `inset 0 0 0 1px rgba(255,255,255,${(o.edge ?? 0.28).toFixed(2)}), inset 0 1px 0 rgba(255,255,255,0.35), 0 30px 80px -20px rgba(0,0,0,0.55)`,
  backdropFilter: o.blur === 0 ? undefined : `blur(${o.blur ?? 28}px) saturate(150%)`,
  WebkitBackdropFilter: o.blur === 0 ? undefined : `blur(${o.blur ?? 28}px) saturate(150%)`,
});

// 逐词（逐字）浮现：opacity + y + blur 三通道共用一个进度（video-shotcraft blur-slide）
export const Rise: React.FC<{
  text: string; start: number; per?: number; dur?: number; dy?: number; blur?: number; by?: 'char' | 'word';
  out?: number; outDur?: number; style?: React.CSSProperties; hl?: [number, number, React.CSSProperties];
}> = ({ text, start, per = 1.6, dur = 20, dy = 18, blur = 12, by = 'char', out, outDur = 14, style, hl }) => {
  const f = useCurrentFrame();
  const parts = by === 'word' ? text.split(/(\s+)/) : Array.from(text);
  const o = out == null ? 1 : 1 - ramp(f, out, outDur, EASE.swift);
  let k = 0;
  return (
    <div style={{ whiteSpace: 'pre', ...style, opacity: o, filter: o < 0.999 ? `blur(${((1 - o) * 10).toFixed(2)}px)` : undefined }}>
      {parts.map((w, i) => {
        if (/^\s+$/.test(w)) return <span key={i}>{w}</span>;
        const idx = k++;
        const p = ramp(f, start + idx * per, dur, EASE.out);
        const inHl = hl && idx >= hl[0] && idx < hl[1];
        return (
          <span key={i} style={{ display: 'inline-block', opacity: p, transform: `translateY(${((1 - p) * dy).toFixed(2)}px)`, filter: p >= 0.999 ? undefined : `blur(${((1 - p) * blur).toFixed(2)}px)`, ...(inHl ? hl![2] : null) }}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

// 小标签：mono 版本号 / 时间
export const Chip: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color, style }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: 40, padding: '0 16px', borderRadius: 12, fontFamily: F.mono, fontSize: 22, fontWeight: 600, letterSpacing: '0.02em', color: color ? '#fff' : C.text, background: color ?? 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)', ...style }}>{children}</span>
);

// 演示数据声明（凡是出现面板界面的镜头都带）
export const DemoNote: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => (
  <div style={{ position: 'absolute', left: 64, bottom: 40, fontFamily: F.sans, fontSize: 20, color: C.faint, opacity, letterSpacing: '0.04em' }}>
    界面为真实面板 · 数据为演示数据
  </div>
);

export const fadeBlur = (p: number): React.CSSProperties => ({ opacity: clamp01(p), filter: p < 0.999 ? `blur(${((1 - clamp01(p)) * 14).toFixed(2)}px)` : undefined });
