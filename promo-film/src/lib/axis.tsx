// 时间轴共用件：里程碑卡、刻度、提交计数。Travel（10.31–11.01）和 Rush（11.07–11.09）共用。
// 镜头卡 timeline-travel：卡片在相机到达前 6f 从轴上 spring 立起（damping 11，明显过冲），节点同拍点亮。
import React from 'react';
import { C, Chip, F, glass } from './look';
import { Rect, Region } from './shot';
import { EASE, ramp, springAt } from './ease';

// img：电脑端截图里的一块（page + rect 来自 layout.json），w = 显示宽度
export type Mile = { v: string; date: string; time: string; title: string; desc: string; n: number; img?: { page: string; rect: Rect; pad?: number; w: number; dx?: number; dy?: number; note?: string }; night?: boolean };

export const AXIS_Y = 760;

export const MileCard: React.FC<{ m: Mile; x: number; f: number; pop: number; hero?: boolean; compact?: boolean; dim?: number }> = ({ m, x, f, pop, hero, compact, dim = 0 }) => {
  const s = springAt(f, pop, { damping: 11, stiffness: 160, mass: 0.9 });
  const lit = ramp(f, pop, 6, EASE.out);
  const W = compact ? 620 : 700;
  const imgP = m.img ? springAt(f, pop + 8, { damping: 15, stiffness: 120 }) : 0;
  return (
    <div style={{ position: 'absolute', left: x, top: 0, opacity: 1 - dim * 0.55 }}>
      {/* 节点 */}
      <div style={{ position: 'absolute', left: -22, top: AXIS_Y - 22, width: 44, height: 44, borderRadius: 22, background: `rgba(140,170,255,${(0.22 * lit).toFixed(3)})`, transform: `scale(${(0.5 + 0.5 * lit).toFixed(3)})` }} />
      <div style={{ position: 'absolute', left: -9, top: AXIS_Y - 9, width: 18, height: 18, borderRadius: 9, background: lit > 0.5 ? '#fff' : 'transparent', boxShadow: `0 0 0 2.5px ${C.line}, 0 0 ${(24 * lit).toFixed(1)}px rgba(160,190,255,0.9)` }} />
      {/* 轴下：日期 + 时间 */}
      <div style={{ position: 'absolute', left: -200, width: 400, top: AXIS_Y + 30, textAlign: 'center', fontFamily: F.mono, fontSize: 26, color: C.dim, opacity: lit, letterSpacing: '0.04em' }}>
        {m.date}　<span style={{ color: m.night ? '#ffd28a' : C.dim }}>{m.time}</span>
      </div>
      {/* 连杆 */}
      <div style={{ position: 'absolute', left: -1, top: AXIS_Y - 70 * s, width: 2, height: Math.max(0, 70 * s - 12), background: 'rgba(238,242,255,0.5)' }} />
      {/* 卡片：底边为轴立起 */}
      <div style={{ position: 'absolute', left: -W / 2, top: AXIS_Y - 70 - 300, width: W, height: 300, transformOrigin: '50% 100%', transform: `scaleY(${Math.max(0, s).toFixed(4)})`, opacity: Math.min(1, s * 1.4) }}>
        <div style={{ ...glass({ radius: 30, fill: hero ? 0.13 : 0.09 }), position: 'absolute', inset: 0, padding: '34px 40px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Chip color={hero ? 'linear-gradient(120deg,#6a4dff,#2f6bff)' : undefined}>{m.v}</Chip>
            {m.night && <Chip style={{ color: '#ffd28a', background: 'rgba(255,190,90,0.12)' }}>凌晨</Chip>}
            <span style={{ marginLeft: 'auto', fontFamily: F.mono, fontSize: 22, color: C.faint }}>第 {m.n} 次提交</span>
          </div>
          <div style={{ marginTop: 28, fontSize: 54, fontWeight: 700, letterSpacing: '-0.01em', color: C.text, whiteSpace: 'nowrap' }}>{m.title}</div>
          <div style={{ marginTop: 16, fontSize: 30, lineHeight: 1.45, color: C.dim }}>{m.desc}</div>
        </div>
      </div>
      {/* 配图：真实面板截图（演示数据），浮在卡片右上方 */}
      {m.img && (() => {
        const pad = m.img.pad ?? 0;
        const ih = ((m.img.rect.h + pad * 2) / (m.img.rect.w + pad * 2)) * m.img.w;
        return (
          <div style={{ position: 'absolute', left: W / 2 - 80 + (m.img.dx ?? 0), top: AXIS_Y - 70 - 300 - ih + 44 + (m.img.dy ?? 0), width: m.img.w, height: ih, opacity: Math.min(1, imgP * 1.3), transform: `translateY(${((1 - imgP) * 60).toFixed(1)}px) rotate(${((1 - imgP) * 4).toFixed(2)}deg)`, transformOrigin: '0% 100%' }}>
            <Region page={m.img.page} rect={m.img.rect} pad={pad} width={m.img.w} radius={22} style={{ boxShadow: '0 40px 90px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.25)' }} />
            {m.img.note && <div style={{ position: 'absolute', left: 0, top: ih + 14, fontSize: 20, color: C.faint, whiteSpace: 'nowrap' }}>{m.img.note}</div>}
          </div>
        );
      })()}
    </div>
  );
};

// 提交计数 HUD：数字变化时旧的上滑淡出、新的从下滑入
export const CommitHud: React.FC<{ f: number; marks: { at: number; n: number }[]; label?: string; opacity?: number }> = ({ f, marks, label = '提交', opacity = 1 }) => {
  let k = 0;
  for (let i = 0; i < marks.length; i++) if (f >= marks[i].at) k = i;
  const p = ramp(f, marks[k].at, 10, EASE.snappy);
  const prev = k > 0 ? marks[k - 1].n : null;
  return (
    <div style={{ position: 'absolute', left: 72, top: 64, display: 'flex', alignItems: 'baseline', gap: 16, opacity, fontFamily: F.mono }}>
      <span style={{ fontSize: 22, color: C.faint, letterSpacing: '0.12em' }}>{label}</span>
      <span style={{ position: 'relative', display: 'inline-block', width: 130, height: 56, overflow: 'hidden' }}>
        {prev != null && p < 1 && <span style={{ position: 'absolute', left: 0, top: 0, fontSize: 48, fontWeight: 600, color: C.text, transform: `translateY(${(-p * 50).toFixed(1)}px)`, opacity: 1 - p }}>#{prev}</span>}
        <span style={{ position: 'absolute', left: 0, top: 0, fontSize: 48, fontWeight: 600, color: C.text, transform: `translateY(${((1 - p) * 50).toFixed(1)}px)`, opacity: p }}>#{marks[k].n}</span>
      </span>
      <span style={{ fontSize: 22, color: C.faint }}>/ 94</span>
    </div>
  );
};
