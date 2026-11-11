// 「一根线」：全片的主线。折线几何 + 按长度生长 + 笔头（line-art 的领先笔尖）。
// 生长写法参照 video-shotcraft line-carry-transition：线与笔头在模糊层外、始终锐利；笔头是全片唯一的亮点，观众只追这一个点。
import React from 'react';
import { C } from './look';

export type Pt = [number, number];

export class Poly {
  pts: Pt[];
  cum: number[];
  len: number;
  constructor(pts: Pt[]) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.len = this.cum[this.cum.length - 1];
  }
  idx(s: number) {
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    return lo;
  }
  at(s: number): Pt {
    s = Math.max(0, Math.min(this.len, s));
    const i = this.idx(s);
    const seg = this.cum[i + 1] - this.cum[i] || 1;
    const t = (s - this.cum[i]) / seg;
    const a = this.pts[i], b = this.pts[Math.min(i + 1, this.pts.length - 1)];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  // 从 s0 到 s1 的 path（s 用长度单位）
  d(s0: number, s1: number) {
    s0 = Math.max(0, s0); s1 = Math.min(this.len, s1);
    if (s1 <= s0) return '';
    const i0 = this.idx(s0), i1 = this.idx(s1);
    const a = this.at(s0);
    let out = `M${a[0].toFixed(2)} ${a[1].toFixed(2)}`;
    for (let i = i0 + 1; i <= i1; i++) out += `L${this.pts[i][0].toFixed(2)} ${this.pts[i][1].toFixed(2)}`;
    const b = this.at(s1);
    return out + `L${b[0].toFixed(2)} ${b[1].toFixed(2)}`;
  }
}

export const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 48): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt; });

// 圆角矩形（从左边中点开始，逆时针：向下 → 底边 → 右边 → 顶边 → 回到左边中点）
export const roundRect = (x: number, y: number, w: number, h: number, r: number, n = 10): Pt[] => {
  const P: Pt[] = [[x, y + h / 2], [x, y + h - r]];
  P.push(...arc(x + r, y + h - r, r, Math.PI, Math.PI / 2, n).slice(1));
  P.push([x + w - r, y + h]);
  P.push(...arc(x + w - r, y + h - r, r, Math.PI / 2, 0, n).slice(1));
  P.push([x + w, y + r]);
  P.push(...arc(x + w - r, y + r, r, 0, -Math.PI / 2, n).slice(1));
  P.push([x + r, y]);
  P.push(...arc(x + r, y + r, r, -Math.PI / 2, -Math.PI, n).slice(1));
  P.push([x, y + h / 2]);
  return P;
};

// 产品图标（icon.svg，32 网格）一笔画：指示灯 → 机身一圈 → 天线 → 内弧右半 → 沿半径出 → 外弧整段 → 沿半径回 → 内弧左半
// 两条弧同心（圆心约 16,17.45），半径 6.8 / 10.8，弧端正好在 45° 射线上，所以能一笔连起来。
export const iconPath = (ox: number, oy: number, s: number): Pt[] => {
  const p = (x: number, y: number): Pt => [ox + x * s, oy + y * s];
  const cx = 16, cy = 17.45, r1 = 6.82, r2 = 10.82, R = 2.4;
  const deg = Math.PI / 180;
  const A = (x: number, y: number, a0: number, a1: number) => arc(x, y, R, a0 * deg, a1 * deg, 8).map(([u, v]) => p(u, v));
  // 机身 7.5..24.5 × 16..23.5，圆角 2.4：从顶边中点出发顺时针一圈，回到顶边中点
  const out: Pt[] = [p(16, 16), p(24.5 - R, 16)];
  out.push(...A(24.5 - R, 16 + R, -90, 0), p(24.5, 23.5 - R));
  out.push(...A(24.5 - R, 23.5 - R, 0, 90), p(7.5 + R, 23.5));
  out.push(...A(7.5 + R, 23.5 - R, 90, 180), p(7.5, 16 + R));
  out.push(...A(7.5 + R, 16 + R, 180, 270), p(16, 16));
  // 天线
  out.push(p(16, cy - r1));
  out.push(...arc(cx, cy, r1, -90 * deg, -45 * deg, 14).map(([x, y]) => p(x, y)));
  out.push(...arc(cx, cy, r2, -45 * deg, -135 * deg, 40).map(([x, y]) => p(x, y)));
  out.push(...arc(cx, cy, r1, -135 * deg, -90 * deg, 14).map(([x, y]) => p(x, y)));
  return out;
};

