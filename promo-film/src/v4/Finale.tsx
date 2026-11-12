// 定版（第 35.5–40 小节）：液态玻璃透镜（mg-styles-15 FS_LENS）从右边滑进来 → 第 36 小节强拍，真实图标在玻璃里亮起（大冲击）
// → 第 37 小节透镜带着图标停到左边，字标、一句话、网址依次出来，停到最后一帧。
import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { C, F, Rise } from '../lib/look';
import { EASE, mix, ramp, springAt } from '../lib/ease';
import { B } from './beat';

const S = 16, OX = 960 - 16 * S, OY = 540 - 16 * S, CX = 960, CY = 540;
const PARK_S = 0.6, ICON_X = 500, TEXT_X = 760; // 透镜外缘 x≈296–704，离字标 56px；整组 x≈296–1640，以 960 居中
export const FIN = { lens0: B(35, 2), bloom: B(36), park0: B(37), word: B(37, 1), tag: B(37, 3), url: B(38, 1) };

export const lensAt4 = (f: number) => {
  const on = ramp(f, FIN.lens0, 8, EASE.out);
  if (on <= 0) return null;
  const glide = ramp(f, FIN.lens0, FIN.bloom - FIN.lens0 - 2, EASE.panel);
  const park = ramp(f, FIN.park0, 30, EASE.panel);
  const sc = mix(1, PARK_S, park);
  const k = Math.max(0, (f - FIN.bloom) / 40);
  const wave = k > 0 && k < 1 ? [60 + 1300 * Math.sin((k * Math.PI) / 2), 0.1 * (1 - k), 3 * (1 - k)] : [0, 0, 0];
  const flash = Math.max(0, 1 - Math.abs(f - FIN.bloom) / 9);
  return {
    on, cx: mix(2300, CX, glide) + mix(0, ICON_X - CX, park), cy: mix(640, CY, glide),
    hx: 340 * sc, hy: 340 * sc, r: 175 * sc, bezel: 92 * sc, mag: 1.25, lift: 0.7, disp: 0.9,
    glint: mix(-1.8, 1.8, ramp(f, FIN.lens0 + 6, 40, EASE.smooth)), ring: 0.25 + 0.9 * flash, rimGlow: 1.8,
    wave: wave as [number, number, number],
  };
};

export const Finale: React.FC<{ f: number }> = ({ f }) => {
  const bloom = springAt(f, FIN.bloom, { damping: 12, stiffness: 150 });
  const park = ramp(f, FIN.park0, 30, EASE.panel);
  const scale = mix(1, PARK_S, park), dx = mix(0, ICON_X - CX, park);
  const add = f < FIN.bloom ? 0 : f < FIN.bloom + 2 ? 0.6 : 0.6 * Math.exp(-(f - FIN.bloom - 2) / 8);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `translateX(${dx.toFixed(2)}px) scale(${scale.toFixed(4)})`, transformOrigin: `${CX}px ${CY}px` }}>
        {f >= FIN.bloom - 1 && (
          <div style={{ position: 'absolute', left: OX, top: OY, width: 32 * S, height: 32 * S, opacity: Math.min(0.96, bloom * 1.25), transform: `scale(${mix(0.55, 1, bloom).toFixed(4)})`, filter: `drop-shadow(0 24px 60px rgba(47,107,255,${(0.5 * Math.min(1, bloom)).toFixed(2)}))` }}>
            <Img src={staticFile('brand/icon.svg')} style={{ width: '100%', height: '100%' }} />
          </div>
        )}
      </AbsoluteFill>
      {add > 0.002 && <AbsoluteFill style={{ background: '#9fb4ff', opacity: add * 0.5, mixBlendMode: 'screen' }} />}
      <div style={{ position: 'absolute', left: TEXT_X, top: 372 }}>
        <Rise text="OpenWrt Claude Panel" by="char" start={FIN.word} per={0.7} dur={18} dy={14} blur={12} style={{ fontSize: 88, fontWeight: 800, letterSpacing: '-0.02em', color: C.text }} />
        <Rise text="OpenWrt 路由器控制面板" start={FIN.tag} per={1.0} dur={16} dy={10} blur={10} style={{ marginTop: 18, fontSize: 46, fontWeight: 500, color: 'rgba(228,232,255,0.85)', letterSpacing: '0.1em' }} />
        <div style={{ marginTop: 44, fontFamily: F.mono, fontSize: 36, lineHeight: 1.6, color: C.text, opacity: ramp(f, FIN.url, 14, EASE.out) }}>
          <div>yrlove520.com</div>
          <div style={{ color: 'rgba(228,232,255,0.72)', fontSize: 30 }}>github.com/wznwzn123/openwrt-claude-panel</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
