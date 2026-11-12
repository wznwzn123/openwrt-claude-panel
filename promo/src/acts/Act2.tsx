import React from 'react';
import { useVideoConfig } from 'remotion';
import { Abs, C, EASE, FONT, hash, mix, ramp, springAt, useT, useV } from '../lib/core';
import { AuroraBG, Dot, Glass, Grain, Phone, Pill, Vignette } from '../lib/visual';
import { HomeLive, HomePhotoTheme } from '../lib/screens';

/* 第二幕 · 12–28s · 10 Aurora & Glassmorphism
 * 配方卡：spotlight-sweep → palette-theme-ripple → exploded-view */

const A = 12;
const PHONE_IN = 12.25;
const RIP1 = 16.655; // 涟漪①：浅 → 深
const RIP2 = 18.724; // 涟漪②：深 → 相册磨砂玻璃
const SLIDE = 19.759; // 手机滑向右侧 + 文字对穿到左侧
const EXPLODE = 20.36;
const PLATES = [20.276, 21.31, 23.379]; // 116 BPM 拍点
const OUT = 27.55;

/* 冷白体积聚光灯：光束横扫画布 */
const SpotlightSweep: React.FC<{ t: number }> = ({ t }) => {
  const { W, H } = useV();
  const u = ramp(t, A, 1.6, EASE.swift);
  const x = mix(-0.35 * W, 1.25 * W, u);
  const o = Math.sin(Math.PI * Math.min(1, ramp(t, A, 1.6, EASE.linear)));
  const dust = Array.from({ length: 36 }, (_, i) => {
    const px = hash(i * 3.1) * W;
    const py = hash(i * 7.7) * H;
    const d = Math.max(0, 1 - Math.abs(px - x) / 260);
    return <div key={i} style={{ position: 'absolute', left: px, top: py - t * 12 * (0.5 + hash(i)), width: 3, height: 3, borderRadius: 2, background: '#fff', opacity: d * 0.8 * o }} />;
  });
  return (
    <>
      <Abs style={{ left: x - 300, top: -H * 0.2, width: 600, height: H * 1.4, transform: 'rotate(14deg)', background: 'linear-gradient(90deg, rgba(220,235,255,0) 0%, rgba(220,235,255,0.16) 40%, rgba(240,248,255,0.32) 50%, rgba(220,235,255,0.16) 60%, rgba(220,235,255,0) 100%)', opacity: o, mixBlendMode: 'screen' }} />
      {dust}
    </>
  );
};

