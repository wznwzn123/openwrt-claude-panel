import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { FONT, SHIFT5, SafeCtx, ensureFonts, ramp, useT, useV } from './lib/core';
import { Act1 } from './acts/Act1';
import { Act2 } from './acts/Act2';
import { Act3 } from './acts/Act3';
import { Act4 } from './acts/Act4';
import { Act5 } from './acts/Act5';
import { Subtitles } from './Subtitles';

ensureFonts();

/* scanline-wipe：科技青扫描线自左向右横扫，线后即新画面 */
const ScanWipe: React.FC<{ t: number; from: number; dur: number; children: React.ReactNode }> = ({ t, from, dur, children }) => {
  const k = Math.min(1, Math.max(0, (t - from) / dur));
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  if (k >= 1) return <>{children}</>;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `inset(0 ${(1 - e) * 100}% 0 0)` }}>{children}</AbsoluteFill>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${e * 100}% - 160px)`, width: 160, background: 'linear-gradient(90deg, rgba(6,182,212,0) 0%, rgba(6,182,212,0.28) 85%, rgba(6,182,212,0.6) 100%)' }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${e * 100}% - 2px)`, width: 4, background: '#a5f3fc', boxShadow: '0 0 24px 6px rgba(6,182,212,0.9)' }} />
    </AbsoluteFill>
  );
};

/* 角标：界面里的设备名、流量、延迟等均为演示数据（真实面板代码渲染，数据由本地模拟接口提供） */
export const DEMO_FROM = 8.6;
export const DEMO_TO = 81.8 - SHIFT5;
const DemoTag: React.FC<{ t: number }> = ({ t }) => {
  const { vertical } = useV();
  const o = ramp(t, DEMO_FROM, 0.4) * (1 - ramp(t, DEMO_TO - 0.3, 0.3));
  if (o <= 0) return null;
  return (
    <div style={{ position: 'absolute', ...(vertical ? { left: 54, top: 56 } : { right: 96, bottom: 24 }), fontFamily: FONT.sans, fontSize: vertical ? 24 : 20, fontWeight: 600, letterSpacing: '0.06em', color: 'rgba(226,232,240,0.72)', textShadow: '0 1px 6px rgba(0,0,0,0.55)', opacity: o, pointerEvents: 'none' }}>
      界面为演示数据
    </div>
  );
};

export const ACTS = [
  { id: 'a1', start: 0, end: 12 },
  { id: 'a2', start: 12, end: 28 },
  { id: 'a3', start: 28, end: 54 },
  { id: 'a4', start: 54, end: 74 - SHIFT5 },
  { id: 'a5', start: 74 - SHIFT5, end: 90 },
];

export const Main: React.FC<{ subtitles?: boolean; safe?: boolean }> = ({ subtitles = true, safe = false }) => {
  const t = useT();
  const { fps } = useVideoConfig();
  // 第四幕 → 第五幕：第六版不再第二次用扫描线擦除（模板感），改为卡在半拍 73.81s 的硬切 + 一记轻闪 + 第五幕 3% 回弹
  const W5 = 73.81 - SHIFT5;
  return (
    <SafeCtx.Provider value={safe}>
    <AbsoluteFill style={{ background: '#07090E', overflow: 'hidden', ...({ textWrap: 'pretty' } as React.CSSProperties) }}>
      {t < 11.8 && <Act1 />}
      {/* 近静止段补缓慢推镜（审片 A6 / B9）：第二幕全程 1→1.07；第三幕按段推进，段间转场前 0.35s 收回 */}
      {t >= 11.8 && t < 28 && <AbsoluteFill style={{ transform: `scale(${1 + 0.035 * ramp(t, 12.4, 3.4) + 0.035 * ramp(t, 21.6, 6.2)})` }}><Act2 /></AbsoluteFill>}
      {t >= 28 && t < 54 && (
        <AbsoluteFill style={{ transform: `scale(${1 + 0.04 * ramp(t, 29.4, 8.6) * (1 - ramp(t, 38.0, 0.35)) + 0.03 * ramp(t, 38.6, 5.0) * (1 - ramp(t, 43.7, 0.35)) + 0.07 * ramp(t, 45.0, 9.0)})` }}>
          <Act3 />
        </AbsoluteFill>
      )}
      {t >= 54 && t < W5 && <Act4 />}
      {/* 第五幕内部仍按原时间轴（74–90s）编排，整体提前 SHIFT5；片尾多出的时长 = logo 定格 */}
      {t >= W5 && (
        <AbsoluteFill style={{ transform: `scale(${1 + 0.03 * (1 - ramp(t, W5, 0.5))})` }}>
          <Sequence from={-Math.round(SHIFT5 * fps)} layout="none"><Act5 /></Sequence>
        </AbsoluteFill>
      )}
      {t >= W5 && t < W5 + 0.3 && <AbsoluteFill style={{ background: '#d6ecff', opacity: 0.32 * (1 - ramp(t, W5, 0.25)) }} />}
      <DemoTag t={t} />
      {subtitles && <Subtitles />}
    </AbsoluteFill>
    </SafeCtx.Provider>
  );
};
