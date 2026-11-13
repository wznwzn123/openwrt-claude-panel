import React, { useMemo } from 'react';
import { Img, staticFile, useVideoConfig } from 'remotion';
import { Abs, C, EASE, FONT, hash, mix, ramp, useT, useV } from '../lib/core';
import { AuroraBG, Grain, HudBG, Phone, Vignette } from '../lib/visual';
import { LegacyAdmin } from '../lib/legacy';

/* 第一幕 · 0–12s · 08 Cyberpunk HUD
 * 配方卡：flash-cut → paparazzi-flash → text-as-mask → transition-travel */

const FLASH1 = 1.0;
const FLASH2 = 1.9;
const MON0 = 3.0;
const COLLAPSE0 = 5.2;
const COLLAPSE1 = 5.75;
const WORD0 = 6.0;
const PORTAL0 = 9.7;
const RUSH0 = 10.35;
const RUSH1 = 11.8;

/** 白闪包络：峰值即刻，指数衰减（快门余韵） */
// up > 0：闪光前用 up 秒线性爬升（降低黑→白单帧跳变的刺激，审片 C1）
const flashEnv = (t: number, at: number, len = 0.16, up = 0) => (t < at - up ? 0 : t < at ? (t - (at - up)) / up : Math.exp(-((t - at) / len) * 3.2));