// 产品图标的真实几何（src/www/panel/icon.svg，32 网格）拆成三笔：机身圆角矩形一圈 → 内弧 → 外弧（外弧原图是 55% 透明）。
// 内弧：(11.2,12.6)→(20.8,12.6)，r=6.8；外弧：(8.4,9.8)→(23.6,9.8)，r=10.8；圆心都在 x=16、y≈17.45，角度 -135°→-45°。
// 线画的就是图标本身的形状，所以真实图标亮起时读作「线变成了图标」，而不是换了一张图。
export const iconStrokes = (ox: number, oy: number, s: number): Poly[] => {
  const p = (x: number, y: number): Pt => [ox + x * s, oy + y * s];
  const R = 2.4, deg = Math.PI / 180;
  const A = (x: number, y: number, a0: number, a1: number) => arc(x, y, R, a0 * deg, a1 * deg, 8).map(([u, v]) => p(u, v));
  const body: Pt[] = [p(16, 16), p(24.5 - R, 16)];
  body.push(...A(24.5 - R, 16 + R, -90, 0), p(24.5, 23.5 - R));
  body.push(...A(24.5 - R, 23.5 - R, 0, 90), p(7.5 + R, 23.5));
  body.push(...A(7.5 + R, 23.5 - R, 90, 180), p(7.5, 16 + R));
  body.push(...A(7.5 + R, 16 + R, 180, 270), p(16, 16));
  const inner = arc(16, 17.42, 6.8, -135 * deg, -45 * deg, 36).map(([x, y]) => p(x, y));
  const outer = arc(16, 17.47, 10.8, -135 * deg, -45 * deg, 48).map(([x, y]) => p(x, y));
  return [new Poly(body), new Poly(inner), new Poly(outer)];
};

// 多笔：按总进度依次画每一笔，笔与笔之间笔头抬起、沿直线跳过去（跳的距离也算进进度，速度连续）
export const MultiStroke: React.FC<{ polys: Poly[]; p: number; width?: number; glow?: number; opacity?: number; dim?: number[] }> = ({ polys, p, width = 4, glow = 1, opacity = 1, dim = [] }) => {
  const hops = polys.slice(1).map((q, i) => { const a = polys[i].at(polys[i].len), b = q.at(0); return Math.hypot(b[0] - a[0], b[1] - a[1]); });
  const total = polys.reduce((s, q) => s + q.len, 0) + hops.reduce((s, h) => s + h, 0);
  let left = Math.max(0, Math.min(1, p)) * total;
  const out: React.ReactNode[] = [];
  let nib: Pt | null = null;
  for (let i = 0; i < polys.length; i++) {
    const q = polys[i];
    const take = Math.min(q.len, left);
    if (take > 0) out.push(<Stroke key={i} poly={q} s1={take} width={width} glow={glow} nib={0} opacity={dim[i] ?? 1} />);
    if (left < q.len) { if (take > 0 || i === 0) nib = q.at(take); break; }
    left -= q.len;
    if (i < hops.length) {
      if (left < hops[i]) { const a = q.at(q.len), b = polys[i + 1].at(0), k = left / hops[i]; nib = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - Math.sin(k * Math.PI) * 24]; break; }
      left -= hops[i];
    }
  }
  return (
    <g opacity={opacity}>
      {out}
      {nib && p < 1 && <Nib x={nib[0]} y={nib[1]} />}
    </g>
  );
};

// 画一段线：glow 双层（宽而淡的光晕 + 细芯），笔头在 tip
export const Stroke: React.FC<{
  poly: Poly; s0?: number; s1: number; width?: number; color?: string; glow?: number; nib?: number; dash?: string; opacity?: number;
}> = ({ poly, s0 = 0, s1, width = 3, color = C.line, glow = 1, nib = 1, dash, opacity = 1 }) => {
  const d = poly.d(s0, s1);
  if (!d) return null;
  const tip = poly.at(s1);
  return (
    <g opacity={opacity}>
      {glow > 0 && <path d={d} fill="none" stroke="rgba(150,180,255,0.35)" strokeWidth={width * 5} strokeLinecap="round" strokeLinejoin="round" opacity={glow} style={{ filter: 'blur(6px)' }} strokeDasharray={dash} />}
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
      {nib > 0 && s1 < poly.len - 0.5 && <Nib x={tip[0]} y={tip[1]} k={nib} />}
    </g>
  );
};

export const Nib: React.FC<{ x: number; y: number; k?: number; color?: string }> = ({ x, y, k = 1, color = '#ffffff' }) => (
  <g opacity={Math.min(1, k)}>
    <circle cx={x} cy={y} r={26 * k} fill="url(#nibGlow)" />
    <circle cx={x} cy={y} r={5.5 * k} fill={color} />
  </g>
);

// 每个 SVG 里放一次：笔头光晕渐变
export const NibDefs: React.FC = () => (
  <defs>
    <radialGradient id="nibGlow">
      <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
      <stop offset="0.25" stopColor="#bcd0ff" stopOpacity="0.45" />
      <stop offset="1" stopColor="#6a4dff" stopOpacity="0" />
    </radialGradient>
  </defs>
);
