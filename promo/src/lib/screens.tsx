import React from 'react';
import { Img, staticFile } from 'remotion';
import { C, EASE, FONT, mix, ramp } from './core';
import { Dot } from './visual';

/* 真实面板首页（仓库 src/www/panel 实机渲染，3× 截图）+ 叠一条与面板 mChart 同算法的实时流动曲线
   坐标取自 capture/capture.js 量出的 #mChart 位置（CSS px，视口 393 宽） */
const CHART = { x: 31, y: 275.77, w: 331, h: 120 };
const liveWave = (i: number, s: number) =>
  s * Math.max(0.08, 1 + 0.42 * Math.sin(i * 0.23 + 0.6) + 0.22 * Math.sin(i * 0.71 + 1.3) + 0.12 * Math.sin(i * 1.9 + 0.2) + 0.5 * Math.exp(-(((i % 60) - 48) ** 2) / 10));
export const HomeLive: React.FC<{ t: number; w: number; dark?: boolean }> = ({ t, w, dark }) => {
  const k = w / 393;
  const N = 60;
  const VW = 300, VH = 110;
  const flow = t * 2.2; // 每秒推进 2.2 个采样点
  const f0 = Math.floor(flow), fr = flow - f0;
  const rx = Array.from({ length: N + 1 }, (_, i) => liveWave(i + f0, 7.5));
  const tx = Array.from({ length: N + 1 }, (_, i) => liveWave(i + f0 + 9, 0.6));
  const max = Math.max(1, ...rx, ...tx) * 1.15;
  const pts = (arr: number[]) => arr.map((v, i) => [(VW * (i - fr)) / (N - 1), VH - 4 - (v / max) * (VH - 10)] as const);
  const line = (p: readonly (readonly [number, number])[]) => p.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('');
  const r = pts(rx), u = pts(tx);
  const brand = dark ? '#0a84ff' : '#007aff';
  const upl = dark ? '#40c8e0' : '#30b0c7';
  const id = `mg${dark ? 'd' : 'l'}`;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Img src={staticFile(dark ? 'shots/real/main-nochart-dark.png' : 'shots/real/main-nochart.png')} style={{ width: w, height: w * (852 / 393), display: 'block' }} />
      <svg width={CHART.w * k} height={CHART.h * k} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" style={{ position: 'absolute', left: CHART.x * k, top: CHART.y * k, overflow: 'hidden' }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={brand} stopOpacity={0.32} />
            <stop offset="1" stopColor={brand} stopOpacity={0} />
          </linearGradient>
        </defs>
        <line x1={0} y1={VH / 2} x2={VW} y2={VH / 2} stroke={dark ? 'rgba(84,84,88,.55)' : 'rgba(60,60,67,.14)'} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        <path d={`${line(r)}L${r[r.length - 1][0].toFixed(1)} ${VH}L${r[0][0].toFixed(1)} ${VH}Z`} fill={`url(#${id})`} />
        <path d={line(r)} fill="none" stroke={brand} strokeWidth={2 * k} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={line(u)} fill="none" stroke={upl} strokeWidth={1.8 * k} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
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

/* 自绘玻璃 UI 的通用小件（片中无真实截图对应的界面：扩展套件识别 / 线路测速 / 中文设备名示意） */
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
