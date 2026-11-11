// 密集更新（288f）：11.07 – 11.08，七个版本；比上一段快一倍——两拍（36f）一站，冲刺 12f、停 24f。
// v2：第一张卡正好落在重新接上的那一拍（第 0 帧）；快段只留标题（60px）。
// 镜头卡：timeline-travel 的高速版；速度本身讲「这几天改得很快」。
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, Chip, DemoNote, F } from '../lib/look';
import { EASE, mix, ramp, velocity } from '../lib/ease';
import { AXIS_Y, CommitHud, Mile, MileCard } from '../lib/axis';
import { Nib, NibDefs } from '../lib/thread';
import { SpeedBlur } from '../lib/speedblur';
import { L } from '../lib/shot';

const GAPX = 1320;
const X = (i: number) => 960 + i * GAPX;
export const RUSH: Mile[] = [
  { v: 'v2.0.4', date: '11.07', time: '02:14', n: 61, night: true, title: '内存保护', desc: '内存快满先清缓存，避免整台路由器死机' },
  { v: 'v2.0.6', date: '11.07', time: '09:29', n: 66, title: '自动任务都能开关', desc: '每一项都写清楚关掉以后会怎样', img: { page: 'desk-auto', rect: L['desk-auto'].auto[1], pad: 8, w: 660, dx: -40, dy: -20 } },
  { v: 'v2.0.7', date: '11.07', time: '10:56', n: 72, title: '问题反馈能附截图', desc: '最多 3 张，大图自动压缩' },
  { v: 'v2.0.8', date: '11.07', time: '15:32', n: 76, title: '云端备份可以加密', desc: '先在路由器上加密再上传，密钥只在路由器上' },
  { v: 'v3.0', date: '11.07', time: '16:35', n: 79, title: '登录过的设备', desc: '官网账号页能看到、能退出，新设备登录发邮件提醒' },
  { v: 'v3.0.2', date: '11.08', time: '09:52', n: 89, title: '状态栏跟着面板走', desc: '深色模式、背景图，手机最上面那一条也跟着变' },
  { v: 'v3.1.0', date: '11.08', time: '23:14', n: 93, title: '小闪存模式', desc: '闪存只剩 20 MB 左右的路由器也能装' },
];
export const RUSH_ARRIVE = RUSH.map((_, i) => 6 + 36 * i); // 两拍一站；卡片在到达前 6f 弹立 = 正好落在拍上（第一张在第 0 帧）
export const RUSH_POPS = RUSH_ARRIVE.map((a) => a - 6);
const MOVE = 12;

const camAt = (f: number) => {
  for (let i = 1; i < RUSH_ARRIVE.length; i++) {
    if (f < RUSH_ARRIVE[i]) return mix(X(i - 1), X(i), ramp(f, RUSH_ARRIVE[i] - MOVE, MOVE, EASE.smooth)) - 960;
  }
  return X(RUSH.length - 1) - 960 + ramp(f, RUSH_ARRIVE[RUSH.length - 1] + 18, 40, EASE.exit) * 600;
};

export const Rush: React.FC = () => {
  const f = useCurrentFrame();
  const cam = camAt(f);
  const v = velocity(camAt, f);
  const nib = 1480; // 笔头钉在画面 x=1480，线与相机同速生长
  const out = ramp(f, 276, 12, EASE.swift);
  // 开头：重新点亮的那一下（全片三次整画面冲击之一）
  const hit = Math.max(0, 1 - f / 10);
  return (
    <AbsoluteFill style={{ opacity: 1 - out, filter: out > 0.001 ? `blur(${(out * 16).toFixed(1)}px)` : undefined, transform: `scale(${(1 + 0.025 * hit).toFixed(4)})` }}>
      {/* 品牌蓝加色光，不整体抬灰（v1 评审） */}
      <AbsoluteFill style={{ background: `radial-gradient(circle at 1480px 760px, rgba(90,130,255,${(0.55 * hit).toFixed(3)}) 0%, rgba(90,130,255,0) 60%)`, mixBlendMode: 'screen' }} />
      {/* 上一段最后那句话被这一下推走（放大、虚化、淡出），而不是硬切掉 */}
      {f < 12 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 330, textAlign: 'center', fontFamily: F.serif, fontSize: 88, fontWeight: 600, letterSpacing: '0.04em', color: C.text,
          opacity: 1 - ramp(f, 0, 12, EASE.out), transform: `translateY(${(-60 * ramp(f, 0, 12, EASE.out)).toFixed(1)}px) scale(${(1 + 0.25 * ramp(f, 0, 12, EASE.out)).toFixed(3)})`, filter: `blur(${(14 * ramp(f, 0, 12, EASE.out)).toFixed(1)}px)` }}>11 月 7 日，又接上了。</div>
      )}
      <SpeedBlur vx={v} amount={0.3} max={32}>
        <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(-cam).toFixed(2)}px)` }}>
          {Array.from({ length: 90 }, (_, i) => 100 + i * 110).filter((x) => x < cam + nib - 10).map((x) => (
            <div key={x} style={{ position: 'absolute', left: x - 2, top: AXIS_Y + 14, width: 4, height: 4, borderRadius: 2, background: 'rgba(238,242,255,0.28)' }} />
          ))}
          {RUSH.map((m, i) => <MileCard key={i} m={m} x={X(i)} f={f} pop={RUSH_POPS[i]} cam={cam} compact below={i % 2 === 1 && !m.img} />)}
        </div>
      </SpeedBlur>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <NibDefs />
        <line x1={-80} y1={AXIS_Y} x2={nib} y2={AXIS_Y} stroke="rgba(150,180,255,0.4)" strokeWidth={16} strokeLinecap="round" style={{ filter: 'blur(6px)' }} />
        <line x1={-80} y1={AXIS_Y} x2={nib} y2={AXIS_Y} stroke={C.line} strokeWidth={4} strokeLinecap="round" />
        <Nib x={nib} y={AXIS_Y} k={1.15} />
      </svg>
      <CommitHud f={f} marks={RUSH.map((m, i) => ({ at: RUSH_POPS[i], n: m.n }))} />
      {/* 右上角的日期角标跟着卡片换天（v1 评审 B2：11.08 的卡上还挂着 11.07） */}
      {(() => { const sw = ramp(f, RUSH_POPS[5] - 4, 10, EASE.out); return (
        <div style={{ position: 'absolute', right: 72, top: 64, width: 420, height: 44, opacity: ramp(f, 4, 10) }}>
          <div style={{ position: 'absolute', right: 0, top: 0, opacity: 1 - sw, transform: `translateY(${(-20 * sw).toFixed(1)}px)` }}><Chip>11.07　一天 32 次提交</Chip></div>
          <div style={{ position: 'absolute', right: 0, top: 0, opacity: sw, transform: `translateY(${(20 * (1 - sw)).toFixed(1)}px)` }}><Chip>11.08　11 次提交</Chip></div>
        </div>); })()}
      <DemoNote opacity={ramp(f, RUSH_POPS[1], 10) * (1 - ramp(f, RUSH_POPS[2] + 10, 10))} />
    </AbsoluteFill>
  );
};