/* 取景器 HUD：四角括号 + 曝光读数 + 张数 */
const Viewfinder: React.FC<{ t: number; shot: number; focus?: { x: number; y: number; w: number; h: number; lock: number } }> = ({ t, shot, focus }) => {
  const { W, H } = useV();
  const m = 54;
  const corner = (x: number, y: number, sx: number, sy: number, len = 46, col = 'rgba(255,255,255,0.85)') => (
    <div key={`${x}${y}`} style={{ position: 'absolute', left: x, top: y, width: len, height: len, transform: `scale(${sx},${sy})`, transformOrigin: '0 0', borderLeft: `3px solid ${col}`, borderTop: `3px solid ${col}` }} />
  );
  return (
    <>
      {corner(m, m, 1, 1)}
      {corner(W - m, m, -1, 1)}
      {corner(m, H - m, 1, -1)}
      {corner(W - m, H - m, -1, -1)}
      <Abs style={{ left: m + 60, top: m + 8, fontFamily: FONT.mono, fontSize: 20, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.12em' }}>
        ISO 3200 · 1/250 · ƒ1.8 · <span style={{ color: '#ff4d4d' }}>●</span> REC
      </Abs>
      <Abs style={{ right: m + 60, top: m + 8, fontFamily: FONT.mono, fontSize: 20, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.12em' }}>
        SHOT {String(shot).padStart(2, '0')}/03 · {t < FLASH2 ? '⚡ CHARGING' : '⚡ READY'}
      </Abs>
      {focus && focus.lock >= 0 && (
        <div
          style={{
            position: 'absolute',
            left: focus.x - focus.w / 2,
            top: focus.y - focus.h / 2,
            width: focus.w,
            height: focus.h,
            border: `2px solid ${focus.lock > 0.95 ? '#FFD27A' : 'rgba(255,255,255,0.7)'}`,
            boxShadow: focus.lock > 0.95 ? '0 0 18px rgba(255,210,122,0.6)' : undefined,
          }}
        />
      )}
    </>
  );
};

/* 镜头 A：微距手机 + 双指狼狈缩放 */
const ShotA: React.FC<{ t: number }> = ({ t }) => {
  const { W, H, vertical } = useV();
  const pinch = ramp(t, 0.22, 0.32, EASE.swift) * 0.25 + ramp(t, 0.6, 0.25, EASE.swift) * 0.18; // 一抖一抖的缩放
  const sw = 420;
  const zoom = vertical ? 1.9 : 1.6;
  const push = 1 + 0.03 * ramp(t, 0, 1, EASE.linear);
  const pageScale = (sw / 1024) * (1 + pinch);
  const fx = mix(0, 30, pinch);
  const finger = (s: number) => ({ x: W / 2 + s * (60 + 120 * pinch), y: H / 2 + 40 + s * (30 + 80 * pinch) });
  return (
    <Abs style={{ inset: 0, overflow: 'hidden' }}>
      <HudBG scan={false} chrome={false} />
      <Abs style={{ left: W / 2, top: H / 2, transform: `translate(-50%,-30%) scale(${zoom * push}) rotateZ(-4deg)` }}>
        <Phone w={sw} shadow={false}>
          <div style={{ position: 'absolute', left: -fx, top: 0, transform: `scale(${pageScale})`, transformOrigin: '0 0' }}>
            <LegacyAdmin />
          </div>
        </Phone>
      </Abs>
      {/* 0.3s 红色失败条（钩子第一拍就给冲突） */}
      <div style={{ position: 'absolute', left: W / 2 - (vertical ? 360 : 330), top: H * 0.16, width: vertical ? 720 : 660, padding: '14px 22px', borderRadius: 10, background: 'rgba(200,20,20,0.92)', color: '#fff', fontFamily: 'Arial, "Noto Sans SC", sans-serif', fontSize: 26, fontWeight: 700, boxShadow: '0 12px 40px rgba(200,0,0,0.45)', opacity: ramp(t, 0.3, 0.08, EASE.linear), transform: `translateY(${(1 - ramp(t, 0.3, 0.2, EASE.snappy)) * -30}px) rotate(-1.5deg)` }}>
        ✕ Port forwarding failed · 端口映射失败
      </div>
      {/* 双指触点 */}
      {t > 0.18 && t < 0.98 && (
        <>
          {[-1, 1].map((s) => (
            <div key={s} style={{ position: 'absolute', left: finger(s).x - 48, top: finger(s).y - 48, width: 96, height: 96, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.3) 55%, rgba(255,255,255,0) 72%)', border: '3px solid rgba(255,255,255,0.85)', boxShadow: '0 6px 24px rgba(0,0,0,0.45)' }} />
          ))}
        </>
      )}
      <Abs style={{ inset: 0, background: 'radial-gradient(ellipse 60% 55% at 50% 50%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.65) 100%)' }} />
    </Abs>
  );
};

/* 镜头 B/C：定格裁切（照片感：去饱和 + 提对比） */
const Crop: React.FC<{ t: number; at: number; cx: number; cy: number; s: number; error?: boolean; dialog?: boolean }> = ({ t, at, cx, cy, s, error, dialog }) => {
  const { W, H } = useV();
  const settle = 1.03 - 0.03 * ramp(t, at, 0.35, EASE.out) + 0.012 * ramp(t, at + 0.35, 1.5, EASE.linear);
  return (
    <Abs style={{ inset: 0, overflow: 'hidden', background: '#111' }}>
      <div style={{ position: 'absolute', left: W / 2 - cx * s * settle, top: H / 2 - cy * s * settle, transform: `scale(${s * settle})`, transformOrigin: '0 0', filter: 'saturate(0.8) contrast(1.12)' }}>
        <LegacyAdmin errorOn={error ? 1 : 0} dialogOn={dialog ? 1 : 0} />
      </div>
      <Vignette strength={0.6} />
    </Abs>
  );
};

/* 三联监控：高频震颤 → 向中心坍缩 */
const Monitors: React.FC<{ t: number }> = ({ t }) => {
  const { W, H, vertical } = useV();
  const { fps } = useVideoConfig();
  const f = Math.round(t * fps);
  const mw = vertical ? 860 : 560;
  const mh = vertical ? 470 : 340;
  const amp = 1.5 + 22 * ramp(t, MON0 + 0.4, COLLAPSE0 - MON0 - 0.4, EASE.inQuad);
  const split = 2 + 16 * ramp(t, MON0 + 0.6, COLLAPSE1 - MON0 - 0.6, EASE.inQuad);
  const col = ramp(t, COLLAPSE0, COLLAPSE1 - COLLAPSE0, EASE.exit);
  const labels = ['CAM 01 · LEGACY UI · 4PX', 'CAM 02 · PORT FWD · FAILED', 'CAM 03 · WAN · NO PUBLIC IP'];
  const crops = [
    { cx: 300, cy: 150, s: 0.62, error: false, dialog: false },
    { cx: 512, cy: 205, s: 0.9, error: true, dialog: false },
    { cx: 512, cy: 380, s: 0.95, error: true, dialog: true },
  ];
  return (
    <Abs style={{ inset: 0 }}>
      <HudBG />
      {[0, 1, 2].map((i) => {
        const bx = vertical ? W / 2 : W / 2 + (i - 1) * (mw + 44);
        const by = vertical ? H / 2 + (i - 1) * (mh + 90) : H / 2;
        const jx = (hash(f * 3 + i) - 0.5) * 2 * amp;
        const jy = (hash(f * 7 + i * 11) - 0.5) * 2 * amp * 0.6;
        const x = mix(bx, W / 2, col) + jx;
        const y = mix(by, H / 2, col) + jy;
        const sc = mix(1, 0.02, col);
        const appear = ramp(t, MON0 + i * 0.08, 0.12, EASE.linear);
        const c = crops[i];
        return (
          <div key={i} style={{ position: 'absolute', left: x - mw / 2, top: y - mh / 2, width: mw, height: mh, transform: `scale(${sc}) rotate(${col * (i - 1) * 25}deg)`, opacity: appear }}>
            <div style={{ position: 'absolute', inset: 0, transform: `translateX(${split}px)`, border: '2px solid rgba(255,0,72,0.8)', boxShadow: `inset ${split * 0.6}px 0 0 rgba(255,0,72,0.25)`, mixBlendMode: 'screen' }} />
            <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-split}px)`, border: '2px solid rgba(0,220,255,0.8)', boxShadow: `inset ${-split * 0.6}px 0 0 rgba(0,220,255,0.25)`, mixBlendMode: 'screen' }} />
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', border: '1.5px solid rgba(6,182,212,0.8)', background: '#000' }}>
              <div style={{ position: 'absolute', left: mw / 2 - c.cx * c.s, top: mh / 2 - c.cy * c.s, transform: `scale(${c.s})`, transformOrigin: '0 0', filter: 'saturate(0.55) contrast(1.2) brightness(0.9)' }}>
                <LegacyAdmin errorOn={c.error ? 1 : 0} dialogOn={c.dialog ? 1 : 0} />
              </div>
              {/* 扫描线纹理 */}
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 1px, transparent 1px, transparent 3px)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(6,182,212,0.08), rgba(6,182,212,0))' }} />
            </div>
            <div style={{ position: 'absolute', left: 0, top: -34, fontFamily: FONT.mono, fontSize: 17, letterSpacing: '0.14em', color: C.cyan }}>
              <span style={{ color: '#ff3b30' }}>●</span> {labels[i]}
            </div>
            <div style={{ position: 'absolute', right: 0, top: -34, fontFamily: FONT.mono, fontSize: 17, color: 'rgba(255,59,48,0.9)' }}>
              {i === 0 ? 'ZOOM ×3.4' : i === 1 ? 'ERR 0x1F' : 'TIMEOUT'}
            </div>
          </div>
        );
      })}
      {/* 坍缩冲击环 */}
      {t > COLLAPSE1 && (
        <div
          style={{
            position: 'absolute',
            left: W / 2,
            top: H / 2,
            width: 10 + 2600 * ramp(t, COLLAPSE1, 0.45, EASE.out),
            height: 10 + 2600 * ramp(t, COLLAPSE1, 0.45, EASE.out),
            transform: 'translate(-50%,-50%)',
            borderRadius: '50%',
            border: `2px solid rgba(160,240,255,0.95)`,
            boxShadow: '0 0 24px rgba(6,182,212,0.8), inset 0 0 24px rgba(6,182,212,0.5)',
            opacity: 1 - ramp(t, COLLAPSE1, 0.45, EASE.linear),
          }}
        />
      )}
    </Abs>
  );
};

/* 字形测量（字体已断言加载；canvas 测量确定性） */
const useWordLayout = (word: string, fs: number, W: number) =>
  useMemo(() => {
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d')!;
    ctx.font = `900 ${fs}px "Noto Sans SC"`;
    const ls = -0.012 * fs;
    const widths = [...word].map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + ls * (word.length - 1);
    const xs: number[] = [];
    let x = (W - total) / 2;
    for (let i = 0; i < word.length; i++) {
      xs.push(x);
      x += widths[i] + ls;
    }
    const mO = ctx.measureText('O');
    const asc = mO.actualBoundingBoxAscent;
    const lb = mO.actualBoundingBoxLeft;
    const rb = mO.actualBoundingBoxRight;
    return { xs, widths, total, asc, oCx: xs[0] + (rb - lb) / 2, oW: rb + lb };
  }, [word, fs, W]);

/* text-as-mask 世界：极光 + 漂移的真实界面 */
const MaskWorld: React.FC<{ t: number }> = ({ t }) => {
  const { W, H, vertical } = useV();
  const drift = mix(160, -160, ramp(t, WORD0, RUSH0 - WORD0 + 1, EASE.smooth));
  const fade = 1 - ramp(t, RUSH0 - 0.1, 0.6, EASE.swift);
  const shots = ['main', 'dev', 'traf', 'main-dark', 'wd', 'proxy']; // 真实面板截图（shots/real）
  const pw = vertical ? 230 : 300;
  return (
    <Abs style={{ inset: 0 }}>
      <AuroraBG intensity={1.35} />
      <Abs style={{ left: 0, top: 0, width: W, height: H, transform: `translateX(${drift}px)`, opacity: fade }}>
        {shots.map((s, i) => {
          const x = W / 2 + (i - 2.5) * (pw + 40) - pw / 2;
          const y = H / 2 - pw * (i % 2 ? 0.98 : 1.24);
          return (
            <div key={s} style={{ position: 'absolute', left: x, top: y, width: pw, height: pw * (852 / 393), borderRadius: 34, overflow: 'hidden', boxShadow: '0 30px 60px rgba(0,0,0,0.5)', opacity: 0.92 }}>
              <Img src={staticFile(`shots/real/${s}.png`)} style={{ width: '100%', height: '100%' }} />
            </div>
          );
        })}
      </Abs>
      <Abs style={{ inset: 0, background: 'linear-gradient(120deg, rgba(37,99,235,0.18), rgba(124,58,237,0.12) 50%, rgba(6,182,212,0.12))', mixBlendMode: 'screen' }} />
    </Abs>
  );
};

const TextMask: React.FC<{ t: number }> = ({ t }) => {
  const { W, H, vertical } = useV();
  const word = 'OPENWRT';
  const fs = vertical ? Math.round(W * 0.172) : 326;
  const L = useWordLayout(word, fs, W);
  const base = vertical ? H * 0.5 + fs * 0.36 : 648;
  const oCy = base - L.asc / 2;
  // 入场：遮罩自基线向上擦出 + 1.04→1 落定
  const wipe = ramp(t, WORD0 + 0.02, 0.5, EASE.out);
  const introS = 1.04 - 0.04 * ramp(t, WORD0, 0.7, EASE.snappy);
  // 预备吸气 → 对数空间加速冲入 O 的几何中心
  const breath = ramp(t, RUSH0 - 0.2, 0.2, EASE.swift);
  const u = Math.pow(ramp(t, RUSH0, RUSH1 - RUSH0, EASE.linear), 1.9);
  const S0 = introS * (1 - 0.03 * breath);
  const S = S0 * Math.pow(70 / S0, u);
  const cdx = (W / 2 - L.oCx) * Math.min(1, u * 1.6);
  const cdy = (H / 2 - oCy) * Math.min(1, u * 1.6);
  // 门洞：O 的内孔开成一扇透光的门
  const counterR = L.oW * 0.24;
  const portal = ramp(t, PORTAL0, 0.75, EASE.snappy);
  const capTop = base - L.asc;
  const clipY = mix(base + 20, capTop - 40, wipe);
  const lines = 1 - ramp(t, RUSH0 - 0.15, 0.3, EASE.exit);
  return (
    <Abs style={{ inset: 0 }}>
      <MaskWorld t={t} />
      <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <defs>
          <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="16" cy="16" r="1.3" fill="rgba(255,255,255,0.07)" />
          </pattern>
          <radialGradient id="stagelight" cx="50%" cy="45%" r="70%">
            <stop offset="0" stopColor="#0b1220" />
            <stop offset="1" stopColor={C.hud} />
          </radialGradient>
          <clipPath id="wipe">
            <rect x={-W} y={clipY} width={W * 3} height={H * 2} />
          </clipPath>
          <mask id="cut" maskUnits="userSpaceOnUse" x={-W * 40} y={-H * 40} width={W * 81} height={H * 81}>
            <rect x={-W * 40} y={-H * 40} width={W * 81} height={H * 81} fill="white" />
            <g clipPath="url(#wipe)">
              {[...word].map((ch, i) => (
                <text key={i} x={L.xs[i]} y={base} fontFamily="Noto Sans SC" fontWeight={900} fontSize={fs} fill="black">
                  {ch}
                </text>
              ))}
            </g>
            {portal > 0 && <ellipse cx={L.oCx} cy={oCy} rx={counterR * 1.02 * portal} ry={L.asc * 0.3 * portal} fill="black" />}
          </mask>
        </defs>
        <g transform={`translate(${cdx} ${cdy}) translate(${L.oCx} ${oCy}) scale(${S}) translate(${-L.oCx} ${-oCy})`}>
          <g mask="url(#cut)">
            <rect x={-W * 40} y={-H * 40} width={W * 81} height={H * 81} fill="url(#stagelight)" />
            <rect x={-W * 40} y={-H * 40} width={W * 81} height={H * 81} fill="url(#dots)" />
          </g>
          {/* 字缘冷光 */}
          <g clipPath="url(#wipe)" opacity={0.55 * (1 - u)}>
            {[...word].map((ch, i) => (
              <text key={i} x={L.xs[i]} y={base} fontFamily="Noto Sans SC" fontWeight={900} fontSize={fs} fill="none" stroke="rgba(150,220,255,0.55)" strokeWidth={1.4}>
                {ch}
              </text>
            ))}
          </g>
        </g>
      </svg>
      {/* 屏幕大字 */}
      <Abs style={{ left: 0, right: 0, top: vertical ? H * 0.26 : 214, textAlign: 'center', opacity: ramp(t, WORD0 + 0.5, 0.6, EASE.out) * lines, transform: `translateY(${(1 - ramp(t, WORD0 + 0.5, 0.6, EASE.out)) * 12}px)` }}>
        <div style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: vertical ? 40 : 46, letterSpacing: '0.16em', color: C.text }}>
          告别指尖缩放<span style={{ color: C.cyan, margin: '0 0.5em' }}>·</span>告别公网束缚
        </div>
      </Abs>
      <Abs style={{ left: 0, right: 0, top: vertical ? H * 0.66 : 712, textAlign: 'center', opacity: ramp(t, 9.0, 0.6, EASE.out) * lines, transform: `translateY(${(1 - ramp(t, 9.0, 0.6, EASE.out)) * 12}px)` }}>
        <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: vertical ? 52 : 60, letterSpacing: '0.08em', color: C.text }}>OpenWrt，换一种管法</div>
      </Abs>
      {/* 冲入时的径向变焦拖影 */}
      {u > 0.25 && <Abs style={{ inset: 0, background: `radial-gradient(circle at 50% 50%, rgba(255,255,255,0) 30%, rgba(160,200,255,${0.25 * Math.sin(Math.PI * u)}) 100%)` }} />}
    </Abs>
  );
};

export const Act1: React.FC = () => {
  const t = useT();
  const { W, H } = useV();
  let body: React.ReactNode;
  let shot = 1;
  if (t < FLASH1) body = <ShotA t={t} />;
  else if (t < FLASH2) {
    shot = 2;
    body = <Crop t={t} at={FLASH1} cx={330} cy={196} s={3.1} error />;
  } else if (t < MON0) {
    shot = 3;
    body = <Crop t={t} at={FLASH2} cx={512} cy={392} s={2.6} error dialog />;
  } else if (t < WORD0) body = <Monitors t={t} />;
  else body = <TextMask t={t} />;

  // 对焦框：闪前 0.28s 收拢到下一张裁切并锁定
  const focus =
    t < FLASH1
      ? { x: W / 2 + 40, y: H / 2 - 40, w: mix(W * 0.7, 520, ramp(t, 0.66, 0.24, EASE.snappy)), h: mix(H * 0.7, 120, ramp(t, 0.66, 0.24, EASE.snappy)), lock: ramp(t, 0.66, 0.26, EASE.linear) }
      : t < FLASH2
        ? { x: W / 2, y: H / 2 + 120, w: mix(W * 0.8, 760, ramp(t, 1.56, 0.24, EASE.snappy)), h: mix(H * 0.6, 300, ramp(t, 1.56, 0.24, EASE.snappy)), lock: ramp(t, 1.56, 0.26, EASE.linear) }
        : undefined;

  const flash = Math.max(flashEnv(t, 0.15, 0.06) * 0.35, flashEnv(t, FLASH1), flashEnv(t, FLASH2), flashEnv(t, MON0, 0.08) * 0.6, flashEnv(t, COLLAPSE1, 0.08, 0.05), flashEnv(t, WORD0, 0.1, 0.05) * 0.5);
  return (
    <Abs style={{ inset: 0, overflow: 'hidden', background: C.hud }}>
      {body}
      {t < MON0 && <Viewfinder t={t} shot={shot} focus={focus} />}
      <Abs style={{ inset: 0, background: '#fff', opacity: flash }} />
      {t < 0.15 && (
        <>
          <Abs style={{ inset: 0, background: C.ink0, clipPath: `inset(0 0 0 ${(t / 0.15) * 100}%)` }} />
          <Abs style={{ top: 0, bottom: 0, left: `calc(${(t / 0.15) * 100}% - 3px)`, width: 6, background: '#F5FAFF', boxShadow: '0 0 30px 10px rgba(220,240,255,0.95), 0 0 90px 30px rgba(160,210,255,0.55)' }} />
        </>
      )}
      <Grain opacity={0.1} />
    </Abs>
  );
};
