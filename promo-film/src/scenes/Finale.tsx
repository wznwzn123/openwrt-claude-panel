// 收尾（288f）：四个数字（全部来自 git 历史，落定后停 ≥1 秒）→ 液态玻璃透镜滑进来 → 线在玻璃上按图标真实的三笔画出图标
// → 强拍上真实图标在玻璃里亮起（全片第三次大冲击：极光光波 + 透镜光环 + 品牌蓝加色闪）→ 整组以画面中线居中定版，hold 到结束。
// 镜头卡：DigitRoll（video-shotcraft assets/lib，这里改成不整圈转、直接滚到目标值）、ui-to-brand-morph（线稿 → 品牌标志）、R1 字标 hold ≥1s。
import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { C, F, Rise, glass } from '../lib/look';
import { EASE, mix, ramp, springAt } from '../lib/ease';
import { MultiStroke, NibDefs, iconStrokes } from '../lib/thread';
import { Led, LedDefs } from './Open';

// bloom = 144 = 第 32 小节的强拍
export const FIN_T = { stats: 6, statsOut: 78, lens0: 84, lens1: 128, draw0: 100, draw1: 144, bloom: 144, park0: 168, park1: 200, word: 188, tag: 206, url: 222, end: 274 };
const T = FIN_T;
// 图标 32 网格 × 16 = 512px，居中在 (960, 440)；透镜比图标大一圈（540px），露出一圈玻璃斜面
const S = 16, OX = 704, OY = 184, CX = 960, CY = 440;
const ICON = iconStrokes(OX, OY, S);
// 定版：图标缩到 0.6（≈307px），图标 + 64px 间距 + 字标整组以 x=960 居中
const PARK_S = 0.6, ICON_X = 488, TEXT_X = 705;

export const lensAt = (f: number) => {
  const on = ramp(f, T.lens0, 10, EASE.out) * (1 - ramp(f, T.end, 14, EASE.swift));
  if (on <= 0) return null;
  const glide = ramp(f, T.lens0, T.lens1 - T.lens0, EASE.panel);
  const park = ramp(f, T.park0, T.park1 - T.park0, EASE.panel);
  const sc = mix(1, PARK_S, park);
  const k = Math.max(0, (f - T.bloom) / 40);
  const wave = k > 0 && k < 1 ? [60 + 1300 * Math.sin((k * Math.PI) / 2), 0.1 * (1 - k), 3 * (1 - k)] : [0, 0, 0];
  const flash = Math.max(0, 1 - Math.abs(f - T.bloom) / 9);
  return {
    on, cx: mix(2300, CX, glide) + mix(0, ICON_X - CX, park), cy: mix(620, CY, glide),
    hx: 270 * sc, hy: 270 * sc, r: 150 * sc, bezel: 64 * sc, mag: 1.2, lift: 0.7, disp: 0.45,
    glint: mix(-1.8, 1.8, ramp(f, 120, 46, EASE.smooth)), ring: 0.25 + 0.9 * flash, rimGlow: 1.8,
    wave: wave as [number, number, number],
  };
};

const STATS = [
  { v: '94', l: '次提交' },
  { v: '20', l: '个版本' },
  { v: '28', l: '次在凌晨提交' },
  { v: '24,236', l: '行新增（代码和文档）' },
];

