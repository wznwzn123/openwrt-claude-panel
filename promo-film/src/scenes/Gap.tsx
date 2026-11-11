// 停更的五天（144f）：时间轴变成虚线，笔头一天一天往前挪、越来越暗，停住；然后闪三下，重新亮起。
// 真实情况：git 历史里 11.02 – 11.06 没有提交。画面只说事实，不编原因。
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, F, Rise } from '../lib/look';
import { EASE, mix, ramp } from '../lib/ease';
import { Nib, NibDefs } from '../lib/thread';
import { AXIS_Y } from '../lib/axis';

const DAYS = ['11.02', '11.03', '11.04', '11.05', '11.06'];
const DX = (i: number) => 560 + i * 150;
export const GAP_T = { day0: 6, dayStep: 13, stall: 74, say: 10, sayOut: 96, spark: 104, sparks: [104, 114, 124], relit: 132, say2: 112 };
const T = GAP_T;

export const Gap: React.FC = () => {
  const f = useCurrentFrame();
  // 笔头：从 1480 退到第一天，再一天一天往前挪，最后停在 11.06 之后
  const k = Math.max(0, Math.min(DAYS.length, (f - T.day0) / T.dayStep));
  const walk = Math.floor(k) + ramp(k - Math.floor(k), 0, 0.7, EASE.smooth);
  const nibX = f < T.day0 ? mix(1480, DX(0) - 120, ramp(f, 0, T.day0, EASE.swift)) : mix(DX(0) - 120, DX(DAYS.length - 1) + 120, walk / DAYS.length);
  // 亮度：一路变暗；重新点亮时闪三下
  let glow = mix(1, 0.25, ramp(f, 0, T.stall, EASE.sine));
  for (const s of T.sparks) glow = Math.max(glow, Math.max(0, 1 - Math.abs(f - s) / 4));
  glow = Math.max(glow, ramp(f, T.relit, 10, EASE.out));
  const relit = ramp(f, T.relit, 12, EASE.out);
  const fadeOld = 1 - ramp(f, 0, 30, EASE.swift);
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <NibDefs />
        {/* 前面的实线（来自上一段）慢慢退淡 */}
        <line x1={-80} y1={AXIS_Y} x2={DX(0) - 120} y2={AXIS_Y} stroke={C.line} strokeWidth={3.5} opacity={0.3 + 0.7 * fadeOld} />
        {/* 五天：虚线 */}
        <line x1={DX(0) - 120} y1={AXIS_Y} x2={nibX} y2={AXIS_Y} stroke={C.line} strokeWidth={3} strokeDasharray="6 14" strokeLinecap="round" opacity={0.55 * (1 - relit) + 0.95 * relit} />
        {/* 重新点亮：虚线上面补一条实线 */}
        {relit > 0 && <line x1={DX(0) - 120} y1={AXIS_Y} x2={mix(DX(0) - 120, 2000, relit)} y2={AXIS_Y} stroke={C.line} strokeWidth={3.5} />}
        {DAYS.map((d, i) => {
          const a = ramp(f, T.day0 + i * T.dayStep, 8, EASE.out);
          return (
            <g key={d} opacity={a * (0.85 - 0.4 * relit)}>
              <circle cx={DX(i)} cy={AXIS_Y} r={6} fill="none" stroke="rgba(238,242,255,0.45)" strokeWidth={2} />
              <text x={DX(i)} y={AXIS_Y + 50} textAnchor="middle" fontFamily={F.mono} fontSize={26} fill="rgba(228,232,255,0.45)">{d}</text>
            </g>
          );
        })}
        <Nib x={nibX} y={AXIS_Y} k={0.35 + 0.65 * glow} />
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 300, textAlign: 'center' }}>
        <Rise text="停了五天。" start={T.say} per={5} dur={26} dy={14} blur={16} out={T.sayOut} style={{ fontFamily: F.serif, fontSize: 112, fontWeight: 600, color: C.text, letterSpacing: '0.08em' }} />
        <Rise text="11.02 — 11.06　·　没有一次提交" start={T.say + 24} per={0.6} dur={18} out={T.sayOut} style={{ marginTop: 28, fontFamily: F.mono, fontSize: 30, color: C.faint }} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 330, textAlign: 'center' }}>
        <Rise text="11 月 7 日，又接上了。" start={T.say2} per={1.6} dur={20} dy={14} blur={14} style={{ fontFamily: F.serif, fontSize: 88, fontWeight: 600, color: C.text, letterSpacing: '0.04em' }} />
      </div>
    </AbsoluteFill>
  );
};
