import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { C, FONT } from './lib/core';
import { AuroraBG, BrandMark, Grain, Phone, Vignette } from './lib/visual';

/* 发布封面（静帧）：横版 16:9（B 站 / 视频号）、竖版 9:16（抖音）、竖版 3:4（小红书）
   主标题要在缩略图里一眼读出：「不用公网 IP」；副标题讲清是什么；手机里是仓库真实界面（演示数据） */

type Layout = 'h' | 'v' | 'x';

const grad = `linear-gradient(90deg, ${C.iconA}, ${C.iconB} 50%, ${C.iconC})`;

const Chip: React.FC<{ children: React.ReactNode; size: number }> = ({ children, size }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', padding: `${size * 0.32}px ${size * 0.75}px`, borderRadius: 999, background: 'rgba(255,255,255,0.09)', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.16)', fontFamily: FONT.sans, fontWeight: 700, fontSize: size, color: C.text, whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
    {children}
  </div>
);

const Brand: React.FC<{ size: number; text: number }> = ({ size, text }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.32 }}>
    <BrandMark size={size} />
    <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: text, color: C.text, letterSpacing: '-0.005em', whiteSpace: 'nowrap' }}>
      OpenWrt <span style={{ background: grad, WebkitBackgroundClip: 'text', color: 'transparent' }}>Claude</span> Panel
    </div>
  </div>
);

const Phones: React.FC<{ w: number; spread: number }> = ({ w, spread }) => (
  <div style={{ position: 'relative', width: w * 1.0 + spread, height: w * 2.2 }}>
    <div style={{ position: 'absolute', left: 0, top: w * 0.18, transform: 'rotate(-7deg)', opacity: 0.96 }}>
      <Phone w={w * 0.86} full dark><Img src={staticFile('shots/real/main-dark.png')} style={{ width: '100%', display: 'block' }} /></Phone>
    </div>
    <div style={{ position: 'absolute', left: spread, top: 0, transform: 'rotate(5deg)' }}>
      <Phone w={w} full><Img src={staticFile('shots/real/main.png')} style={{ width: '100%', display: 'block' }} /></Phone>
    </div>
  </div>
);

export const Cover: React.FC<{ layout: Layout }> = ({ layout }) => {
  const H = layout === 'h';
  const V = layout === 'v';
  const headSize = H ? 168 : V ? 150 : 140;
  const subSize = H ? 60 : V ? 62 : 56;
  const chips = ['不用开端口', '手机直接管', '接入 Claude', '开源 MIT'];
  const text = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: H ? 'flex-start' : 'center', textAlign: H ? 'left' : 'center' }}>
      <Brand size={H ? 92 : 96} text={H ? 46 : 48} />
      <div style={{ marginTop: H ? 42 : 46, fontFamily: FONT.sans, fontWeight: 900, fontSize: headSize, lineHeight: 1.04, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
        <span style={{ color: C.text }}>不用</span>
        <span style={{ background: grad, WebkitBackgroundClip: 'text', color: 'transparent' }}>公网 IP</span>
      </div>
      <div style={{ marginTop: H ? 22 : 26, fontFamily: FONT.sans, fontWeight: 800, fontSize: subSize, color: C.text, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>
        手机管好家里的路由器
      </div>
      <div style={{ marginTop: H ? 18 : 20, fontFamily: FONT.sans, fontWeight: 600, fontSize: subSize * 0.62, color: C.text2, whiteSpace: 'nowrap' }}>
        出门在外也能连回家
      </div>
      <div style={{ marginTop: H ? 40 : 44, display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: H ? 'flex-start' : 'center', maxWidth: H ? 900 : 960 }}>
        {chips.map((c) => <Chip key={c} size={H ? 30 : 34}>{c}</Chip>)}
      </div>
    </div>
  );
  return (
    <AbsoluteFill style={{ background: C.ink0 }}>
      <AuroraBG t={3} intensity={1.15} />
      <Vignette strength={0.45} />
      {H && (
        <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '0 110px', justifyContent: 'space-between' }}>
          {text}
          <div style={{ marginRight: 20 }}><Phones w={330} spread={250} /></div>
        </AbsoluteFill>
      )}
      {!H && (
        <AbsoluteFill style={{ alignItems: 'center', paddingTop: V ? 210 : 120 }}>
          {text}
          <div style={{ marginTop: V ? 90 : 60, marginLeft: V ? 0 : 0 }}><Phones w={V ? 360 : 300} spread={V ? 260 : 230} /></div>
        </AbsoluteFill>
      )}
      <div style={{ position: 'absolute', right: H ? 40 : 36, bottom: H ? 26 : 30, fontFamily: FONT.sans, fontSize: H ? 20 : 22, color: C.text3 }}>界面为演示数据</div>
      <Grain opacity={0.06} />
    </AbsoluteFill>
  );
};
