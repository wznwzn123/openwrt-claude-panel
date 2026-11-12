// v4 成片：讲清楚插件能干什么、用中文对话管路由器、装起来简单占用小、更新快。字少，靠真实界面说话。
// 配乐：video-shotcraft 的 Mixkit tech-house（124 BPM），所有切点和动效钉在它的节拍网格上（./beat.ts）。
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { AbsoluteFill, Audio, continueRender, delayRender, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Grain, F } from '../lib/look';
import { AuroraGL, Ripple } from '../gl/AuroraGL';
import glyphs from '../data/glyphs.json';
import { B, BIG_HITS } from './beat';
import { Intro } from './Intro';
import { Features } from './Features';
import { Chat } from './Chat';
import { Install } from './Install';
import { Updates } from './Updates';
import { Finale, lensAt4 } from './Finale';

const FontGate: React.FC = () => {
  const f = useCurrentFrame();
  const [h0] = useState(() => delayRender('fonts-initial'));
  useEffect(() => { document.fonts.ready.then(() => setTimeout(() => continueRender(h0), 50)); }, [h0]);
  useLayoutEffect(() => { const h = delayRender('fonts-frame-' + f); document.fonts.ready.then(() => continueRender(h)); }, [f]);
  const txt = (glyphs as { text: string }).text;
  return (
    <div style={{ position: 'absolute', left: -9999, top: 0, opacity: 0, pointerEvents: 'none' }} aria-hidden>
      {[F.sans, F.serif, F.mono].map((fam) => [400, 500, 600, 700, 800].map((w) => <span key={fam + w} style={{ fontFamily: fam, fontWeight: w }}>{txt}</span>))}
    </div>
  );
};

// 极光能量：贴着配乐的能量结构（前奏低 → 第 8 小节落鼓满 → 定版后回落）
const ENERGY: [number, number][] = [
  [0, 0.05], [B(0), 0.12], [B(2), 0.35], [B(4), 0.42], [B(7, 2), 0.55], [B(8) - 1, 0.5], [B(8) + 6, 1.0], [B(10), 0.82],
  [B(20) - 1, 0.7], [B(20) + 6, 0.95], [B(22), 0.72], [B(28), 0.7], [B(32), 0.82], [B(35, 2), 0.7], [B(36) + 4, 1.0], [B(38), 0.7], [B(40), 0.55],
];
const RIPPLE_C: [number, number][] = [[1260, 540], [1250, 540], [960, 540]];
const rippleAt = (f: number): Ripple => {
  for (let i = BIG_HITS.length - 1; i >= 0; i--) {
    const k = (f - BIG_HITS[i]) / (1.95 * 30);
    if (k >= 0 && k <= 1) { const seg = Math.min(1, k / 0.035); return [RIPPLE_C[i][0], RIPPLE_C[i][1], 60 + 1500 * Math.sin((k * Math.PI) / 2), 1.6 * Math.pow(1 - k, 1.5) * seg]; }
  }
  return [960, 540, 0, 0];
};
const between = (f: number, a: number, b: number) => f >= a && f < b;

export const Film4: React.FC<{ music?: boolean }> = ({ music = true }) => {
  const f = useCurrentFrame();
  const energy = interpolate(f, ENERGY.map((e) => e[0]), ENERGY.map((e) => e[1]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // 落鼓那一下的品牌蓝加色闪（第 8、20 小节）
  const hit = (h: number) => (f < h ? 0 : f < h + 2 ? 0.45 : 0.45 * Math.exp(-(f - h - 2) / 6));
  const add = Math.max(hit(BIG_HITS[0]), hit(BIG_HITS[1]));
  return (
    <AbsoluteFill style={{ background: '#05060d', fontFamily: F.sans, color: '#f4f6ff' }}>
      <FontGate />
      <AuroraGL energy={energy} ripple={rippleAt(f)} lens={lensAt4(f)} />
      {between(f, 0, B(8)) && <Intro f={f} />}
      {between(f, B(8) - 6, B(20)) && <Features f={f} />}
      {between(f, B(20) - 2, B(28)) && <Chat f={f} />}
      {between(f, B(28) - 2, B(32)) && <Install f={f} />}
      {between(f, B(32) - 6, B(36)) && <Updates f={f} />}
      {f >= B(35, 2) && <Finale f={f} />}
      {add > 0.002 && <AbsoluteFill style={{ background: '#9fb4ff', opacity: add * 0.5, mixBlendMode: 'screen' }} />}
      <Grain opacity={0.045} />
      <Audio src={staticFile(music ? 'audio/film4.wav' : 'audio/film4-nomusic.wav')} />
    </AbsoluteFill>
  );
};
