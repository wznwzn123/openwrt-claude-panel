import React, { useEffect, useLayoutEffect, useState } from 'react';
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { SHOTS } from './timeline';
import { Aurora, Grain, F } from './lib/look';
import glyphs from './data/glyphs.json';
import { Open } from './scenes/Open';
import { Why } from './scenes/Why';
import { Travel } from './scenes/Travel';
import { Gap } from './scenes/Gap';
import { Rush } from './scenes/Rush';
import { Brake } from './scenes/Brake';
import { Values } from './scenes/Values';
import { Finale } from './scenes/Finale';

// 字体：fontsource 按字符子集懒加载。每帧等 document.fonts.ready，开头先把全片用到的字全部预加载一遍。
const FontGate: React.FC = () => {
  const f = useCurrentFrame();
  const [h0] = useState(() => delayRender('fonts-initial'));
  useEffect(() => { document.fonts.ready.then(() => setTimeout(() => continueRender(h0), 50)); }, [h0]);
  useLayoutEffect(() => {
    const h = delayRender('fonts-frame-' + f);
    document.fonts.ready.then(() => continueRender(h));
  }, [f]);
  const txt = (glyphs as { text: string }).text;
  return (
    <div style={{ position: 'absolute', left: -9999, top: 0, opacity: 0, pointerEvents: 'none' }} aria-hidden>
      {[F.sans, F.serif, F.mono].map((fam) => [300, 400, 500, 600, 700, 800, 900].map((w) => (
        <span key={fam + w} style={{ fontFamily: fam, fontWeight: w }}>{txt}</span>
      )))}
    </div>
  );
};

// 极光底的能量曲线（随叙事起伏）
const ENERGY: [number, number][] = [
  [0, 0.18], [40, 0.32], [SHOTS.open.from + 200, 0.55], [SHOTS.why.from, 0.6], [SHOTS.travel.from, 0.66],
  [SHOTS.gap.from + 20, 0.62], [SHOTS.gap.from + 70, 0.22], [SHOTS.rush.from - 4, 0.28], [SHOTS.rush.from, 1.0], [SHOTS.brake.from + 60, 0.85],
  [SHOTS.values.from + 20, 0.55], [SHOTS.finale.from, 0.6], [SHOTS.finale.from + 150, 0.9], [SHOTS.finale.from + 288, 0.7],
];

export const Film: React.FC<{ music?: boolean }> = ({ music = true }) => {
  const f = useCurrentFrame();
  const energy = interpolate(f, ENERGY.map((e) => e[0]), ENERGY.map((e) => e[1]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const S = SHOTS;
  return (
    <AbsoluteFill style={{ background: '#05060d', fontFamily: F.sans, color: '#f4f6ff' }}>
      <FontGate />
      <Aurora energy={energy} />
      <Sequence from={S.open.from} durationInFrames={S.open.dur}><Open /></Sequence>
      <Sequence from={S.why.from} durationInFrames={S.why.dur}><Why /></Sequence>
      <Sequence from={S.travel.from} durationInFrames={S.travel.dur}><Travel /></Sequence>
      <Sequence from={S.gap.from} durationInFrames={S.gap.dur}><Gap /></Sequence>
      <Sequence from={S.rush.from} durationInFrames={S.rush.dur}><Rush /></Sequence>
      <Sequence from={S.brake.from} durationInFrames={S.brake.dur}><Brake /></Sequence>
      <Sequence from={S.values.from} durationInFrames={S.values.dur}><Values /></Sequence>
      <Sequence from={S.finale.from} durationInFrames={S.finale.dur}><Finale /></Sequence>
      <Grain opacity={0.08} />
      <Audio src={staticFile(music ? 'audio/film.wav' : 'audio/film-nomusic.wav')} />
    </AbsoluteFill>
  );
};
