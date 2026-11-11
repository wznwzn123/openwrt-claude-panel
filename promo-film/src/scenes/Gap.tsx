// 停更的五天（144f）：时间轴变成虚线，笔头一天一天往前挪、越来越暗，停住；然后闪三下，重新亮起。
// 真实情况：git 历史里 11.02 – 11.06 没有提交。画面只说事实，不编原因。
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, F, Rise } from '../lib/look';
import { EASE, mix, ramp } from '../lib/ease';
import { Nib, NibDefs } from '../lib/thread';
import { AXIS_Y } from '../lib/axis';
import commits from '../data/commits.json';

const DAYS = ['11.02', '11.03', '11.04', '11.05', '11.06'];
const DX = (i: number) => 560 + i * 150;
export const GAP_T = { day0: 6, dayStep: 13, stall: 74, say: 10, sayOut: 96, spark: 104, sparks: [104, 114, 124], relit: 132, say2: 112 };
const T = GAP_T;

// ── v3：拉远看全景（v2 评审的 wow 建议）——十天、94 次提交一屏看完：10.31–11.01 亮着，中间五天是虚线，
// 11.07 以后还是暗的；重新点亮时笔头沿虚线冲过去把它点亮，第 144 帧（下一段第 0 帧，全片第 1152 帧）正好到 11.07。
// 刻度位置来自 git 历史（commits.json 的提交时间，北京时间）。
export const PANO_T = { in0: 100, dash0: 134, dash1: 144 };
const DAY_W = 156, PX0 = 180;
const tx = (t: string) => { const [md, hm] = t.split(' '); const [mo, d] = md.split('.').map(Number); const [h, m] = hm.split(':').map(Number); const day = mo === 10 ? d - 31 : d; return PX0 + (day + (h + m / 60) / 24) * DAY_W; };
const TICKS = (() => { const seen: Record<number, number> = {}; return (commits as { t: string; n: number }[]).map((c) => { const x = tx(c.t), b = Math.round(x / 10); const k = (seen[b] = (seen[b] ?? -1) + 1); return { x, k, n: c.n }; }); })();
const LAST_OLD = tx('11.01 17:28'), FIRST_NEW = tx('11.07 01:26');
const PDAYS = ['10.31', '11.01', '11.02', '11.03', '11.04', '11.05', '11.06', '11.07', '11.08', '11.09'];
const Panorama: React.FC<{ f: number }> = ({ f }) => {
  const a = ramp(f, PANO_T.in0, 14, EASE.out);
  if (a <= 0) return null;
  const zoom = mix(1.6, 1, ramp(f, PANO_T.in0, 20, EASE.panel)); // 从近处拉远
  const dash = ramp(f, PANO_T.dash0, PANO_T.dash1 - PANO_T.dash0, EASE.swift); // 冲刺：10 帧冲过五天，撞上 11.07
  const nibX = mix(LAST_OLD, FIRST_NEW, dash);
  let glow = 0.35;
  for (const s of T.sparks) glow = Math.max(glow, Math.max(0, 1 - Math.abs(f - s) / 4));
  if (f >= PANO_T.dash0) glow = 1;
  return (
    <g opacity={a} transform={`translate(${960 * (1 - zoom)} ${AXIS_Y * (1 - zoom)}) scale(${zoom})`}>
      <line x1={PX0 - 40} y1={AXIS_Y} x2={LAST_OLD} y2={AXIS_Y} stroke={C.line} strokeWidth={3} />
      <line x1={LAST_OLD} y1={AXIS_Y} x2={FIRST_NEW} y2={AXIS_Y} stroke={C.line} strokeWidth={2.5} strokeDasharray="6 12" opacity={0.5} />
      {dash > 0 && <line x1={LAST_OLD} y1={AXIS_Y} x2={nibX} y2={AXIS_Y} stroke={C.line} strokeWidth={3.5} />}
      <line x1={FIRST_NEW} y1={AXIS_Y} x2={PX0 + 10 * DAY_W} y2={AXIS_Y} stroke={C.line} strokeWidth={3} opacity={0.22} />
      {TICKS.map((t) => {
        const old = t.x < LAST_OLD + 1;
        const lit = old ? 1 : 0.18;
        return <rect key={t.n} x={t.x - 4} y={AXIS_Y - 22 - t.k * 14} width={8} height={11} rx={3} fill={old ? '#eef2ff' : '#9fb4ff'} opacity={lit} />;
      })}
      {PDAYS.map((d, i) => (
        <text key={d} x={PX0 + (i + 0.5) * DAY_W} y={AXIS_Y + 48} textAnchor="middle" fontFamily={F.mono} fontSize={28} fill={i >= 2 && i <= 6 ? 'rgba(228,232,255,0.32)' : 'rgba(228,232,255,0.7)'}>{d}</text>
      ))}
      <Nib x={nibX} y={AXIS_Y} k={0.35 + 0.75 * glow} />
    </g>
  );
};

export const Gap: React.FC = () => {
  const f = useCurrentFrame();
  // 笔头：从 1480 退到第一天，再一天一天往前挪，最后停在 11.06 之后
  const k = Math.max(0, Math.min(DAYS.length, (f - T.day0) / T.dayStep));
  const walk = Math.floor(k) + ramp(k - Math.floor(k), 0, 0.7, EASE.smooth);
  const nibX = f < T.day0 ? mix(1480, DX(0) - 120, ramp(f, 0, T.day0, EASE.swift)) : mix(DX(0) - 120, DX(DAYS.length - 1) + 120, walk / DAYS.length);
  // 亮度：一路变暗；重新点亮时闪三下
  let glow = mix(1, 0.25, ramp(f, 0, T.stall, EASE.sine));
  for (const s of T.sparks) glow = Math.max(glow, Math.max(0, 1 - Math.abs(f - s) / 4));
  const relit = 0;
  const fadeOld = 1 - ramp(f, 0, 30, EASE.swift);
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <NibDefs />
        <g opacity={1 - ramp(f, PANO_T.in0 - 4, 12, EASE.swift)}>
        {/* 前面的实线（来自上一段）慢慢退淡 */}
        <line x1={-80} y1={AXIS_Y} x2={DX(0) - 120} y2={AXIS_Y} stroke={C.line} strokeWidth={3.5} opacity={0.3 + 0.7 * fadeOld} />
        {/* 五天：虚线 */}
        <line x1={DX(0) - 120} y1={AXIS_Y} x2={nibX} y2={AXIS_Y} stroke={C.line} strokeWidth={3} strokeDasharray="6 14" strokeLinecap="round" opacity={0.55 * (1 - relit) + 0.95 * relit} />
        {/* 重新点亮：虚线上面补一条实线 */}
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
        </g>
        <Panorama f={f} />
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
