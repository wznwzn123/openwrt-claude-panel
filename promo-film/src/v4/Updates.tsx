// 更新（第 32–35 小节）：版本号每半拍翻一个，v1.0 → v3.1.1（20 个版本）；下面是十天里 94 次提交的刻度（git 历史，北京时间），
// 播放头跟着版本时间走，走过的刻度亮起；11.02–11.06 没有提交，画成虚线。第 34 小节：10 天 · 20 个版本 · 94 次提交。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import commits from '../data/commits.json';
import { C, F, glass } from '../lib/look';
import { EASE, mix, ramp, springAt } from '../lib/ease';
import { B } from './beat';
import { Keyword } from './kit';

// 版本 + 第一次出现的时间（提交说明 / tools/release-notes.md）
const VERS: [string, string][] = [
  ['v1.0', '10.31 11:01'], ['v1.1', '10.31 16:08'], ['v1.2', '10.31 21:26'], ['v1.3.0', '11.01 02:12'], ['v1.3.1', '11.01 03:14'],
  ['v2.0', '11.01 11:41'], ['v2.0.1', '11.01 15:22'], ['v2.0.2', '11.01 16:06'], ['v2.0.3', '11.01 17:17'], ['v2.0.4', '11.07 02:14'],
  ['v2.0.5', '11.07 02:37'], ['v2.0.6', '11.07 09:29'], ['v2.0.7', '11.07 10:56'], ['v2.0.8', '11.07 15:32'], ['v3.0', '11.07 16:40'],
  ['v3.0.1', '11.08 01:10'], ['v3.0.2', '11.08 09:52'], ['v3.0.3', '11.08 11:15'], ['v3.1.0', '11.08 23:14'], ['v3.1.1', '11.09 01:29'],
];
// 每半拍翻一个：从第 32 小节强拍开始，19 次翻到第 34 小节第 1.5 拍
export const VER_AT = VERS.map((_, i) => B(32, i * 0.5));
const DAY_W = 160, PX0 = 160;
const tx = (t: string) => { const [md, hm] = t.split(' '); const [mo, d] = md.split('.').map(Number); const [h, m] = hm.split(':').map(Number); const day = mo === 10 ? d - 31 : d; return PX0 + (day + (h + m / 60) / 24) * DAY_W; };
const TICKS = (() => { const seen: Record<number, number> = {}; return (commits as { t: string }[]).map((c) => { const x = tx(c.t), b = Math.round(x / 9); const k = (seen[b] = (seen[b] ?? -1) + 1); return { x, k }; }); })();
const DAYS = ['10.31', '11.01', '11.02', '11.03', '11.04', '11.05', '11.06', '11.07', '11.08', '11.09'];
const GAP0 = tx('11.01 17:28'), GAP1 = tx('11.07 01:26');
const AXY = 880;
export const STAT_AT = [B(34, 2), B(34, 3), B(35)];

export const Updates: React.FC<{ f: number }> = ({ f }) => {
  const enter = ramp(f, B(32) - 4, 12, EASE.snappy);
  const out = ramp(f, B(35, 2), 10, EASE.swift);
  let k = 0; VER_AT.forEach((a, i) => { if (f >= a) k = i; });
  const kp = ramp(f, VER_AT[k], 6, EASE.snappy);
  // 播放头：在两次翻版本之间按时间插值
  const nx = k < VERS.length - 1 ? mix(tx(VERS[k][1]), tx(VERS[k + 1][1]), ramp(f, VER_AT[k], VER_AT[k + 1] - VER_AT[k], EASE.smooth)) : tx(VERS[k][1]);
  const last = k === VERS.length - 1;
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - out), filter: out > 0.01 ? `blur(${(out * 16).toFixed(1)}px)` : undefined }}>
      <Keyword f={f} at={B(32)} out={B(35, 2) + 6} idx="更新" text="一直在改" x={140} y={96} size={76} />
      {/* 版本号 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 290, textAlign: 'center' }}>
        <div style={{ position: 'relative', height: 200, overflow: 'hidden' }}>
          {[k - 1, k].map((j) => j < 0 ? null : (
            <div key={j} style={{ position: 'absolute', left: 0, right: 0, top: 0, fontFamily: F.mono, fontSize: 180, fontWeight: 800, lineHeight: '200px', color: last && j === k ? '#ffffff' : C.text, letterSpacing: '-0.03em',
              opacity: j === k ? kp : 1 - kp, transform: `translateY(${(j === k ? (1 - kp) * 90 : -kp * 90).toFixed(1)}px)`, filter: j === k ? (kp < 0.99 ? `blur(${((1 - kp) * 8).toFixed(1)}px)` : undefined) : `blur(${(kp * 8).toFixed(1)}px)`,
              textShadow: last && j === k ? `0 0 ${(40 * kp).toFixed(0)}px rgba(127,178,255,0.8)` : undefined }}>{VERS[j][0]}</div>
          ))}
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 38, color: 'rgba(228,232,255,0.7)', marginTop: 6 }}>{VERS[k][1]}</div>
      </div>
      {/* 十天刻度 */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <line x1={PX0} y1={AXY} x2={GAP0} y2={AXY} stroke="rgba(228,232,255,0.5)" strokeWidth={3} />
        <line x1={GAP0} y1={AXY} x2={GAP1} y2={AXY} stroke="rgba(228,232,255,0.35)" strokeWidth={3} strokeDasharray="4 12" />
        <line x1={GAP1} y1={AXY} x2={PX0 + 10 * DAY_W} y2={AXY} stroke="rgba(228,232,255,0.5)" strokeWidth={3} />
        {TICKS.map((t, i) => {
          const lit = t.x <= nx + 0.5;
          return <rect key={i} x={t.x - 2.5} y={AXY - 14 - t.k * 11} width={5} height={8} rx={2} fill={lit ? '#ffffff' : 'rgba(228,232,255,0.22)'} />;
        })}
        <line x1={nx} y1={AXY - 120} x2={nx} y2={AXY + 10} stroke="#7fb2ff" strokeWidth={3} />
        <circle cx={nx} cy={AXY} r={9} fill="#ffffff" />
        <circle cx={nx} cy={AXY} r={26} fill="rgba(127,178,255,0.35)" />
        {DAYS.map((d, i) => (
          <text key={d} x={PX0 + (i + 0.5) * DAY_W} y={AXY + 50} textAnchor="middle" fontFamily={F.mono} fontSize={26} fill={i >= 2 && i <= 6 ? 'rgba(228,232,255,0.35)' : 'rgba(228,232,255,0.75)'}>{d}</text>
        ))}
      </svg>
      {/* 三个数 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 560, display: 'flex', justifyContent: 'center', gap: 28 }}>
        {[['10', '天'], ['20', '个版本'], ['94', '次提交']].map(([v, l], i) => {
          const p = springAt(f, STAT_AT[i], { damping: 14, stiffness: 180 });
          if (f < STAT_AT[i] - 1) return <div key={i} style={{ width: 340 }} />;
          return (
            <div key={i} style={{ width: 340, height: 170, ...glass({ radius: 28, fill: 0.08 }), display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 14, paddingTop: 40, boxSizing: 'border-box', opacity: Math.min(1, p * 1.4), transform: `translateY(${((1 - p) * 40).toFixed(1)}px) scale(${mix(0.9, 1, p).toFixed(3)})` }}>
              <span style={{ fontFamily: F.mono, fontSize: 92, fontWeight: 800, color: C.text }}>{v}</span>
              <span style={{ fontSize: 36, color: 'rgba(228,232,255,0.8)', fontWeight: 600 }}>{l}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
