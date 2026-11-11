// 缓动与时间轴原语。bezier/EASE/ramp 取自 video-shotcraft demos/_fixtures/Polish.tsx（调校过的曲线）。
import { spring } from 'remotion';

export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  if (x1 === y1 && x2 === y2) return (t: number) => clamp01(t);
  const ax = 1 - 3 * x2 + 3 * x1, bx = 3 * x2 - 6 * x1, cx = 3 * x1;
  const ay = 1 - 3 * y2 + 3 * y1, by = 3 * y2 - 6 * y1, cy = 3 * y1;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  const solve = (x: number) => {
    let u = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(u) - x;
      if (Math.abs(err) < 1e-7) return u;
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= err / d;
    }
    let lo = 0, hi = 1;
    u = x;
    for (let i = 0; i < 30; i++) {
      const v = sx(u);
      if (Math.abs(v - x) < 1e-7) break;
      if (x > v) lo = u; else hi = u;
      u = (lo + hi) / 2;
    }
    return u;
  };
  return (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : sy(solve(t)));
};

export const EASE = {
  snappy: bezier(0.16, 1, 0.3, 1),
  out: bezier(0.22, 1, 0.36, 1),
  smooth: bezier(0.65, 0, 0.35, 1),
  swift: bezier(0.4, 0, 0.2, 1),
  exit: bezier(0.7, 0, 0.84, 0),
  overshoot: bezier(0.34, 1.45, 0.64, 1),
  // 面板自己的 --spring: cubic-bezier(.32,.72,0,1)，全片的「产品嗓音」
  panel: bezier(0.32, 0.72, 0, 1),
  sine: (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t)),
  brake: bezier(0.45, 0, 0.06, 1), // changelog-scroll-brake 的急刹曲线
  linear: (t: number) => clamp01(t),
};

export const ramp = (frame: number, start: number, dur: number, ease: (t: number) => number = EASE.panel) =>
  ease(clamp01((frame - start) / Math.max(1, dur)));

// 一进一出：start 起淡入 inDur，到 end 前 outDur 淡出
export const life = (f: number, start: number, end: number, inDur = 14, outDur = 12) =>
  Math.min(ramp(f, start, inDur, EASE.out), 1 - ramp(f, end - outDur, outDur, EASE.swift));

export const springAt = (frame: number, start: number, cfg: { damping?: number; stiffness?: number; mass?: number } = {}) =>
  spring({ frame: frame - start, fps: 30, config: { damping: cfg.damping ?? 14, stiffness: cfg.stiffness ?? 170, mass: cfg.mass ?? 0.9 } });

// 确定性伪随机（禁 Math.random）
export const hash = (n: number) => {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
};
export const mulberry32 = (a: number) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// 数值速度（每帧位移），喂给 SpeedBlur
export const velocity = (f: (frame: number) => number, frame: number) => f(frame + 0.5) - f(frame - 0.5);
