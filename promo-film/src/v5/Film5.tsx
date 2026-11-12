// v5 成片：商业级 3D 产品片。
// 一块常驻的 3D 画布（three.js，经 @remotion/three）+ 后面的 WebGL 极光（mg-styles-15 着色器）+ 前面的文字层。
// 全部切点钉在配乐（Mixkit tech-house，124 BPM）的节拍网格上（src/v4/beat.ts）。
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { AbsoluteFill, Audio, continueRender, delayRender, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { C, F, Grain, Rise } from '../lib/look';
import { EASE, ramp } from '../lib/ease';
import { AuroraGL, Ripple } from '../gl/AuroraGL';
import glyphs from '../data/glyphs.json';
import { B, BIG_HITS } from '../v4/beat';
import { DemoLabel, Keyword } from '../v4/kit';
import { Chat } from '../v4/Chat';
import { Install } from '../v4/Install';
import { Finale, lensAt4 } from '../v4/Finale';
import { CamRig, Env, Fog, Lights, Post } from './three/Stage';
import { camAt } from './three/camkeys';
import { SpeedBlur } from '../lib/speedblur';
import { OPEN_KEYS, OpenWorld } from './OpenWorld';
import { FEAT_KEYS, FeatWorld, STATIONS, featRoll } from './FeatWorld';
import { CHAT_KEYS, ChatWorld, INSTALL_KEYS, InstallWorld } from './ChatWorld';
import { INSTALL_LINES } from '../v4/Install';
import { OVER, UpdWorld, VERS, updCam } from './UpdWorld';
import { preloadAll } from './three/preload';

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

// 极光：3D 段压暗当摄影棚背景，2D 段（安装、定版）亮起来
const ENERGY: [number, number][] = [
  [0, 0.0], [B(2), 0.08], [B(4), 0.22], [B(7, 2), 0.32], [B(8), 0.5], [B(8) + 8, 0.42], [B(20) - 1, 0.38], [B(20) + 6, 0.55], [B(22), 0.3],
  [B(28) - 4, 0.3], [B(28) + 6, 0.45], [B(32) - 4, 0.45], [B(32) + 6, 0.28], [B(35, 2), 0.4], [B(36) + 4, 1.0], [B(38), 0.7], [B(40), 0.55],
];
const RIPPLE_C: [number, number][] = [[960, 540], [1380, 560], [960, 540]];
const rippleAt = (f: number): Ripple => {
  for (let i = BIG_HITS.length - 1; i >= 0; i--) {
    const k = (f - BIG_HITS[i]) / (1.95 * 30);
    if (k >= 0 && k <= 1) { const seg = Math.min(1, k / 0.035); return [RIPPLE_C[i][0], RIPPLE_C[i][1], 60 + 1500 * Math.sin((k * Math.PI) / 2), 1.6 * Math.pow(1 - k, 1.5) * seg]; }
  }
  return [960, 540, 0, 0];
};
const between = (f: number, a: number, b: number) => f >= a && f < b;
// 功能段甩镜时的方向性运动模糊：按镜头横向速度（世界单位/帧 → 画面像素/帧，站距 9 单位、画面宽约 8.4 单位）
const whipV = (f: number) => (f >= B(8) && f < B(20) ? -(camAt(FEAT_KEYS, f + 0.5).look[0] - camAt(FEAT_KEYS, f - 0.5).look[0]) * (1920 / 8.4) * 0.5 : 0);

// 3D 世界：按时间切换场景和镜头
const world = (f: number) => {
  if (f < B(8)) return { cam: camAt(OPEN_KEYS, f), node: <OpenWorld f={f} />, sweep: ramp(f, B(1), B(2, 2) - B(1), EASE.smooth) * 2 - 1, fog: [9, 30] };
  if (f < B(20)) { const c = camAt(FEAT_KEYS, f); return { cam: { ...c, roll: featRoll(f) }, node: <FeatWorld f={f} />, sweep: 0, fog: [10, 26] }; }
  if (f < B(28)) return { cam: camAt(CHAT_KEYS, f), node: <ChatWorld f={f} />, sweep: 0, fog: [8, 22] };
  if (f < B(32) - 6) return { cam: camAt(INSTALL_KEYS, f), node: <InstallWorld f={f} lines={INSTALL_LINES} />, sweep: 0, fog: [8, 24] };
  if (f >= B(32) - 6 && f < B(35, 2) + 12) return { cam: updCam(f), node: <UpdWorld f={f} />, sweep: 0, fog: [12, 40] };
  return null;
};

export const Film5: React.FC<{ music?: boolean }> = ({ music = true }) => {
  const f = useCurrentFrame();
  // 3D 画布挂载前，先把纹理和版本标签全部准备好
  const [ready, setReady] = useState(false);
  const [hp] = useState(() => delayRender('preload-3d'));
  useEffect(() => { preloadAll(VERS).then(() => setReady(true)); }, []);
  useEffect(() => { if (ready) continueRender(hp); }, [ready, hp]);
  const energy = interpolate(f, ENERGY.map((e) => e[0]), ENERGY.map((e) => e[1]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const w = world(f);
  // 3D 层的淡入淡出（段与段之间）
  // 段与段之间 3D 层闪黑切换（对话→安装、安装→更新），定版前淡出
  const dip = (c: number) => Math.min(1, Math.abs(f - c) / 6);
  const o3 = Math.min(dip(B(28)), dip(B(32) - 6)) * (1 - ramp(f, B(35, 2), 12, EASE.swift));
  const hit = (h: number) => (f < h ? 0 : f < h + 2 ? 0.5 : 0.5 * Math.exp(-(f - h - 2) / 6));
  const add = Math.max(hit(BIG_HITS[0]), hit(BIG_HITS[1]));
  return (
    <AbsoluteFill style={{ background: '#05060d', fontFamily: F.sans, color: '#f4f6ff' }}>
      <FontGate />
      <AuroraGL energy={energy} ripple={rippleAt(f)} lens={lensAt4(f)} />
      {ready && w && (
        <AbsoluteFill style={{ opacity: o3 }}>
          <SpeedBlur vx={whipV(f)} amount={0.9} max={42}>
          <ThreeCanvas width={1920} height={1080} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} camera={{ fov: 30, near: 0.05, far: 120 }}>
            <CamRig cam={w.cam} />
            <Env intensity={0.6} />
            <Fog near={w.fog[0]} far={w.fog[1]} />
            <Lights sweep={w.sweep} />
            {w.node}
            <Post />
          </ThreeCanvas>
          </SpeedBlur>
        </AbsoluteFill>
      )}
      {/* 文字层 */}
      {between(f, B(3), B(4, 2)) && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 800, textAlign: 'center', opacity: 1 - ramp(f, B(4) + 4, 12, EASE.swift) }}>
          <Rise text="OpenWrt Claude Panel" by="char" start={B(3)} per={0.7} dur={16} dy={14} blur={12} style={{ fontSize: 92, fontWeight: 800, letterSpacing: '-0.01em', color: C.text, textShadow: '0 10px 40px rgba(0,0,0,0.6)' }} />
          <Rise text="OpenWrt 路由器控制面板" start={B(3, 2)} per={1.2} dur={16} dy={10} blur={10} style={{ marginTop: 18, fontSize: 40, fontWeight: 500, color: 'rgba(228,232,255,0.8)', letterSpacing: '0.14em' }} />
        </div>
      )}
      {between(f, B(5), B(8)) && <DemoLabel opacity={ramp(f, B(5), 12, EASE.out)} />}
      {between(f, B(8) - 2, B(20)) && (
        <>
          {STATIONS.filter((s) => s.word).map((s, i, arr) => (
            <Keyword key={i} f={f} at={s.at} out={i < arr.length - 1 ? arr[i + 1].at : B(20) - 4} idx={`0${i + 1} / 06`} text={s.word!} x={120} y={410} size={s.word!.length > 4 ? 92 : 116} />
          ))}
          <DemoLabel />
        </>
      )}
      {between(f, B(20) - 2, B(28)) && <Chat f={f} side="left" />}
      {between(f, B(28) - 2, B(32)) && <Install f={f} />}
      {between(f, B(32) - 6, B(36)) && <UpdOverlay f={f} />}
      {f >= B(35, 2) && <Finale f={f} />}
      {add > 0.002 && <AbsoluteFill style={{ background: '#9fb4ff', opacity: add * 0.5, mixBlendMode: 'screen' }} />}
      <Grain opacity={0.04} />
      <Audio src={staticFile(music ? 'audio/film5.wav' : 'audio/film5-nomusic.wav')} />
    </AbsoluteFill>
  );
};

// 更新段的文字：关键词 + 俯看时出现三个数
export const STAT_AT = [OVER + 6, OVER + 6 + 7, OVER + 6 + 14];
const UpdOverlay: React.FC<{ f: number }> = ({ f }) => {
  const out = ramp(f, B(35, 2), 10, EASE.swift);
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      <Keyword f={f} at={B(32)} out={B(35, 2) + 6} idx="更新" text="一直在改" x={120} y={96} size={80} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 120, display: 'flex', justifyContent: 'center', gap: 28 }}>
        {[['10', '天'], ['20', '个版本'], ['94', '次提交']].map(([v, l], i) => {
          const p = ramp(f, STAT_AT[i], 12, EASE.snappy);
          return (
            <div key={i} style={{ width: 330, height: 150, borderRadius: 28, background: 'rgba(12,16,34,0.55)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.24)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 12, paddingTop: 32, boxSizing: 'border-box', opacity: p, transform: `translateY(${((1 - p) * 40).toFixed(1)}px)` }}>
              <span style={{ fontFamily: F.mono, fontSize: 84, fontWeight: 800, color: C.text }}>{v}</span>
              <span style={{ fontSize: 34, color: 'rgba(228,232,255,0.82)', fontWeight: 600 }}>{l}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
