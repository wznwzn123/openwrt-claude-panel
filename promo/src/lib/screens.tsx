import React from 'react';
import { Img, staticFile } from 'remotion';
import { C, EASE, FONT, mix, ramp } from './core';
import { Dot } from './visual';

/* 真实首页截图 + 实时流淌的上下行网速曲线（叠在原图表区，原图 390×780 坐标） */
export const HomeLive: React.FC<{ t: number; w: number; dark?: boolean }> = ({ t, w, dark }) => {
  const k = w / 390;
  const N = 48;
  const wave = (u: number, ph: number) => 0.5 + 0.22 * Math.sin(u * 0.33 + ph) + 0.12 * Math.sin(u * 0.91 + ph * 2) + 0.08 * Math.sin(u * 1.7);
  const flow = t * 7;
  const cw = 332, ch = 96;
  const mk = (ph: number, amp: number, off: number) =>
    Array.from({ length: N + 1 }, (_, i) => [(i / N) * cw, ch - (off + amp * wave(i + flow, ph)) * ch] as const);
  const down = mk(0, 0.62, 0.22);
  const up = mk(2.1, 0.18, 0.04);
  const path = (p: readonly (readonly [number, number])[]) => p.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const bgA = dark ? 'rgb(22,21,36)' : 'rgb(240,245,253)';
  const bgB = dark ? 'rgb(19,28,39)' : 'rgb(251,245,252)';
  const last = down[down.length - 1];
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Img src={staticFile(dark ? 'shots/dark.png' : 'shots/home.png')} style={{ width: w, height: w * 2, display: 'block' }} />
      <div style={{ position: 'absolute', left: 22 * k, top: 226 * k, width: 346 * k, height: 114 * k, background: `linear-gradient(90deg, ${bgA}, ${bgB})` }}>
        <svg width={346 * k} height={114 * k} viewBox={`-7 -9 346 114`} style={{ display: 'block' }}>
          <defs>
            <linearGradient id={`hl${dark ? 'd' : 'l'}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2f7bff" stopOpacity={dark ? 0.45 : 0.32} />
              <stop offset="1" stopColor="#2f7bff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path(down)} L${cw} ${ch} L0 ${ch} Z`} fill={`url(#hl${dark ? 'd' : 'l'})`} />
          <path d={path(down)} fill="none" stroke="#1d7bf5" strokeWidth={2.4} strokeLinejoin="round" />
          <path d={path(up)} fill="none" stroke="#22b8c6" strokeWidth={2} strokeLinejoin="round" />
          <circle cx={last[0]} cy={last[1]} r={4} fill="#1d7bf5" />
          <circle cx={last[0]} cy={last[1]} r={9} fill="#1d7bf5" opacity={0.25 + 0.15 * Math.sin(t * 8)} />
        </svg>
      </div>
    </div>
  );
};

/* 「自定义相册背景 · 磨砂玻璃」主题：真实首页卡片叠在相册暖色背景上（multiply 透出背景色） */
export const HomePhotoTheme: React.FC<{ t: number; w: number }> = ({ t, w }) => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(circle at 20% 15%, #ffb38a 0%, rgba(255,179,138,0) 45%), radial-gradient(circle at 85% 40%, #ff7eb6 0%, rgba(255,126,182,0) 50%), radial-gradient(circle at 40% 85%, #7cc4ff 0%, rgba(124,196,255,0) 55%), linear-gradient(160deg, #ffd6a5, #c3a6ff)',
      }}
    />
    <div style={{ position: 'absolute', inset: 0, mixBlendMode: 'multiply' }}>
      <HomeLive t={t} w={w} />
    </div>
  </div>
);

/* 自绘玻璃 UI 的通用小件（片中无真实截图对应的界面：插件识别 / 节点测速 / 中文设备名示意） */
export const ScreenShell: React.FC<{ title: string; sub?: string; children: React.ReactNode; badge?: React.ReactNode; dark?: boolean }> = ({
  title,
  sub,
  children,
  badge,
}) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      fontFamily: FONT.sans,
      color: '#0b0b0f',
      background:
        'radial-gradient(circle at 15% 10%, #dfe7ff 0%, rgba(223,231,255,0) 50%), radial-gradient(circle at 90% 70%, #f3dcff 0%, rgba(243,220,255,0) 55%), #eef1f8',
      padding: '58px 16px 16px',
      boxSizing: 'border-box',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{ fontSize: 24, fontWeight: 800 }}>{title}</div>
      <div style={{ marginLeft: 'auto' }}>{badge}</div>
    </div>
    {sub && <div style={{ fontSize: 13, color: '#6e6e73', marginTop: -8, marginBottom: 12, lineHeight: 1.45 }}>{sub}</div>}
    {children}
  </div>
);

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      background: 'rgba(255,255,255,0.66)',
      borderRadius: 18,
      boxShadow: 'inset 0 0 0 .5px rgba(255,255,255,.65), 0 8px 28px rgba(31,38,80,.08)',
      padding: '12px 14px',
      marginBottom: 10,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Toggle: React.FC<{ on: number }> = ({ on }) => (
  <div style={{ width: 46, height: 28, borderRadius: 14, background: `rgba(${mix(120, 52, on)},${mix(120, 199, on)},${mix(128, 89, on)},${mix(0.25, 1, on)})`, position: 'relative', flex: 'none' }}>
    <div style={{ position: 'absolute', top: 2, left: 2 + 18 * on, width: 24, height: 24, borderRadius: 12, background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }} />
  </div>
);

export const OkBadge: React.FC<{ text: string; color?: string }> = ({ text, color = C.ok }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 99, background: `${color}22`, color, fontSize: 12, fontWeight: 700 }}>
    <Dot color={color} size={6} glow={false} />
    {text}
  </span>
);

/* 数字滚动锁定（机械表盘感：先高速跳变，后落定真值） */
export const rollNum = (t: number, at: number, dur: number, target: number, seed: number) => {
  if (t < at) return '--';
  if (t >= at + dur) return String(target);
  const k = ramp(t, at, dur, EASE.linear);
  const v = Math.floor(Math.abs(Math.sin((t * 60 + seed) * 12.9898) * 437) % 300);
  return String(Math.round(mix(v, target, k * k)));
};
