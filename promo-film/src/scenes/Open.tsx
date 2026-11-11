// 开场（0–288f）：黑里亮起一盏「在线」绿灯 → 打出第一次提交的时间 → 笔头从灯里出来，一笔画出产品图标 → 片名「一根线」。
// 镜头卡：letterspace-materialize（片名字距收拢显影）+ blur-slide（副标），线条一笔画取 mg-styles-15「线条动画」的领先笔尖。
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, F, Rise } from '../lib/look';
import { EASE, mix, ramp } from '../lib/ease';
import { MultiStroke, Nib, NibDefs, iconStrokes } from '../lib/thread';

const S = 16, OX = 704, OY = 179;
const ICON = iconStrokes(OX, OY, S);
export const LED: [number, number] = [OX + 11.4 * S, OY + 19.75 * S];
const START: [number, number] = [OX + 16 * S, OY + 16 * S];

// v2：第 3 帧就开始打字；笔头空等压到 10 帧（v1 评审：开场钩子太小、空转太久）
export const T_OPEN = { led: 0, type0: 3, typeOut: 40, nibOut: 44, draw0: 54, draw1: 162, title: 180, sub: 206, out: 276 };

const STAMP = '2026.10.31  11:01';

// 指示灯：亮起 + 随拍子轻闪（18f 一拍）
export const Led: React.FC<{ x: number; y: number; f: number; on?: number; size?: number }> = ({ x, y, f, on = 1, size = 1 }) => {
  const beat = (f % 18) / 18;
  const blink = 0.78 + 0.22 * Math.cos(beat * Math.PI * 2);
  const a = on * blink;
  return (
    <g>
      <circle cx={x} cy={y} r={46 * size} fill="url(#ledGlow)" opacity={a} />
      <circle cx={x} cy={y} r={9 * size} fill={C.green} opacity={Math.min(1, on * 1.2)} />
      <circle cx={x - 2.5 * size} cy={y - 2.5 * size} r={3 * size} fill="#d9ffe4" opacity={on * 0.9} />
    </g>
  );
};
export const LedDefs: React.FC = () => (
  <defs>
    <radialGradient id="ledGlow">
      <stop offset="0" stopColor="#5dff8a" stopOpacity="0.85" />
      <stop offset="0.3" stopColor="#34c759" stopOpacity="0.35" />
      <stop offset="1" stopColor="#34c759" stopOpacity="0" />
    </radialGradient>
  </defs>
);

export const Open: React.FC = () => {
  const f = useCurrentFrame();
  const T = T_OPEN;
  const ledOn = ramp(f, T.led, 6, EASE.out);
  const typed = Math.floor(Math.max(0, Math.min(STAMP.length, (f - T.type0) / 1.2)));
  const stampO = 1 - ramp(f, T.typeOut, 10, EASE.swift);
  // 笔头从灯里飞到顶边中点（不画线），然后按图标真实的三笔画出来
  const hop = ramp(f, T.nibOut, T.draw0 - T.nibOut, EASE.smooth);
  const hopX = mix(LED[0], START[0], hop), hopY = mix(LED[1], START[1], hop) - Math.sin(hop * Math.PI) * 40;
  const drawn = ramp(f, T.draw0, T.draw1 - T.draw0, EASE.smooth);
  const dotsP = ramp(f, T.draw1 - 4, 14, EASE.overshoot);
  const out = ramp(f, T.out, 12, EASE.swift);
  const push = 1 + 0.035 * ramp(f, 0, 288, EASE.sine);
  const p = (x: number, y: number) => [OX + x * S, OY + y * S];
  const [d2x, d2y] = p(14.6, 19.75), [dsx, dsy] = p(18, 19.75), [dex] = p(21.4, 19.75);
  return (
    <AbsoluteFill style={{ transform: `scale(${push.toFixed(4)})`, opacity: 1 - out, filter: out > 0.001 ? `blur(${(out * 16).toFixed(2)}px)` : undefined }}>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <NibDefs />
        <LedDefs />
        {f >= T.draw0 && <MultiStroke polys={ICON} p={drawn} width={4} dim={[1, 1, 0.6]} />}
        {/* 第二个灯和横杠：一笔画完后弹出 */}
        <g opacity={Math.min(1, dotsP)}>
          <circle cx={d2x} cy={d2y} r={8 * dotsP} fill={C.line} />
          <line x1={dsx} y1={dsy} x2={mix(dsx, dex, Math.min(1, dotsP))} y2={dsy} stroke={C.line} strokeWidth={6} strokeLinecap="round" />
        </g>
        <Led x={LED[0]} y={LED[1]} f={f} on={ledOn} size={1.35} />
        {f >= T.nibOut && f < T.draw0 + 2 && <Nib x={hopX} y={hopY} k={0.4 + 0.6 * hop} />}
      </svg>
      {/* 第一次提交的时间（64px，第 3 帧开始打字） */}
      <div style={{ position: 'absolute', left: LED[0] - 330, top: LED[1] + 60, width: 660, textAlign: 'center', opacity: stampO, filter: stampO < 0.999 ? `blur(${((1 - stampO) * 10).toFixed(1)}px)` : undefined }}>
        <div style={{ fontFamily: F.mono, fontSize: 64, fontWeight: 500, color: C.text, letterSpacing: '0.02em', whiteSpace: 'pre' }}>
          {STAMP.slice(0, typed)}
          <span style={{ opacity: f % 16 < 9 ? 1 : 0, color: C.green }}>▍</span>
        </div>
        <div style={{ marginTop: 12, fontSize: 32, color: C.dim, opacity: ramp(f, T.type0 + 18, 12, EASE.out), letterSpacing: '0.1em' }}>第一次提交</div>
      </div>
      {/* 片名 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 690, textAlign: 'center' }}>
        <TitleMaterialize f={f} start={T.title} />
        <Rise text="OpenWrt Claude Panel　·　十天里的二十个版本" by="char" per={0.7} dur={22} start={T.sub} dy={10} blur={8}
          style={{ marginTop: 26, fontSize: 34, fontWeight: 400, color: C.dim, letterSpacing: '0.08em' }} />
      </div>
    </AbsoluteFill>
  );
};

// 片名：大字距同时收拢 + 每字从虚焦里显影（letterspace-materialize）
const TitleMaterialize: React.FC<{ f: number; start: number }> = ({ f, start }) => {
  const chars = Array.from('一根线');
  const track = mix(0.9, 0.32, ramp(f, start, 40, EASE.out));
  return (
    <div style={{ fontFamily: F.serif, fontSize: 150, fontWeight: 600, letterSpacing: `${track.toFixed(3)}em`, marginRight: `-${track.toFixed(3)}em`, lineHeight: 1, color: C.text }}>
      {chars.map((c, i) => {
        const p = ramp(f, start + i * 5, 30, EASE.out);
        return <span key={i} style={{ display: 'inline-block', opacity: p, filter: p < 0.999 ? `blur(${((1 - p) * 24).toFixed(1)}px)` : undefined, transform: `translateY(${((1 - p) * 16).toFixed(1)}px)` }}>{c}</span>;
      })}
    </div>
  );
};
