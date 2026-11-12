import React from 'react';
import { Img, staticFile, useVideoConfig } from 'remotion';
import { C, EASE, FONT, hash, ramp, useT } from './core';

/* ───────────── 10 · Aurora & Glassmorphism 主视觉基底 ───────────── */
export const AuroraBG: React.FC<{ amber?: number; intensity?: number; t?: number }> = ({
  amber = 0,
  intensity = 1,
  t: tOverride,
}) => {
  const tt = useT();
  const t = tOverride ?? tt;
  const { width: W, height: H } = useVideoConfig();
  // 三团低饱和高透光光晕：正弦双周期游走（周期 23s / 37s 叠加），确定性
  const blob = (px: number, py: number, ax: number, ay: number, p1: number, p2: number, ph: number) => {
    const x = px + ax * Math.sin((2 * Math.PI * t) / p1 + ph) + ax * 0.4 * Math.sin((2 * Math.PI * t) / p2 + ph * 1.7);
    const y = py + ay * Math.cos((2 * Math.PI * t) / p1 + ph * 0.6) + ay * 0.35 * Math.sin((2 * Math.PI * t) / p2 + ph);
    return [x * 100, y * 100] as const;
  };
  const [bx, by] = blob(0.24, 0.3, 0.1, 0.08, 23, 37, 0.3);
  const [vx, vy] = blob(0.78, 0.68, 0.09, 0.09, 29, 41, 2.1);
  const [ax2, ay2] = blob(0.62, 0.22, 0.08, 0.06, 19, 31, 4.2);
  const k = intensity;
  const layers = [
    `radial-gradient(ellipse 46% 52% at ${bx}% ${by}%, rgba(37,99,235,${0.42 * k}) 0%, rgba(37,99,235,${0.16 * k}) 38%, rgba(37,99,235,0) 72%)`,
    `radial-gradient(ellipse 44% 50% at ${vx}% ${vy}%, rgba(124,58,237,${0.36 * k}) 0%, rgba(124,58,237,${0.13 * k}) 40%, rgba(124,58,237,0) 74%)`,
    `radial-gradient(ellipse 38% 40% at ${ax2}% ${ay2}%, rgba(217,119,87,${0.42 * amber * k}) 0%, rgba(217,119,87,${0.14 * amber * k}) 42%, rgba(217,119,87,0) 76%)`,
    `radial-gradient(ellipse 30% 30% at ${100 - bx * 0.6}% ${18 + by * 0.2}%, rgba(6,182,212,${0.1 * k}) 0%, rgba(6,182,212,0) 70%)`,
    `radial-gradient(ellipse 120% 100% at 50% 40%, ${C.ink1} 0%, ${C.ink0} 78%)`,
  ];
  return <div style={{ position: 'absolute', width: W, height: H, background: layers.join(',') }} />;
};

/* 10% 电影微粒噪点（确定性逐帧换 tile 与偏移） */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.1 }) => {
  const t = useT();
  const { fps } = useVideoConfig();
  const f = Math.round(t * fps);
  const n = Math.floor(hash(f) * 4);
  const ox = Math.floor(hash(f + 13) * 256);
  const oy = Math.floor(hash(f + 71) * 256);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `url(${staticFile(`shots/grain${n}.png`)})`,
        backgroundPosition: `${ox}px ${oy}px`,
        backgroundSize: '256px 256px',
        mixBlendMode: 'overlay',
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.55 }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: `radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,${strength}) 100%)`,
      pointerEvents: 'none',
    }}
  />
);

/* ───────────── 08 · Cyberpunk HUD / FUI 硬核工程基底 ───────────── */
export const HudBG: React.FC<{ scan?: boolean; tint?: string }> = ({ scan = true, tint = C.cyan }) => {
  const t = useT();
  const { width: W, height: H } = useVideoConfig();
  const sy = ((t * 0.22) % 1) * (H + 200) - 100;
  return (
    <div style={{ position: 'absolute', width: W, height: H, background: C.hud, overflow: 'hidden' }}>
      {/* 32px 工程微点阵 7% */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.07) 1.3px, transparent 1.6px)',
          backgroundSize: '32px 32px',
          backgroundPosition: '16px 16px',
        }}
      />
      {/* 大网格 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(rgba(6,182,212,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.05) 1px, transparent 1px)`,
          backgroundSize: '256px 256px',
          backgroundPosition: '-32px -32px',
        }}
      />
      {/* 冷青雷达扫描线 */}
      {scan && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: sy,
            height: 140,
            background: `linear-gradient(180deg, rgba(6,182,212,0) 0%, rgba(6,182,212,0.06) 80%, rgba(6,182,212,0.28) 99%, ${tint} 100%)`,
            opacity: 0.55,
          }}
        />
      )}
      <HudTicks />
      <Vignette strength={0.7} />
    </div>
  );
};

