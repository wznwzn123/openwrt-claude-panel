import React from 'react';
import { useVideoConfig } from 'remotion';
import { Abs, C, EASE, FONT, hash, mix, ramp, springAt, useT, useV } from '../lib/core';
import { AuroraBG, Dot, Glass, Grain, Phone, Pill, Vignette, PHONE_ASPECT, PHONE_BEZEL, phoneBox } from '../lib/visual';
import { HomeLive, HomePhotoTheme } from '../lib/screens';

/* 第二幕 · 12–28s · 10 Aurora & Glassmorphism
 * 配方卡：spotlight-sweep → palette-theme-ripple → exploded-view */

const A = 11.8;
const PHONE_IN = 11.8;
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
/* 沿层边流动的光脉冲（连接线上的数据流） */
const EdgePulse: React.FC<{ t: number; w: number; color: string; phase: number }> = ({ t, w, color, phase }) => {
  const h = w * PHONE_ASPECT;
  const per = 2 * (w + h);
  return (
    <svg width={w} height={h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
      <rect x={1} y={1} width={w - 2} height={h - 2} rx={w * 0.15} fill="none" stroke={color} strokeWidth={3} strokeDasharray={`${per * 0.08} ${per * 0.92}`} strokeDashoffset={-((t * 0.32 + phase) % 1) * per} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
      <rect x={1} y={1} width={w - 2} height={h - 2} rx={w * 0.15} fill="none" stroke={color} strokeWidth={2} strokeDasharray={`${per * 0.04} ${per * 0.96}`} strokeDashoffset={-((t * 0.32 + phase + 0.5) % 1) * per} opacity={0.7} />
    </svg>
  );
};

const TunnelLayer: React.FC<{ t: number; w: number }> = ({ t, w }) => (
  <div style={{ position: 'absolute', inset: 0, borderRadius: w * 0.15, overflow: 'hidden', background: 'linear-gradient(180deg, rgba(6,182,212,0.32), rgba(37,99,235,0.34))', boxShadow: 'inset 0 0 0 1.5px rgba(6,182,212,0.6), 0 0 60px rgba(6,182,212,0.25)' }}>
    {Array.from({ length: 7 }, (_, i) => {
      const k = ((i / 7 + t * 0.25) % 1);
      const inset = k * w * 0.48;
      return <div key={i} style={{ position: 'absolute', left: inset, right: inset, top: inset * 2, bottom: inset * 2, borderRadius: w * 0.15 * (1 - k), border: `1.5px solid rgba(103,232,249,${0.7 * (1 - k)})` }} />;
    })}
    <div style={{ position: 'absolute', left: 0, right: 0, top: '46%', textAlign: 'center', fontFamily: FONT.mono, fontSize: 18, color: '#a5f3fc', letterSpacing: '0.12em' }}>TLS · HTTP/2 · 0 OPEN PORTS</div>
  </div>
);
const DaemonLayer: React.FC<{ w: number }> = ({ w }) => (
  <div style={{ position: 'absolute', inset: 0, borderRadius: w * 0.15, overflow: 'hidden', background: 'linear-gradient(160deg, #2a1b52, #141033)', boxShadow: 'inset 0 0 0 2px rgba(167,139,250,0.8), 0 0 80px rgba(124,58,237,0.45)', padding: 26, boxSizing: 'border-box', fontFamily: FONT.mono, fontSize: 16, lineHeight: 1.75, color: '#c4b5fd' }}>
    {/* 与 src/init.d/claude-mcp 一致：uhttpd 只监听本机 127.0.0.1:18765，隧道 --protocol http2；其余用注释说明（不伪造命令输出） */ ['$ ps | grep -E "uhttpd|cloudflared"', '  1532 root uhttpd -f', '       -p 127.0.0.1:18765', '       -h /www-claude-mcp', '  1702 root cloudflared tunnel', '       --protocol http2', '', '# 只监听本机，不开端口', '# 看门狗每 30 秒巡检', '# 不用 python/node/docker', '# 面板本体约 2 MB'].map((l, i) => (
      <div key={i} style={{ color: l.startsWith('#') ? '#86efac' : l.startsWith('$') ? '#e9d5ff' : '#c4b5fd', whiteSpace: 'pre' }}>{l}</div>
    ))}
  </div>
);

const PLATE_DATA = [
  { k: '跑在自带的 ucode + uhttpd 上', d: '不用装 Python、Node、Docker', icon: '⌁', col: C.violet },
  { k: '面板本体约 2MB', d: '隧道组件 cloudflared 另计 · 小闪存可放内存运行', icon: '◫', col: C.blue },
  { k: '云端加密隧道', d: '不用公网 IP · 不用开端口 · 出门也能连回家', icon: '⟁', col: C.cyan },
];

export const Act2: React.FC = () => {
  const t = useT();
  const { fps } = useVideoConfig();
  const { W, H, vertical } = useV();
  const sw = vertical ? 400 : 334; // 屏幕宽（6.1 寸真机比例 393×852，高度与旧 1:2 版持平）
  const { pw, ph } = phoneBox(sw);

  // 手机运动：左侧破光而出 → 左黄金分割（28%）→ 20s 滑向右侧（72%）
  const inK = springAt(t, PHONE_IN, fps);
  const slideK = springAt(t, SLIDE, fps, { damping: 30, stiffness: 120, mass: 1 });
  const px0 = vertical ? W / 2 : W * 0.28;
  const px1 = vertical ? W / 2 : W * 0.76; // 手机外移，把 Z 轴三层拆解完整让给中左区域
  // 自 O 的门洞（画面中心纵深）飞出，落到左黄金分割
  const px = mix(W / 2, px0, inK) + (px1 - px0) * slideK;
  const py = vertical ? H * 0.29 : H * 0.5 + 10;
  const depthS = mix(0.35, 1, inK) * (vertical ? 1 : mix(1, 0.92, slideK)); // 拆解时微缩 8%
  const ry = mix(14, -16, slideK) + 2 * Math.sin(t * 0.7); // ±2° 呼吸游走
  const outK = ramp(t, OUT, 0.45, EASE.exit);
  const breath = 1 + 0.038 * ramp(t, A, 16, EASE.linear);
  const explode = springAt(t, EXPLODE, fps, { damping: 18, stiffness: 140, mass: 1 });
  const unExplode = 0; // 本幕不合体：带着悬浮层直接交给第三幕
  const ex = explode * (1 - unExplode);
  // 悬浮层 Z 轴呼吸：±6px 正弦，三层错相
  const bob = (i: number) => 6 * Math.sin((2 * Math.PI * t) / 2.6 + i * 1.3) * ex;

  // 涟漪原点（屏幕坐标）= 手机屏幕上缘附近的命令胶囊中心；转为屏幕局部坐标
  const o1: [number, number] = [px0 + (vertical ? 0 : sw * 0.9), py - ph * 0.36];
  const o2: [number, number] = [px0 + (vertical ? 0 : sw * 0.9), py - ph * 0.36];
  const local = (o: [number, number]): [number, number] => [o[0] - (px - sw / 2), o[1] - (py - (sw * PHONE_ASPECT) / 2)];

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
      {/* 穿出 O：11.8s 边缘闪光（与 Sub Drop 同拍），环从门洞扩散出画 */}
      {t < 12.5 && (
        <>
          <Abs style={{ left: W / 2, top: H / 2, width: 40 + 2400 * ramp(t, A, 0.55, EASE.out), height: 40 + 2400 * ramp(t, A, 0.55, EASE.out), transform: 'translate(-50%,-50%)', borderRadius: '50%', border: '3px solid rgba(200,230,255,0.95)', boxShadow: '0 0 40px rgba(124,58,237,0.8), inset 0 0 40px rgba(37,99,235,0.6)', opacity: 1 - ramp(t, A, 0.55, EASE.linear) }} />
          <Abs style={{ inset: 0, background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.9), rgba(160,200,255,0.2) 40%, rgba(255,255,255,0) 70%)', opacity: Math.exp(-((t - A) / 0.09) * 3.2) }} />
        </>
      )}
      <Abs style={{ inset: 0, transform: `scale(${breath}) translateY(${-outK * 40}px)`, opacity: 1 - outK, transformOrigin: '50% 50%' }}>
        {/* 2.5D 真机 + 层级爆炸 */}
        <div style={{ position: 'absolute', left: px - pw / 2, top: py - ph / 2, width: pw, height: ph, perspective: 1600 }}>
          <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: `scale(${depthS}) rotateY(${ry}deg) rotateX(${4 + 4 * ex}deg)`, opacity: Math.min(1, inK * 2.5) }}>
            <div style={{ position: 'absolute', inset: sw * PHONE_BEZEL, transform: `translate3d(${-560 * ex}px, ${-110 * ex + bob(2)}px, ${-260 * ex}px)`, opacity: ex }}>
              <DaemonLayer w={sw} />
              <EdgePulse t={t} w={sw} color="#c4b5fd" phase={0.33} />
            </div>
            <div style={{ position: 'absolute', inset: sw * PHONE_BEZEL, transform: `translate3d(${-280 * ex}px, ${-55 * ex + bob(1)}px, ${-130 * ex}px)`, opacity: ex }}>
              <TunnelLayer t={t} w={sw} />
              <EdgePulse t={t} w={sw} color="#67e8f9" phase={0} />
            </div>
            <div style={{ position: 'absolute', inset: 0, transform: `translate3d(0, ${bob(0)}px, ${60 * ex}px)` }}>
              <Phone w={sw} full glare={ramp(t, 12.5, 1.6, EASE.swift)}>
                <PhoneScreen t={t} w={sw} local1={local(o1)} local2={local(o2)} />
              </Phone>
            </div>
            {/* 层标注 */}
            {['玻璃交互层 · PWA', '加密隧道层 · 云端', '守护进程层 · ucode'].map((s, i) => {
              const k = ramp(t, EXPLODE + 0.5 + i * 0.25, 0.4, EASE.out);
              return (
                <div key={s} style={{ position: 'absolute', left: [sw * 0.3, sw * 0.12, sw * 0.12][i], top: [-92, sw * 0.04 - 132, sw * 0.04 - 172][i], transform: `translate3d(${[0, -280, -560][i] * ex}px, ${[0, -55, -110][i] * ex + bob(i)}px, ${[60, -130, -260][i] * ex}px)`, opacity: k, whiteSpace: 'nowrap' }}>
                  {/* 引导折线：标签 → 所属层上沿 */}
                  <div style={{ position: 'absolute', left: 22, top: 38, width: 1.5, height: [54, 94, 134][i], background: `linear-gradient(180deg, ${[C.blue, C.cyan, C.violet][i]}, rgba(255,255,255,0))` }} />
                  <div style={{ position: 'absolute', left: 18, top: 34 + [54, 94, 134][i], width: 9, height: 9, borderRadius: 5, background: [C.blue, C.cyan, C.violet][i], boxShadow: `0 0 10px ${[C.blue, C.cyan, C.violet][i]}` }} />
                  <Pill bg="rgba(15,23,42,0.72)" style={{ fontSize: 18, padding: '6px 14px' }}>
                    <Dot color={[C.blue, C.cyan, C.violet][i]} size={8} /> {s}
                  </Pill>
                </div>
              );
            })}
          </div>
        </div>

        {/* 标题块 */}
        <div style={{ position: 'absolute', left: titleX, top: titleY, transform: `scale(${titleScale})`, transformOrigin: '0 0', opacity: vertical ? 1 : 1 - ramp(t, SLIDE - 0.3, 0.22, EASE.exit) + ramp(t, SLIDE + 0.32, 0.4, EASE.out) }}>
          <div style={{ opacity: ramp(t, 12.6, 0.6, EASE.out), transform: `translateY(${(1 - ramp(t, 12.6, 0.6, EASE.out)) * 12}px)` }}>
            <Pill style={{ fontSize: 20 }}>
              <Dot color={C.ok} size={8} /> 开源项目 · MIT · <span style={{ fontFamily: FONT.mono }}>v3.1.3</span>
            </Pill>
          </div>
          <div style={{ marginTop: 20, fontFamily: FONT.sans, fontWeight: 800, fontSize: vertical ? 66 : 86, lineHeight: 1.04, letterSpacing: '-0.01em', color: C.text, opacity: ramp(t, 12.85, 0.7, EASE.out), transform: `translateY(${(1 - ramp(t, 12.85, 0.7, EASE.out)) * 16}px)`, whiteSpace: 'nowrap', width: vertical ? W - 160 : undefined /* 第八版修：竖屏品牌名保持一行（审片 B-11） */ }}>
            OpenWrt <span style={{ background: `linear-gradient(90deg, ${C.iconA}, ${C.iconB} 50%, ${C.iconC})`, WebkitBackgroundClip: 'text', color: 'transparent' }}>Claude</span> Panel
          </div>
          <div style={{ marginTop: 26, fontFamily: FONT.sans, fontWeight: 600, fontSize: 38, color: C.text, letterSpacing: '0.04em', opacity: ramp(t, 16.2, 0.6, EASE.out), transform: `translateY(${(1 - ramp(t, 16.2, 0.6, EASE.out)) * 12}px)` }}>
            不用公网 IP，在手机上管好家里的路由器
          </div>
        </div>

        {/* 三块微光架构铭牌：左侧弹射 */}
        {PLATE_DATA.map((p, i) => {
          const k = springAt(t, PLATES[i], fps);
          const x = vertical ? 80 : 150;
          const y = vertical ? H * 0.745 : 520 + i * 150;
          if (vertical && i !== (t < PLATES[1] ? 0 : t < PLATES[2] ? 1 : 2)) return null;
          return (
            <Glass key={i} radius={24} style={{ left: x + (1 - k) * -260, top: y, width: vertical ? W - 160 : 600, height: 124, opacity: Math.min(1, k * 1.6) * (i < PLATES.filter((pt) => t >= pt + 0.3).length - 1 ? 0.5 : 1), display: 'flex', alignItems: 'center', gap: 22, padding: '0 28px' }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: `linear-gradient(135deg, ${p.col}, rgba(255,255,255,0.08))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, color: '#fff', boxShadow: `0 0 30px ${p.col}66`, flex: 'none' }}>{p.icon}</div>
              <div>
                <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 32, color: C.text }}>{p.k}</div>
                <div style={{ fontFamily: FONT.sans, fontWeight: 400, fontSize: 19, color: C.text2, marginTop: 6, whiteSpace: 'nowrap' }}>{p.d}</div>
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
