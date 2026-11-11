// 时间轴（432f）：上一段的线从左边接进来，变成时间轴；相机走一段停一段，掠过 10.31 – 11.01 的六个版本。
// 镜头卡：timeline-travel（变速横移 + 卡片到达前 6f 弹立）+ line-carry-transition（笔头钉在画面 x≈1480，线与相机同速生长）。
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, DemoNote, F } from '../lib/look';
import { EASE, mix, ramp, velocity } from '../lib/ease';
import { AXIS_Y, CommitHud, Mile, MileCard } from '../lib/axis';
import { Nib, NibDefs } from '../lib/thread';
import { SpeedBlur } from '../lib/speedblur';
import { L } from '../lib/shot';

export const GAP_X = 1500;
const X = (i: number) => 960 + i * GAP_X;
export const MILES: Mile[] = [
  { v: 'v1.0', date: '10.31', time: '11:01', n: 1, title: '第一次发布', desc: '路由器的手机控制面板，\n也能用中文对话来管理' },
  // v1.1 配手机界面（深色 + 背景图的磨砂玻璃主题），放进手机外框，摆在卡片右边
  { v: 'v1.1', date: '10.31', time: '16:08', n: 4, title: '磨砂玻璃主题', desc: '自定义背景，悬浮的圆角顶栏', img: { phone: 'ui/home-dark-full.png', w: 240, phoneH: 470, dx: 140, dy: 250, note: '手机上，现在的样子' } },
  { v: 'v1.2', date: '10.31', time: '21:26', n: 19, title: '托管版 · 官网 · 安卓 App', desc: '有邀请码就有专属网址，\n不用自己买域名' },
  { v: 'v1.3', date: '11.01', time: '02:42', n: 24, night: true, title: '一键更新', desc: '路由器自己下载、校验、装好，\n设置都保留' },
  { v: 'v2.0', date: '11.01', time: '11:41', n: 33, title: '新首页', desc: '实时流量曲线，每 2 秒刷新一次', img: { page: 'desk-home', rect: L['desk-home'].live, pad: 8, w: 680, dx: -60, dy: -10 } },
  { v: 'v2.0.3', date: '11.01', time: '17:17', n: 48, title: '升级后自动换新面板', desc: '升级以后，手机上的旧页面\n会自己刷新成新版本' },
];
export const ARRIVE = MILES.map((_, i) => 24 + 72 * i); // 相机到达每个刻度的帧（每小节一个）
const MOVE = 30;

// 相机 x：停走交替，每段 30f，in-out 但中段冲刺
export const camAt = (f: number) => {
  for (let i = 1; i < ARRIVE.length; i++) {
    if (f < ARRIVE[i]) {
      const t = ramp(f, ARRIVE[i] - MOVE, MOVE, EASE.smooth);
      return mix(X(i - 1), X(i), t) - 960;
    }
  }
  // 最后一站之后继续缓慢前行，把线交给下一段（停更的五天）
  const tail = ramp(f, ARRIVE[ARRIVE.length - 1] + 20, 60, EASE.swift);
  return X(ARRIVE.length - 1) - 960 + tail * 420 + Math.max(0, f - ARRIVE[ARRIVE.length - 1] - 80) * 7;
};
export const TRAVEL_POPS = ARRIVE.map((a, i) => (i === 0 ? a - 2 : a - 6));

export const Travel: React.FC = () => {
  const f = useCurrentFrame();
  const cam = camAt(f);
  const v = velocity(camAt, f);
  // 笔头：先从左边画到屏幕 x=1480，之后钉在 1480 随相机前进
  const intro = ramp(f, 0, 24, EASE.out);
  const nibScreen = f < 24 ? mix(-40, 1480, intro) : 1480;
  const nibWorld = cam + nibScreen;
  const startWorld = -60 + 0; // 轴的起点（世界坐标）
  const fadeIn = ramp(f, 0, 10, EASE.out);
  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      {/* 远景：大号日期，0.35 倍视差 */}
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(-cam * 0.35).toFixed(2)}px)` }}>
        {[['10.31', 200], ['11.01', 200 + GAP_X * 3 * 0.35 + 900]].map(([t, x]) => (
          <div key={t as string} style={{ position: 'absolute', left: x as number, top: 120, fontFamily: F.mono, fontSize: 360, fontWeight: 700, color: 'rgba(255,255,255,0.05)', letterSpacing: '-0.04em' }}>{t}</div>
        ))}
      </div>
      {/* 世界层：卡片、刻度（横移时按速度加横向运动模糊） */}
      <SpeedBlur vx={v} amount={0.35} max={28}>
        <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(-cam).toFixed(2)}px)` }}>
          {/* 次刻度点：速度参照物 */}
          {Array.from({ length: 70 }, (_, i) => startWorld + 200 + i * 125).filter((x) => x < nibWorld - 10).map((x) => (
            <div key={x} style={{ position: 'absolute', left: x - 2, top: AXIS_Y + 14, width: 4, height: 4, borderRadius: 2, background: 'rgba(238,242,255,0.28)' }} />
          ))}
          {MILES.map((m, i) => (
            <MileCard key={i} m={m} x={X(i)} f={f} pop={TRAVEL_POPS[i]} cam={cam} hero={i === 4} />
          ))}
        </div>
      </SpeedBlur>
      {/* 线：始终锐利 */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <NibDefs />
        <line x1={-80} y1={AXIS_Y} x2={nibWorld - cam} y2={AXIS_Y} stroke="rgba(150,180,255,0.35)" strokeWidth={14} strokeLinecap="round" style={{ filter: 'blur(6px)' }} />
        <line x1={-80} y1={AXIS_Y} x2={nibWorld - cam} y2={AXIS_Y} stroke={C.line} strokeWidth={3.5} strokeLinecap="round" />
        <Nib x={nibWorld - cam} y={AXIS_Y} />
      </svg>
      <CommitHud f={f} marks={MILES.map((m, i) => ({ at: TRAVEL_POPS[i], n: m.n }))} opacity={ramp(f, 8, 14)} />
      <DemoNote opacity={ramp(f, TRAVEL_POPS[1], 12) * (1 - ramp(f, 400, 20))} />
    </AbsoluteFill>
  );
};
