import React from 'react';
import timing from './timing.json';
import { FONT, ramp, EASE, useT, useV } from './lib/core';

/* 底部跟读字幕：素排、无标点、整句硬现（talkcraft design-language §5） */
export const phrases = () =>
  (timing as { phrases: { text: string; start: number; end: number }[] }).phrases.map((p, i, arr) => {
    const next = arr[i + 1];
    const end = next ? Math.min(p.end + 0.3, next.start - 0.02) : p.end + 0.4;
    return { id: `p${i}`, text: p.text.replace(/[，。；、！？,;!?]/g, ' ').replace(/\.(?![A-Za-z0-9])/g, ' ').trim(), start: p.start - 0.04, end };
  });

export const SubtitleLine: React.FC<{ text: string; opacity?: number }> = ({ text, opacity = 1 }) => {
  const { vertical, W, H } = useV();
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: vertical ? H * 0.135 : 56, textAlign: 'center', opacity }}>
      <span style={{ fontFamily: FONT.sans, fontWeight: 500, fontSize: vertical ? 44 : 42, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.94)', textShadow: '0 2px 10px rgba(0,0,0,0.75), 0 0 2px rgba(0,0,0,0.9)', padding: '4px 22px', borderRadius: 10, background: 'rgba(5,7,12,0.62)', backdropFilter: 'blur(8px)', maxWidth: W - 120, display: 'inline-block', textWrap: 'balance' } as React.CSSProperties}>
        {text}
      </span>
    </div>
  );
};

/* 屏幕大标题与旁白同句时不再重复字幕（审片 B7）：6.6–9.7s 第一幕标题「OpenWrt，换一种管法」 */
const HIDE: [number, number][] = [[7.8, 10.8]];
export const Subtitles: React.FC = () => {
  const t = useT();
  const cur = phrases().find((p) => t >= p.start && t < p.end);
  if (!cur || HIDE.some(([a, b]) => t >= a && t < b)) return null;
  return <SubtitleLine text={cur.text} opacity={ramp(t, cur.start, 0.06, EASE.linear)} />;
};