/* palette-theme-ripple：命令胶囊 CRT 收成亮点 → 圆形涟漪荡开换肤（3px 白热环 + 晚 4f 回声环） */
const Ripple: React.FC<{ t: number; at: number; ox: number; oy: number; label: string }> = ({ t, at, ox, oy, label }) => {
  const { W, H } = useV();
  const R = Math.hypot(W, H);
  const pill0 = at - 0.75;
  const drop = springAt(t, pill0, 60, { damping: 17, stiffness: 240 });
  const crtV = ramp(t, at - 0.22, 0.08, EASE.exit);
  const crtH = ramp(t, at - 0.14, 0.08, EASE.exit);
  const r = mix(6, R, ramp(t, at, 0.6, bezierOut));
  const ringO = 1 - ramp(t, at + 0.25, 0.4, EASE.linear);
  const echo = mix(6, R, ramp(t, at + 0.07, 0.6, bezierOut));
  return (
    <>
      {t > pill0 && t < at && (
        <div style={{ position: 'absolute', left: ox, top: oy, transform: `translate(-50%, ${-50 + (1 - drop) * -80}%) scale(${1 - crtH * 0.97}, ${1 - crtV * 0.94})`, opacity: Math.min(1, drop * 2) }}>
          <Glass radius={26} fill={0.1} style={{ position: 'relative', padding: '16px 28px', display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap' }}>
            <span style={{ fontFamily: FONT.mono, fontSize: 20, color: C.text3 }}>⌘</span>
            <span style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: 26, color: C.text }}>{label}</span>
            <span style={{ fontFamily: FONT.mono, fontSize: 18, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.12)', color: C.text2 }}>↵</span>
          </Glass>
        </div>
      )}
      {t >= at - 0.06 && t < at && <div style={{ position: 'absolute', left: ox - 6, top: oy - 6, width: 12, height: 12, borderRadius: 6, background: '#fff', boxShadow: '0 0 30px 10px rgba(255,255,255,0.8)' }} />}
      {t >= at && t < at + 0.7 && (
        <>
          <div style={{ position: 'absolute', left: ox - r, top: oy - r, width: r * 2, height: r * 2, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.95)', boxShadow: `0 0 40px rgba(124,58,237,0.7), inset 0 0 40px rgba(255,255,255,0.35)`, opacity: ringO }} />
          <div style={{ position: 'absolute', left: ox - echo, top: oy - echo, width: echo * 2, height: echo * 2, borderRadius: '50%', border: '1.5px solid rgba(160,200,255,0.6)', opacity: ringO * 0.7 }} />
        </>
      )}
    </>
  );
};
const bezierOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3.2);

/* 手机屏幕：涟漪按圆形 clip 揭开新主题（圆心 = 涟漪原点，换到屏幕局部坐标） */
const PhoneScreen: React.FC<{ t: number; w: number; local1: [number, number]; local2: [number, number] }> = ({ t, w, local1, local2 }) => {
  const R = w * 2.4;
  const r1 = t < RIP1 ? 0 : mix(0, R * 3, ramp(t, RIP1, 0.6, bezierOut));
  const r2 = t < RIP2 ? 0 : mix(0, R * 3, ramp(t, RIP2, 0.6, bezierOut));
  return (
    <>
      <HomeLive t={t} w={w} />
      {r1 > 0 && (
        <div style={{ position: 'absolute', inset: 0, clipPath: `circle(${r1}px at ${local1[0]}px ${local1[1]}px)` }}>
          <HomeLive t={t} w={w} dark />
        </div>
      )}
      {r2 > 0 && (
        <div style={{ position: 'absolute', inset: 0, clipPath: `circle(${r2}px at ${local2[0]}px ${local2[1]}px)` }}>
          <HomePhotoTheme t={t} w={w} />
        </div>
      )}
    </>
  );
};

/* exploded-view 的两层底层结构 */
const TunnelLayer: React.FC<{ t: number; w: number }> = ({ t, w }) => (
  <div style={{ position: 'absolute', inset: 0, borderRadius: w * 0.15, overflow: 'hidden', background: 'linear-gradient(180deg, rgba(6,182,212,0.32), rgba(37,99,235,0.34))', boxShadow: 'inset 0 0 0 1.5px rgba(6,182,212,0.6), 0 0 60px rgba(6,182,212,0.25)' }}>
    {Array.from({ length: 7 }, (_, i) => {
      const k = ((i / 7 + t * 0.25) % 1);
      const inset = k * w * 0.48;
      return <div key={i} style={{ position: 'absolute', left: inset, right: inset, top: inset * 2, bottom: inset * 2, borderRadius: w * 0.15 * (1 - k), border: `1.5px solid rgba(103,232,249,${0.7 * (1 - k)})` }} />;
    })}
    <div style={{ position: 'absolute', left: 0, right: 0, top: '46%', textAlign: 'center', fontFamily: FONT.mono, fontSize: 18, color: '#a5f3fc', letterSpacing: '0.12em' }}>TLS · QUIC · 0 OPEN PORTS</div>
  </div>
);
const DaemonLayer: React.FC<{ w: number }> = ({ w }) => (
  <div style={{ position: 'absolute', inset: 0, borderRadius: w * 0.15, overflow: 'hidden', background: 'linear-gradient(160deg, #2a1b52, #141033)', boxShadow: 'inset 0 0 0 2px rgba(167,139,250,0.8), 0 0 80px rgba(124,58,237,0.45)', padding: 26, boxSizing: 'border-box', fontFamily: FONT.mono, fontSize: 16, lineHeight: 1.75, color: '#c4b5fd' }}>
    {['$ ps | grep -E "uhttpd|ucode"', '  1532 root  uhttpd -p 0.0.0.0:80', '  1611 root  ucode /www/cgi-bin/api', '  1688 root  cmcp-watchdog --30s', '  1702 root  cloudflared tunnel run', '', '$ du -sh /www/panel', '  2.0M   /www/panel', '', '# python: none', '# node:   none', '# docker: none'].map((l, i) => (
      <div key={i} style={{ color: l.startsWith('#') ? '#86efac' : l.startsWith('$') ? '#e9d5ff' : '#c4b5fd', whiteSpace: 'pre' }}>{l}</div>
    ))}
  </div>
);

const PLATE_DATA = [
  { k: '原生 ucode + uhttpd', d: '零 Python · 零 Node · 零 Docker，纯粹原生基因', icon: '⌁', col: C.violet },
  { k: '仅占 2MB 闪存空间', d: '兼容 OpenWrt 22.03+ · Kwrt · ImmortalWrt', icon: '◫', col: C.blue },
  { k: 'Cloudflare 加密隧道', d: '无需公网 IP · 无需开放端口 · 出门秒级直连', icon: '⟁', col: C.cyan },
];

export const Act2: React.FC = () => {
  const t = useT();
  const { fps } = useVideoConfig();
  const { W, H, vertical } = useV();
  const sw = vertical ? 330 : 360; // 屏幕宽
  const pw = sw * 1.08;
  const ph = sw * 2.08;

  // 手机运动：左侧破光而出 → 左黄金分割（28%）→ 20s 滑向右侧（72%）
  const inK = springAt(t, PHONE_IN, fps);
  const slideK = springAt(t, SLIDE, fps, { damping: 30, stiffness: 120, mass: 1 });
  const px0 = vertical ? W / 2 : W * 0.28;
  const px1 = vertical ? W / 2 : W * 0.72;
  const px = mix(-0.25 * W, px0, inK) + (px1 - px0) * slideK;
  const py = vertical ? H * 0.29 : H * 0.5 + 10;
  const ry = mix(14, -16, slideK) + 2 * Math.sin(t * 0.7); // ±2° 呼吸游走
  const outK = ramp(t, OUT, 0.45, EASE.exit);
  const breath = 1 + 0.038 * ramp(t, A, 16, EASE.linear);
  const explode = springAt(t, EXPLODE, fps, { damping: 18, stiffness: 140, mass: 1 });
  const unExplode = 0; // 本幕不合体：带着悬浮层直接交给第三幕
  const ex = explode * (1 - unExplode);

  // 涟漪原点（屏幕坐标）= 手机屏幕上缘附近的命令胶囊中心；转为屏幕局部坐标
  const o1: [number, number] = [px0 + (vertical ? 0 : sw * 0.9), py - ph * 0.36];
  const o2: [number, number] = [px0 + (vertical ? 0 : sw * 0.9), py - ph * 0.36];
  const local = (o: [number, number]): [number, number] => [o[0] - (px - sw / 2), o[1] - (py - sw)];

  // 标题块：12–20s 在手机右侧；20s 后对穿到左侧
  const titleX0 = vertical ? 80 : W * 0.445;
  const titleX1 = vertical ? 80 : 150;
  const titleX = mix(titleX0, titleX1, slideK);
  const titleY = vertical ? H * 0.55 : mix(H * 0.5 - 190, 128, slideK);
  const titleScale = vertical ? 0.86 : mix(1, 0.8, slideK);

  return (
    <Abs style={{ inset: 0, overflow: 'hidden' }}>
      <AuroraBG intensity={mix(0.6, 1, ramp(t, A, 1.2, EASE.out))} />
      <SpotlightSweep t={t} />
      <Abs style={{ inset: 0, transform: `scale(${breath}) translateY(${-outK * 40}px)`, opacity: 1 - outK, transformOrigin: '50% 50%' }}>
        {/* 2.5D 真机 + 层级爆炸 */}
        <div style={{ position: 'absolute', left: px - pw / 2, top: py - ph / 2, width: pw, height: ph, perspective: 1600 }}>
          <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: `rotateY(${ry}deg) rotateX(${4 + 4 * ex}deg)` }}>
            <div style={{ position: 'absolute', inset: sw * 0.04, transform: `translate3d(${-330 * ex}px, ${-30 * ex}px, ${-260 * ex}px)`, opacity: ex }}>
              <DaemonLayer w={sw} />
            </div>
            <div style={{ position: 'absolute', inset: sw * 0.04, transform: `translate3d(${-165 * ex}px, ${-15 * ex}px, ${-130 * ex}px)`, opacity: ex }}>
              <TunnelLayer t={t} w={sw} />
            </div>
            <div style={{ position: 'absolute', inset: 0, transform: `translateZ(${60 * ex}px)` }}>
              <Phone w={sw} glare={ramp(t, 12.5, 1.6, EASE.swift)}>
                <PhoneScreen t={t} w={sw} local1={local(o1)} local2={local(o2)} />
              </Phone>
            </div>
            {/* 层标注 */}
            {['玻璃交互层 · PWA', '加密隧道层 · Cloudflare', '守护进程层 · ucode'].map((s, i) => {
              const k = ramp(t, EXPLODE + 0.5 + i * 0.25, 0.4, EASE.out);
              return (
                <div key={s} style={{ position: 'absolute', left: [sw * 0.5, sw * 0.04 - 20, sw * 0.04 - 20][i], top: [-56, sw * 0.04 - 56, sw * 2.04 + 16][i], transform: `translate3d(${[0, -165, -330][i] * ex}px, ${[0, -15, -30][i] * ex}px, ${[60, -130, -260][i] * ex}px)`, opacity: k, whiteSpace: 'nowrap' }}>
                  <Pill bg="rgba(15,23,42,0.6)" style={{ fontSize: 18, padding: '6px 14px' }}>
                    <Dot color={[C.blue, C.cyan, C.violet][i]} size={8} /> {s}
                  </Pill>
                </div>
              );
            })}
          </div>
        </div>

        {/* 标题块 */}
        <div style={{ position: 'absolute', left: titleX, top: titleY, transform: `scale(${titleScale})`, transformOrigin: '0 0' }}>
          <div style={{ opacity: ramp(t, 12.6, 0.6, EASE.out), transform: `translateY(${(1 - ramp(t, 12.6, 0.6, EASE.out)) * 12}px)` }}>
            <Pill style={{ fontSize: 20 }}>
              <Dot color={C.ok} size={8} /> 开源项目 · MIT · <span style={{ fontFamily: FONT.mono }}>v3.1.1</span>
            </Pill>
          </div>
          <div style={{ marginTop: 20, fontFamily: FONT.sans, fontWeight: 800, fontSize: vertical ? 84 : 86, lineHeight: 1.04, letterSpacing: '-0.01em', color: C.text, opacity: ramp(t, 12.85, 0.7, EASE.out), transform: `translateY(${(1 - ramp(t, 12.85, 0.7, EASE.out)) * 16}px)`, whiteSpace: vertical ? 'normal' : 'nowrap', width: vertical ? W - 160 : undefined }}>
            OpenWrt <span style={{ background: `linear-gradient(90deg, ${C.iconA}, ${C.iconB} 50%, ${C.iconC})`, WebkitBackgroundClip: 'text', color: 'transparent' }}>Claude</span> Panel
          </div>
          <div style={{ marginTop: 26, fontFamily: FONT.sans, fontWeight: 600, fontSize: 38, color: C.text, letterSpacing: '0.04em', opacity: ramp(t, 16.2, 0.6, EASE.out), transform: `translateY(${(1 - ramp(t, 16.2, 0.6, EASE.out)) * 12}px)` }}>
            原生 ucode 驱动<span style={{ color: C.text3, margin: '0 0.45em' }}>·</span>仅占 2MB 闪存
          </div>
          <div style={{ marginTop: 12, fontFamily: FONT.sans, fontWeight: 600, fontSize: 38, color: C.text, letterSpacing: '0.04em', opacity: ramp(t, 23.379, 0.6, EASE.out), transform: `translateY(${(1 - ramp(t, 23.379, 0.6, EASE.out)) * 12}px)` }}>
            无需公网 IP<span style={{ color: C.text3, margin: '0 0.45em' }}>·</span>加密隧道直连
          </div>
        </div>

        {/* 三块微光架构铭牌：左侧弹射 */}
        {PLATE_DATA.map((p, i) => {
          const k = springAt(t, PLATES[i], fps);
          const x = vertical ? 80 : 150;
          const y = vertical ? H * 0.745 : 520 + i * 150;
          if (vertical && i !== (t < PLATES[1] ? 0 : t < PLATES[2] ? 1 : 2)) return null;
          return (
            <Glass key={i} radius={24} style={{ left: x + (1 - k) * -260, top: y, width: vertical ? W - 160 : 700, height: 124, opacity: Math.min(1, k * 1.6), display: 'flex', alignItems: 'center', gap: 22, padding: '0 28px' }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: `linear-gradient(135deg, ${p.col}, rgba(255,255,255,0.08))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, color: '#fff', boxShadow: `0 0 30px ${p.col}66`, flex: 'none' }}>{p.icon}</div>
              <div>
                <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 32, color: C.text }}>{p.k}</div>
                <div style={{ fontFamily: FONT.sans, fontWeight: 400, fontSize: 22, color: C.text2, marginTop: 6 }}>{p.d}</div>
              </div>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: 2, background: p.col, boxShadow: `0 0 16px ${p.col}` }} />
            </Glass>
          );
        })}

        <Ripple t={t} at={RIP1} ox={o1[0]} oy={o1[1]} label="外观 · 深色模式" />
        <Ripple t={t} at={RIP2} ox={o2[0]} oy={o2[1]} label="外观 · 相册背景磨砂玻璃" />
      </Abs>
      <Vignette strength={0.45} />
      <Grain opacity={0.1} />
    </Abs>
  );
};
