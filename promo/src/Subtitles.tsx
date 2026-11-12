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
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: vertical ? H * 0.135 : 40, textAlign: 'center', opacity }}>
      <span style={{ fontFamily: FONT.sans, fontWeight: 500, fontSize: vertical ? 44 : 34, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.94)', textShadow: '0 2px 10px rgba(0,0,0,0.75), 0 0 2px rgba(0,0,0,0.9)', padding: '4px 22px', borderRadius: 10, background: 'rgba(5,7,12,0.32)', maxWidth: W - 120, display: 'inline-block' }}>
        {text}
      </span>
    </div>
  );
};

export const Subtitles: React.FC = () => {
  const t = useT();
  // 54.4–61.0s 底部通栏屏幕大字与旁白同文，字幕让位避免重复
  const cur = phrases().find((p) => t >= p.start && t < p.end && !(p.start >= 54.4 && p.start < 61.0));
  if (!cur) return null;
  return <SubtitleLine text={cur.text} opacity={ramp(t, cur.start, 0.06, EASE.linear)} />;
};