/* 四周动态遥测刻度 */
export const HudTicks: React.FC = () => {
  const t = useT();
  const { width: W, height: H } = useVideoConfig();
  const ticks = [];
  const off = (t * 40) % 24;
  for (let x = -24; x < W + 24; x += 24) {
    const big = Math.round((x + 24) / 24) % 5 === 0;
    ticks.push(<div key={'t' + x} style={{ position: 'absolute', left: x + off, top: 22, width: 1, height: big ? 12 : 6, background: 'rgba(6,182,212,0.35)' }} />);
    ticks.push(<div key={'b' + x} style={{ position: 'absolute', left: x - off, bottom: 22, width: 1, height: big ? 12 : 6, background: 'rgba(6,182,212,0.35)' }} />);
  }
  return (
    <>
      {ticks}
      <div style={{ position: 'absolute', left: 36, top: 44, fontFamily: FONT.mono, fontSize: 15, letterSpacing: '0.18em', color: 'rgba(6,182,212,0.7)' }}>
        SYS.TELEMETRY · T+{t.toFixed(2).padStart(5, '0')}s
      </div>
      <div style={{ position: 'absolute', right: 36, top: 44, fontFamily: FONT.mono, fontSize: 15, letterSpacing: '0.18em', color: 'rgba(6,182,212,0.7)' }}>
        RX {(46 + 14 * Math.sin(t * 3.1)).toFixed(1)} · TX {(8 + 3 * Math.sin(t * 2.3 + 1)).toFixed(1)} MB/s
      </div>
    </>
  );
};

/* ───────────── 高端磨砂玻璃 ───────────── */
export const glass = (radius = 28, fill = 0.07): React.CSSProperties => ({
  borderRadius: radius,
  background: `linear-gradient(180deg, rgba(255,255,255,${fill + 0.04}) 0%, rgba(255,255,255,${fill}) 60%, rgba(255,255,255,${fill * 0.7}) 100%)`,
  backdropFilter: 'blur(28px) saturate(165%)',
  WebkitBackdropFilter: 'blur(28px) saturate(165%)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.24), inset 0 0 0 1px rgba(255,255,255,0.09), 0 30px 80px rgba(2,6,23,0.55), 0 8px 24px rgba(2,6,23,0.35)',
  boxSizing: 'border-box',
});

export const Glass: React.FC<{ style?: React.CSSProperties; radius?: number; fill?: number; children?: React.ReactNode }> = ({
  style,
  radius = 28,
  fill = 0.07,
  children,
}) => <div style={{ position: 'absolute', ...glass(radius, fill), ...style }}>{children}</div>;

/* ───────────── 2.5D 真机（CSS 3D + 物理接触投影） ───────────── */
export const Phone: React.FC<{
  w?: number; // 屏幕宽（px）
  src?: string;
  children?: React.ReactNode;
  glare?: number; // 0..1 扫光位置
  shadow?: boolean;
  dark?: boolean;
}> = ({ w = 380, src, children, glare = -1, shadow = true }) => {
  const h = w * 2;
  const bez = Math.round(w * 0.04);
  const r = w * 0.15;
  return (
    <div style={{ position: 'relative', width: w + bez * 2, height: h + bez * 2, transformStyle: 'preserve-3d' }}>
      {shadow && (
        <div
          style={{
            position: 'absolute',
            left: '8%',
            right: '8%',
            bottom: -w * 0.16,
            height: w * 0.16,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 70%)',
            transform: 'translateZ(-40px)',
            filter: 'blur(6px)',
          }}
        />
      )}
      {/* 机身：钛金属边框 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: r + bez,
          background: 'linear-gradient(145deg, #3a3f4b 0%, #14161c 35%, #0b0c10 60%, #2c303a 100%)',
          boxShadow:
            '0 0 0 1.5px rgba(255,255,255,0.14), inset 0 0 0 1px rgba(255,255,255,0.08), 0 50px 120px rgba(0,0,0,0.6), 0 18px 40px rgba(0,0,0,0.45)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: bez,
          top: bez,
          width: w,
          height: h,
          borderRadius: r,
          overflow: 'hidden',
          background: '#0b0c10',
        }}
      >
        {src && <Img src={staticFile(src)} style={{ width: w, height: h, display: 'block' }} />}
        {children}
        {/* 屏幕玻璃反光 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(125deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 28%, rgba(255,255,255,0) 50%)',
            pointerEvents: 'none',
          }}
        />
        {glare >= 0 && glare <= 1 && (
          <div
            style={{
              position: 'absolute',
              top: -h * 0.2,
              left: -w + glare * (w * 3),
              width: w * 0.45,
              height: h * 1.4,
              transform: 'rotate(18deg)',
              background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0) 100%)',
            }}
          />
        )}
      </div>
      {/* 灵动岛 */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: bez + w * 0.03,
          width: w * 0.27,
          height: w * 0.075,
          marginLeft: -w * 0.135,
          borderRadius: 99,
          background: '#000',
        }}
      />
    </div>
  );
};