// 数字滚动：每一位从 0 直接滚到目标值（不整圈转，避免滚动中闪出「94,000」这类没意义的数），位与位错开 2 帧
const Roll: React.FC<{ value: string; start: number; f: number; size: number }> = ({ value, start, f, size }) => {
  const lh = size * 1.15;
  let k = 0;
  return (
    <span style={{ display: 'inline-flex', height: lh, overflow: 'hidden', fontVariantNumeric: 'tabular-nums' }}>
      {Array.from(value).map((ch, i) => {
        if (!/\d/.test(ch)) return <span key={i} style={{ fontSize: size, lineHeight: `${lh}px` }}>{ch}</span>;
        const d = +ch, p = ramp(f, start + (k++) * 2, 18, EASE.out);
        return (
          <span key={i} style={{ display: 'inline-block', height: lh, overflow: 'hidden' }}>
            <span style={{ display: 'block', transform: `translateY(${(-d * p * lh).toFixed(2)}px)` }}>
              {'0123456789'.split('').map((x) => <span key={x} style={{ display: 'block', fontSize: size, lineHeight: `${lh}px` }}>{x}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
};

export const Finale: React.FC = () => {
  const f = useCurrentFrame();
  const statsO = 1 - ramp(f, T.statsOut, 12, EASE.swift);
  const drawn = ramp(f, T.draw0, T.draw1 - T.draw0, EASE.smooth);
  const bloom = springAt(f, T.bloom, { damping: 13, stiffness: 140 });
  const park = ramp(f, T.park0, T.park1 - T.park0, EASE.panel);
  const scale = mix(1, PARK_S, park);
  const dx = mix(0, ICON_X - CX, park);
  const lineFade = 1 - ramp(f, T.bloom + 4, 16, EASE.swift);
  // 品牌蓝加色闪：强拍上 2 帧 0.6，之后 8 帧指数衰减
  const add = f < T.bloom ? 0 : f < T.bloom + 2 ? 0.6 : 0.6 * Math.exp(-(f - T.bloom - 2) / 8);
  const end = ramp(f, T.end, 14, EASE.swift);
  return (
    <AbsoluteFill style={{ opacity: 1 - end }}>
      {/* 数字 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 290, opacity: statsO, filter: statsO < 0.999 ? `blur(${((1 - statsO) * 14).toFixed(1)}px)` : undefined }}>
        <Rise text="10.31 — 11.09" start={T.stats} per={0.8} dur={16} style={{ textAlign: 'center', fontFamily: F.mono, fontSize: 32, color: C.dim, letterSpacing: '0.1em' }} />
        <div style={{ marginTop: 50, display: 'flex', justifyContent: 'center', gap: 28 }}>
          {STATS.map((s, i) => {
            const p = springAt(f, T.stats + 4 + i * 4, { damping: 15, stiffness: 150 });
            return (
              <div key={i} style={{ width: 380, height: 270, boxSizing: 'border-box', padding: '0 40px', overflow: 'hidden', ...glass({ radius: 30, fill: 0.08 }), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: Math.min(1, p * 1.4), transform: `translateY(${((1 - p) * 50).toFixed(1)}px)` }}>
                <div style={{ fontFamily: F.mono, fontWeight: 700, color: C.text }}><Roll value={s.v} start={T.stats + 8 + i * 4} f={f} size={88} /></div>
                <div style={{ marginTop: 14, fontSize: 32, color: C.dim, whiteSpace: 'nowrap' }}>{s.l}</div>
              </div>
            );
          })}
        </div>
      </div>
      {/* 图标：线稿 → 真实图标（真实图标与线稿同一个 512px 网格，一一对上） */}
      <AbsoluteFill style={{ transform: `translateX(${dx.toFixed(2)}px) scale(${scale.toFixed(4)})`, transformOrigin: `${CX}px ${CY}px` }}>
        {f >= T.bloom - 2 && (
          <div style={{ position: 'absolute', left: OX, top: OY, width: 32 * S, height: 32 * S, opacity: Math.min(0.95, bloom * 1.2), transform: `scale(${mix(0.92, 1, bloom).toFixed(4)})`, filter: `drop-shadow(0 24px 60px rgba(47,107,255,${(0.5 * bloom).toFixed(2)}))` }}>
            <Img src={staticFile('brand/icon.svg')} style={{ width: '100%', height: '100%' }} />
          </div>
        )}
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <NibDefs />
          <LedDefs />
          {f >= T.draw0 && <MultiStroke polys={ICON} p={drawn} width={5} dim={[1, 1, 0.6]} opacity={lineFade} glow={1.4} />}
          {f >= T.draw0 - 6 && f < T.bloom + 20 && <Led x={OX + 11.4 * S} y={OY + 19.75 * S} f={f} on={ramp(f, T.draw0 - 6, 8) * lineFade} size={1.1} />}
        </svg>
      </AbsoluteFill>
      {add > 0.002 && <AbsoluteFill style={{ background: '#9fb4ff', opacity: add * 0.5, mixBlendMode: 'screen' }} />}
      {/* 字标 + 一句话 + 网址（整组和图标一起以画面中线居中） */}
      <div style={{ position: 'absolute', left: TEXT_X, top: 268 }}>
        <Rise text="OpenWrt Claude Panel" by="char" start={T.word} per={0.9} dur={20} dy={14} blur={12} style={{ fontSize: 84, fontWeight: 700, letterSpacing: '-0.02em', color: C.text }} />
        <Rise text="线还在，接着写。" start={T.tag} per={2.2} dur={22} dy={12} blur={12} style={{ marginTop: 22, fontFamily: F.serif, fontSize: 54, fontWeight: 600, color: C.text, letterSpacing: '0.06em' }} />
        <div style={{ marginTop: 40, fontFamily: F.mono, fontSize: 36, lineHeight: 1.6, color: C.text, opacity: ramp(f, T.url, 16, EASE.out) }}>
          <div>yrlove520.com</div>
          <div style={{ color: C.dim, fontSize: 30 }}>github.com/wznwzn123/openwrt-claude-panel</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
