// v4 共用件：窗口（PageCam 装进玻璃窗）、描边圈、关键词、手机外框。
import React from 'react';
import { Img, staticFile } from 'remotion';
import { C, F, glass } from '../lib/look';
import { EASE, clamp01, mix, ramp } from '../lib/ease';
import { CamKey, PageCam } from '../lib/PageCam';
import LAYOUT4 from '../../public/ui/layout-v4.json';
import LAYOUT from '../../public/ui/layout.json';

export type Rect = { x: number; y: number; w: number; h: number };
export const L4 = { ...(LAYOUT as any), ...(LAYOUT4 as any) } as Record<string, Record<string, any>>;

// 窗口：16:9 玻璃窗，里面是一台 1920×1080 的 PageCam，整体缩到窗口大小
export const Win: React.FC<{
  src: string; keys: CamKey[]; f: number; x: number; y: number; w: number; pageH?: number; ease?: (t: number) => number;
  style?: React.CSSProperties; children?: React.ReactNode; radius?: number;
}> = ({ src, keys, f, x, y, w, pageH = 1200, ease = EASE.smooth, style, children, radius = 26 }) => {
  const h = (w * 9) / 16;
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: radius, overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.3), 0 50px 120px -30px rgba(0,0,0,0.85)', background: '#0b0e1c', ...style }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: `scale(${(w / 1920).toFixed(5)})` }}>
        <PageCam src={src} pageH={pageH} keys={keys} ease={ease} frame={f}>{children}</PageCam>
      </div>
    </div>
  );
};

// 描边圈：沿圆角矩形画一圈（页面坐标系里用，放进 PageCam 的 children）
export const Ring: React.FC<{ r: Rect; p: number; pad?: number; radius?: number; width?: number; color?: string; glow?: number }> = ({ r, p, pad = 8, radius = 18, width = 4, color = '#7fb2ff', glow = 1 }) => {
  if (p <= 0) return null;
  const x = r.x - pad, y = r.y - pad, w = r.w + pad * 2, h = r.h + pad * 2;
  const len = 2 * (w + h - 4 * radius) + 2 * Math.PI * radius;
  return (
    <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1} height={1}>
      <rect x={x} y={y} width={w} height={h} rx={radius} fill="none" stroke={color} strokeWidth={width * 3} opacity={0.25 * glow} strokeDasharray={`${len * clamp01(p)} ${len}`} style={{ filter: 'blur(4px)' }} />
      <rect x={x} y={y} width={w} height={h} rx={radius} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={`${len * clamp01(p)} ${len}`} />
    </svg>
  );
};

// 关键词：编号 + 大字。进场：从下带模糊滑入；出场：向上带模糊滑出（pill-slot-cycle 的一格）
export const Keyword: React.FC<{ f: number; at: number; out: number; idx?: string; text: string; x?: number; y?: number; size?: number; sub?: string }> = ({ f, at, out, idx, text, x = 120, y = 420, size = 112, sub }) => {
  const pin = ramp(f, at - 2, 12, EASE.snappy);
  const pout = ramp(f, out - 4, 10, EASE.swift);
  if (pin <= 0 || pout >= 1) return null;
  const o = pin * (1 - pout);
  const dy = (1 - pin) * 60 - pout * 60;
  const bl = (1 - pin) * 14 + pout * 14;
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: o, transform: `translateY(${dy.toFixed(1)}px)`, filter: bl > 0.3 ? `blur(${bl.toFixed(1)}px)` : undefined }}>
      {idx && <div style={{ fontFamily: F.mono, fontSize: 30, fontWeight: 600, color: 'rgba(200,214,255,0.7)', letterSpacing: '0.08em', marginBottom: 18 }}>{idx}</div>}
      <div style={{ fontFamily: F.sans, fontSize: size, fontWeight: 800, color: C.text, letterSpacing: '0.02em', lineHeight: 1.08, whiteSpace: 'pre' }}>{text}</div>
      {sub && <div style={{ marginTop: 22, fontFamily: F.sans, fontSize: 36, fontWeight: 500, color: 'rgba(228,232,255,0.72)', letterSpacing: '0.04em' }}>{sub}</div>}
    </div>
  );
};

// 手机外框里放一张手机截图（3x，390pt 宽）
export const Phone: React.FC<{ src: string; h: number; style?: React.CSSProperties; crop?: number }> = ({ src, h, style, crop = 844 }) => {
  const w = (h * 390) / crop;
  return (
    <div style={{ position: 'absolute', width: w + 24, height: h + 24, borderRadius: 64, padding: 12, background: 'linear-gradient(160deg,#2a2f45,#0e1120)', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.22), 0 50px 120px -30px rgba(0,0,0,0.85)', ...style }}>
      <div style={{ width: w, height: h, borderRadius: 52, overflow: 'hidden', position: 'relative' }}>
        <Img src={staticFile(src)} style={{ width: w, display: 'block' }} />
      </div>
    </div>
  );
};

export const DemoLabel: React.FC<{ text?: string; opacity?: number }> = ({ text = '界面为真实面板 · 数据为演示数据', opacity = 1 }) => (
  <div style={{ position: 'absolute', left: 64, bottom: 40, fontFamily: F.sans, fontSize: 26, color: 'rgba(228,232,255,0.6)', opacity, letterSpacing: '0.04em' }}>{text}</div>
);

// 拍点微动：只作用主角元素层（aesthetic-rules R4），每拍 1.5% 的轻推
export const pulse = (f: number, beatF: number, phase: number, amt = 0.015) => {
  const k = ((f - phase) % beatF + beatF) % beatF;
  return 1 + amt * Math.exp(-k / 3.5);
};

export const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), w: mix(a.w, b.w, t), h: mix(a.h, b.h, t) });
export const glassBox = glass;
