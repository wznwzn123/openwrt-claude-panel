import React from 'react';
import { AbsoluteFill } from 'remotion';
import { SafeCtx, ensureFonts, useT } from './lib/core';
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

export const ACTS = [
  { id: 'a1', start: 0, end: 12 },
  { id: 'a2', start: 12, end: 28 },
  { id: 'a3', start: 28, end: 54 },
  { id: 'a4', start: 54, end: 74 },
  { id: 'a5', start: 74, end: 90 },
];

export const Main: React.FC<{ subtitles?: boolean; safe?: boolean }> = ({ subtitles = true, safe = false }) => {
  const t = useT();
  return (
    <SafeCtx.Provider value={safe}>
    <AbsoluteFill style={{ background: '#07090E', overflow: 'hidden', ...({ textWrap: 'pretty' } as React.CSSProperties) }}>
      {t < 11.8 && <Act1 />}
      {t >= 11.8 && t < 28 && <Act2 />}
      {t >= 28 && t < 54 && <Act3 />}
      {t >= 54 && t < 74.35 && <Act4 />}
      {t >= 73.75 && <ScanWipe t={t} from={73.75} dur={0.55}><Act5 /></ScanWipe>}
      {subtitles && <Subtitles />}
    </AbsoluteFill>
    </SafeCtx.Provider>
  );
};