/* ───────────── 品牌徽标（来自仓库 src/www/panel/icon.svg，可拆件用于 input-morph-assemble） ───────────── */
export const BrandMark: React.FC<{
  size: number;
  arc1?: number; // 0..1 外弧出现
  arc2?: number; // 内弧
  body?: number; // 路由机身
  plate?: number; // 底板
  slots?: number; // 构造虚线槽
  id?: string;
}> = ({ size, arc1 = 1, arc2 = 1, body = 1, plate = 1, slots = 0, id = 'bm' }) => {
  const drop = (k: number, dy: number) => `translate(0 ${(1 - k) * -dy})`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6a4dff" />
          <stop offset=".5" stopColor="#2f6bff" />
          <stop offset="1" stopColor="#00c2d8" />
        </linearGradient>
        <radialGradient id={`${id}p`} cx=".88" cy=".08" r=".8">
          <stop offset="0" stopColor="#ff5fb4" stopOpacity=".75" />
          <stop offset=".7" stopColor="#ff5fb4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}w`} cx=".3" cy="0" r=".7">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".7" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g opacity={plate}>
        <rect width="32" height="32" rx="8.9" fill={`url(#${id}g)`} />
        <rect width="32" height="32" rx="8.9" fill={`url(#${id}p)`} />
        <rect width="32" height="32" rx="8.9" fill={`url(#${id}w)`} />
      </g>
      {slots > 0 && (
        <g opacity={slots} fill="none" stroke="#9cc3ff" strokeWidth="0.35" strokeDasharray="0.9 0.7">
          <path d="M8.4 9.8a10.8 10.8 0 0 1 15.2 0" />
          <path d="M11.2 12.6a6.8 6.8 0 0 1 9.6 0" />
          <rect x="7.5" y="16" width="17" height="7.5" rx="2.4" />
        </g>
      )}
      <g transform={drop(body, 26)} opacity={Math.min(1, body * 3)}>
        <rect x="7.5" y="16" width="17" height="7.5" rx="2.4" fill="#fff" />
        <circle cx="11.4" cy="19.75" r="1.1" fill="#2f6bff" />
        <circle cx="14.6" cy="19.75" r="1.1" fill="#2f6bff" />
        <path d="M18 19.75h3.4" stroke="#2f6bff" strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <g transform={drop(arc2, 22)} opacity={Math.min(1, arc2 * 3)}>
        <path d="M11.2 12.6a6.8 6.8 0 0 1 9.6 0" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
      </g>
      <g transform={drop(arc1, 18)} opacity={Math.min(1, arc1 * 3)}>
        <path d="M8.4 9.8a10.8 10.8 0 0 1 15.2 0" stroke="#fff" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
};

/* ───────────── 光标（手指触点） ───────────── */
export const Tap: React.FC<{ x: number; y: number; press?: number; opacity?: number; ring?: number }> = ({
  x,
  y,
  press = 0,
  opacity = 1,
  ring = 0,
}) => (
  <div style={{ position: 'absolute', left: x - 22, top: y - 22, width: 44, height: 44, opacity, pointerEvents: 'none' }}>
    {ring > 0 && ring < 1 && (
      <div
        style={{
          position: 'absolute',
          left: 22 - 40 * ring,
          top: 22 - 40 * ring,
          width: 80 * ring,
          height: 80 * ring,
          borderRadius: '50%',
          border: `2px solid rgba(255,255,255,${0.8 * (1 - ring)})`,
        }}
      />
    )}
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0.08) 70%)',
        transform: `scale(${1 - 0.25 * press})`,
        boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
      }}
    />
  </div>
);

/* 胶囊 */
export const Pill: React.FC<{ color?: string; bg?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({
  color = C.text,
  bg = 'rgba(255,255,255,0.08)',
  style,
  children,
}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 18px',
      borderRadius: 999,
      background: bg,
      color,
      fontFamily: FONT.sans,
      fontWeight: 600,
      fontSize: 22,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 0 0 1px rgba(255,255,255,0.08)',
      ...style,
    }}
  >
    {children}
  </div>
);

/* 状态点 */
export const Dot: React.FC<{ color: string; size?: number; glow?: boolean }> = ({ color, size = 10, glow = true }) => (
  <span
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      boxShadow: glow ? `0 0 ${size * 1.4}px ${color}` : undefined,
      flex: 'none',
    }}
  />
);

/* 文本入场：opacity + 8~16px 上浮（极光风格只用 opacity+位移） */
export const Rise: React.FC<{ t: number; at: number; dur?: number; dy?: number; out?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  t,
  at,
  dur = 0.6,
  dy = 14,
  out,
  children,
  style,
}) => {
  const k = ramp(t, at, dur, EASE.out);
  const o = out !== undefined ? 1 - ramp(t, out, 0.35, EASE.exit) : 1;
  return (
    <div style={{ opacity: k * o, transform: `translateY(${(1 - k) * dy - (1 - o) * 10}px)`, ...style }}>{children}</div>
  );
};
