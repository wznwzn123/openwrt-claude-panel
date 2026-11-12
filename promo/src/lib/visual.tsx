import React from 'react';
import { Img, staticFile, useVideoConfig } from 'remotion';
import { C, EASE, FONT, hash, ramp, useT } from './core';

/* ───────────── 10 · Aurora & Glassmorphism 主视觉基底 ───────────── */
export const AuroraBG: React.FC<{ amber?: number; intensity?: number; t?: number }> = ({
  amber = 0,
  intensity = 1,
  t: tOverride,
}) => {
  const tt = useT();
  const t = tOverride ?? tt;
  const { width: W, height: H } = useVideoConfig();
  // 三团低饱和高透光光晕：正弦双周期游走（周期 23s / 37s 叠加），确定性
  const blob = (px: number, py: number, ax: number, ay: number, p1: number, p2: number, ph: number) => {
    const x = px + ax * Math.sin((2 * Math.PI * t) / p1 + ph) + ax * 0.4 * Math.sin((2 * Math.PI * t) / p2 + ph * 1.7);
    const y = py + ay * Math.cos((2 * Math.PI * t) / p1 + ph * 0.6) + ay * 0.35 * Math.sin((2 * Math.PI * t) / p2 + ph);
    return [x * 100, y * 100] as const;
  };
  const [bx, by] = blob(0.24, 0.3, 0.1, 0.08, 23, 37, 0.3);
  const [vx, vy] = blob(0.78, 0.68, 0.09, 0.09, 29, 41, 2.1);
  const [ax2, ay2] = blob(0.62, 0.22, 0.08, 0.06, 19, 31, 4.2);
  const k = intensity;
  const layers = [
    `radial-gradient(ellipse 46% 52% at ${bx}% ${by}%, rgba(37,99,235,${0.74 * k}) 0%, rgba(37,99,235,${0.27 * k}) 40%, rgba(37,99,235,0) 72%)`,
    `radial-gradient(ellipse 44% 50% at ${vx}% ${vy}%, rgba(124,58,237,${0.65 * k}) 0%, rgba(124,58,237,${0.23 * k}) 42%, rgba(124,58,237,0) 74%)`,
    `radial-gradient(ellipse 38% 40% at ${ax2}% ${ay2}%, rgba(217,119,87,${0.42 * amber * k}) 0%, rgba(217,119,87,${0.14 * amber * k}) 42%, rgba(217,119,87,0) 76%)`,
    `radial-gradient(ellipse 30% 30% at ${100 - bx * 0.6}% ${18 + by * 0.2}%, rgba(6,182,212,${0.16 * k}) 0%, rgba(6,182,212,0) 70%)`,
    `radial-gradient(ellipse 120% 100% at 50% 40%, ${C.ink1} 0%, ${C.ink0} 78%)`,
  ];
  return <div style={{ position: 'absolute', width: W, height: H, background: layers.join(',') }} />;
};

/* 10% 电影微粒噪点（确定性逐帧换 tile 与偏移） */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.1 }) => {
  const t = useT();
  const { fps } = useVideoConfig();
  const f = Math.round(t * fps);
  const n = Math.floor(hash(f) * 4);
  const ox = Math.floor(hash(f + 13) * 256);
  const oy = Math.floor(hash(f + 71) * 256);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `url(${staticFile(`shots/grain${n}.png`)})`,
        backgroundPosition: `${ox}px ${oy}px`,
        backgroundSize: '256px 256px',
        mixBlendMode: 'overlay',
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.55 }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: `radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,${strength}) 100%)`,
      pointerEvents: 'none',
    }}
  />
);

/* ───────────── 08 · Cyberpunk HUD / FUI 硬核工程基底 ───────────── */
export const HudBG: React.FC<{ scan?: boolean; tint?: string; chrome?: boolean }> = ({ scan = true, tint = C.cyan, chrome = true }) => {
  const t = useT();
  const { width: W, height: H } = useVideoConfig();
  const sy = ((t * 0.22) % 1) * (H + 200) - 100;
  return (
    <div style={{ position: 'absolute', width: W, height: H, background: C.hud, overflow: 'hidden' }}>
      {/* 32px 工程微点阵 7% */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.07) 1.3px, transparent 1.6px)',
          backgroundSize: '32px 32px',
          backgroundPosition: '16px 16px',
        }}
      />
      {/* 大网格 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(rgba(6,182,212,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.05) 1px, transparent 1px)`,
          backgroundSize: '256px 256px',
          backgroundPosition: '-32px -32px',
        }}
      />
      {/* 冷青雷达扫描线 */}
      {scan && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: sy,
            height: 140,
            background: `linear-gradient(180deg, rgba(6,182,212,0) 0%, rgba(6,182,212,0.06) 80%, rgba(6,182,212,0.28) 99%, ${tint} 100%)`,
            opacity: 0.55,
          }}
        />
      )}
      {/* 六边形网格 */}
      <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, opacity: 0.06 }}>
        <defs>
          <pattern id="hex" width="56" height="97" patternUnits="userSpaceOnUse">
            <path d="M28 0 L56 16 L56 48 L28 64 L0 48 L0 16 Z M28 64 L28 97" fill="none" stroke="#06B6D4" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#hex)" />
      </svg>
      {chrome && <HudRadar />}
      {chrome && <HudDataColumn />}
      {chrome && <HudTicks />}
      <Vignette strength={0.7} />
    </div>
  );
};

/* 雷达扫描环：conic 扇区旋转 + 目标点闪烁 */
export const HudRadar: React.FC = () => {
  const t = useT();
  const { width: W, height: H } = useVideoConfig();
  const R = Math.min(W, H) * 0.11;
  const ang = (t * 180) % 360; // 2s 一圈
  return (
    <div style={{ position: 'absolute', right: 96, bottom: 110, width: R * 2, height: R * 2 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(from ${ang}deg, rgba(6,182,212,0.42) 0deg, rgba(6,182,212,0) 70deg, rgba(6,182,212,0) 360deg)` }} />
      {[1, 0.66, 0.33].map((k) => (
        <div key={k} style={{ position: 'absolute', left: R * (1 - k), top: R * (1 - k), width: R * 2 * k, height: R * 2 * k, borderRadius: '50%', border: '1px solid rgba(6,182,212,0.4)' }} />
      ))}
      <div style={{ position: 'absolute', left: R, top: 0, width: 1, height: R * 2, background: 'rgba(6,182,212,0.25)' }} />
      <div style={{ position: 'absolute', top: R, left: 0, height: 1, width: R * 2, background: 'rgba(6,182,212,0.25)' }} />
      {[[0.55, 0.3, 40], [0.25, 0.62, 200], [0.7, 0.72, 300]].map(([x, y, a], i) => {
        const d = ((ang - a + 360) % 360) / 360;
        return <div key={i} style={{ position: 'absolute', left: R * 2 * x - 4, top: R * 2 * y - 4, width: 8, height: 8, borderRadius: 4, background: i === 1 ? '#FF6A3D' : C.cyan, boxShadow: `0 0 10px ${i === 1 ? '#FF6A3D' : C.cyan}`, opacity: Math.max(0.15, 1 - d * 2.5) }} />;
      })}
      <div style={{ position: 'absolute', left: 0, right: 0, top: R * 2 + 8, textAlign: 'center', fontFamily: FONT.mono, fontSize: 13, letterSpacing: '0.2em', color: 'rgba(6,182,212,0.7)' }}>WAN · SCAN</div>
    </div>
  );
};

/* 等宽数据列：随机数快速跳变 4 帧后落定 */
export const HudDataColumn: React.FC = () => {
  const t = useT();
  const { fps } = useVideoConfig();
  const f = Math.round(t * fps);
  const step = Math.max(1, Math.round(fps / 15));
  const rows = Array.from({ length: 9 }, (_, i) => {
    const epoch = Math.floor((f + i * 7) / (fps * 1.2));
    const local = (f + i * 7) - epoch * fps * 1.2;
    const settled = local > step * 4;
    const v = settled ? hash(epoch * 13 + i) : hash(Math.floor(f / step) * 31 + i);
    return `${['RTT', 'PKT', 'NAT', 'TTL', 'MTU', 'SYN', 'DNS', 'ARP', 'CPU'][i]} ${(v * 999).toFixed(1).padStart(6, '0')}`;
  });
  return (
    <div style={{ position: 'absolute', left: 96, top: 120, fontFamily: FONT.mono, fontSize: 14, lineHeight: 1.7, color: 'rgba(6,182,212,0.55)', letterSpacing: '0.08em' }}>
      {rows.map((r) => (
        <div key={r}>{r}</div>
      ))}
    </div>
  );
};

/* 四周动态遥测刻度 */
export const HudTicks: React.FC = () => {
  const t = useT();
  const { width: W, height: H } = useVideoConfig();
  const ticks = [];
  const off = (t * 40) % 24;
  for (let x = -24; x < W + 24; x += 24) {
    const big = Math.round((x + 24) / 24) % 5 === 0;
    ticks.push(<div key={'t' + x} style={{ position: 'absolute', left: x + off, top: 22, width: 1, height: big ? 12 : 6, background: 'rgba(6,182,212,0.35)' }} />);
    ticks.push(<div key={'b' + x} style={{ position: 'absolute', left: x - off, bottom: 22, width: 1, height: big ? 12 : 6, background: 'rgba(6,182,212,0.35)' }} />);
  }
  return (
    <>
      {ticks}
      <div style={{ position: 'absolute', left: 96, top: 60, fontFamily: FONT.mono, fontSize: 15, letterSpacing: '0.18em', color: 'rgba(6,182,212,0.7)' }}>
        SYS.TELEMETRY · T+{t.toFixed(2).padStart(5, '0')}s
      </div>
      <div style={{ position: 'absolute', right: 96, top: 60, fontFamily: FONT.mono, fontSize: 15, letterSpacing: '0.18em', color: 'rgba(6,182,212,0.7)' }}>
        RX {(46 + 14 * Math.sin(t * 3.1)).toFixed(1)} · TX {(8 + 3 * Math.sin(t * 2.3 + 1)).toFixed(1)} MB/s
      </div>
    </>
  );
};

/* ───────────── 高端磨砂玻璃 ───────────── */
export const glass = (radius = 28, fill = 0.08): React.CSSProperties => ({
  borderRadius: radius,
  // 通透玻璃：白 0.08 底 + 左上镜面高光（不再是深色卡）
  background: `linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 38%, rgba(255,255,255,0) 60%), rgba(255,255,255,${Math.max(0.08, fill)})`,
  backdropFilter: 'blur(28px) saturate(165%)',
  WebkitBackdropFilter: 'blur(28px) saturate(165%)',
  boxShadow:
    'inset 0 1.5px 0 rgba(255,255,255,0.42), inset 1px 0 0 rgba(255,255,255,0.12), inset 0 0 0 1px rgba(255,255,255,0.14), inset 0 -1px 0 rgba(255,255,255,0.05), 0 30px 80px rgba(2,6,23,0.45), 0 8px 24px rgba(2,6,23,0.3)',
  boxSizing: 'border-box',
});

export const Glass: React.FC<{ style?: React.CSSProperties; radius?: number; fill?: number; children?: React.ReactNode }> = ({
  style,
  radius = 28,
  fill = 0.07,
  children,
}) => <div style={{ position: 'absolute', ...glass(radius, fill), ...style }}>{children}</div>;

/* ───────────── 2.5D 真机：iPhone 16 Pro 级超窄钛金属旗舰外观（CSS 3D + 物理接触投影） ───────────── */
export const PHONE_BEZEL = 0.02; // 屏幕到外框的黑边（相对屏宽），旧版 0.04 减半
/** 屏幕高宽比：与真实面板截图视口 393×852（iPhone 6.1 寸）一致，内容不再被裁切 */
export const PHONE_ASPECT = 852 / 393;
/** 顶部状态栏安全区（截图里 --sat=54px 留出的空白，由 Phone 叠画时间/信号/电量） */
export const PHONE_SAT = 54 / 393;
/** 手机整体外框尺寸（含黑边），布局/定位框统一从这里取 */
export const phoneBox = (sw: number) => ({ pw: sw * (1 + 2 * PHONE_BEZEL), ph: sw * (PHONE_ASPECT + 2 * PHONE_BEZEL), bez: sw * PHONE_BEZEL, sh: sw * PHONE_ASPECT });

/* 状态栏图标（SVG，不用文字字形） */
const StatusIcons: React.FC<{ s: number; c: string }> = ({ s, c }) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: s * 0.32 }}>
    <svg width={s * 1.05} height={s * 0.7} viewBox="0 0 18 12" style={{ display: 'block' }}>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={i * 4.8} y={9 - i * 3} width={3.2} height={3 + i * 3} rx={0.9} fill={c} />
      ))}
    </svg>
    <svg width={s * 0.98} height={s * 0.7} viewBox="0 0 17 12" style={{ display: 'block' }}>
      <path d="M8.5 2.2c2.5 0 4.8 1 6.5 2.6l1.2-1.3A11 11 0 0 0 8.5.4 11 11 0 0 0 .8 3.5L2 4.8a9.3 9.3 0 0 1 6.5-2.6z" fill={c} />
      <path d="M8.5 5.9c1.5 0 2.9.6 3.9 1.5l1.2-1.3a7.3 7.3 0 0 0-10.2 0l1.2 1.3c1-.9 2.4-1.5 3.9-1.5z" fill={c} />
      <path d="M8.5 9.4c.6 0 1.1.2 1.5.6L8.5 11.6 7 10c.4-.4.9-.6 1.5-.6z" fill={c} />
    </svg>
    <svg width={s * 1.55} height={s * 0.72} viewBox="0 0 27 12.5" style={{ display: 'block' }}>
      <rect x="0.6" y="0.6" width="22.6" height="11.3" rx="3.4" fill="none" stroke={c} strokeOpacity={0.4} strokeWidth={1.1} />
      <rect x="2.3" y="2.3" width="15.6" height="7.9" rx="2" fill={c} />
      <path d="M24.6 4.3v3.9c.9-.3 1.5-1.1 1.5-1.95s-.6-1.65-1.5-1.95z" fill={c} fillOpacity={0.45} />
    </svg>
  </span>
);

export const Phone: React.FC<{
  w?: number; // 屏幕宽（px）
  src?: string;
  children?: React.ReactNode;
  glare?: number; // 0..1 扫光位置
  shadow?: boolean;
  dark?: boolean; // 深色界面：状态栏用白字
  full?: boolean; // 子内容铺满整屏（真实截图，已含状态栏安全区）；否则从状态栏下方开始
  topBg?: string; // 非 full 内容时状态栏区域的底色（与界面顶部同色，透明状态栏观感）
  depth?: boolean; // 机身厚度层（3D 旋转时露出侧边中框）
}> = ({ w = 380, src, children, glare = -1, shadow = true, dark = false, full, topBg, depth = true }) => {
  const h = w * PHONE_ASPECT;
  const bez = w * PHONE_BEZEL;
  const r = w * 0.15;
  const rim = Math.max(1.5, w * 0.004); // 钛金属中框描边
  const sat = w * PHONE_SAT;
  const isFull = full ?? !!src;
  const ink = dark ? '#fff' : '#0b0b0f';
  const T = w * 0.105; // 机身厚度（iPhone ≈ 8.3mm / 71.6mm）
  const LAYERS = 7;
  return (
    <div style={{ position: 'relative', width: w + bez * 2, height: h + bez * 2, transformStyle: 'preserve-3d' }}>
      {shadow && (
        <div
          style={{
            position: 'absolute',
            left: '10%',
            right: '10%',
            bottom: -w * 0.14,
            height: w * 0.14,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 70%)',
            transform: `translateZ(${-T - 30}px)`,
            filter: 'blur(6px)',
          }}
        />
      )}
      {/* 机身厚度：多层钛金属侧框沿 Z 轴向后堆叠，侧转时露出中框 */}
      {depth &&
        Array.from({ length: LAYERS }, (_, i) => {
          const k = (i + 1) / LAYERS;
          const l = Math.round(150 - 70 * k);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                inset: -rim,
                borderRadius: r + bez + rim,
                background: `linear-gradient(90deg, rgb(${l - 18},${l - 10},${l}) 0%, rgb(${l + 40},${l + 46},${l + 56}) 50%, rgb(${l - 24},${l - 16},${l - 6}) 100%)`,
                transform: `translateZ(${-T * k}px)`,
                boxShadow: i === LAYERS - 1 ? '0 30px 80px rgba(2,6,23,0.45)' : undefined,
              }}
            />
          );
        })}
      {/* 外圈钛金属拉丝中框：浅银灰 → 深枪灰，侧边受光的微弱外发光 + 多层柔光环境投影 */}
      <div
        style={{
          position: 'absolute',
          inset: -rim,
          borderRadius: r + bez + rim,
          background: 'linear-gradient(135deg, #CBD5E1 0%, #94A3B8 18%, #64748B 42%, #334155 62%, #94A3B8 82%, #475569 100%)',
          boxShadow: [
            '0 0 0 0.5px rgba(255,255,255,0.18)',
            '-1px 0 6px rgba(203,213,225,0.18)',
            '0 2px 4px rgba(0,0,0,0.22)',
            '0 12px 24px rgba(2,6,23,0.28)',
            '0 36px 72px rgba(2,6,23,0.34)',
          ].join(', '),
        }}
      />
      {/* 拉丝纹理（极细横纹） */}
      <div style={{ position: 'absolute', inset: -rim, borderRadius: r + bez + rim, backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 3px)', mixBlendMode: 'overlay' }} />
      {/* 极窄黑边 */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: r + bez, background: '#05060A', boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.10)' }} />
      <div
        style={{
          position: 'absolute',
          left: bez,
          top: bez,
          width: w,
          height: h,
          borderRadius: r,
          overflow: 'hidden',
          background: topBg ?? (dark ? '#0b0c10' : '#E8ECF7'),
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: isFull ? 0 : sat, width: w, height: isFull ? h : h - sat, overflow: 'hidden' }}>
          {src && <Img src={staticFile(src)} style={{ width: w, height: h, display: 'block' }} />}
          {children}
        </div>
        {/* 透明状态栏：时间 + SVG 信号/Wi-Fi/电量，与灵动岛同一水平线 */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: sat * 0.98, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${w * 0.006}px ${w * 0.078}px 0 ${w * 0.1}px`, boxSizing: 'border-box', fontFamily: FONT.sans, fontWeight: 650, fontSize: w * 0.043, letterSpacing: -0.2, color: ink }}>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>21:46</span>
          <StatusIcons s={w * 0.042} c={ink} />
        </div>
        {/* 底部 Home Indicator：贴底、细，不压导航 */}
        <div style={{ position: 'absolute', left: '50%', bottom: w * 0.017, width: w * 0.34, height: Math.max(3, w * 0.0115), marginLeft: -w * 0.17, borderRadius: 99, background: dark ? 'rgba(255,255,255,0.78)' : 'rgba(10,10,15,0.78)' }} />
        {/* 玻璃屏幕：极淡斜向镜面反光 */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 45%)', pointerEvents: 'none' }} />
        {glare >= 0 && glare <= 1 && (
          <div
            style={{
              position: 'absolute',
              top: -h * 0.2,
              left: -w + glare * (w * 3),
              width: w * 0.45,
              height: h * 1.4,
              transform: 'rotate(18deg)',
              background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0) 100%)',
            }}
          />
        )}
      </div>
      {/* 纤细紧凑的灵动岛（与状态栏文字垂直居中对齐） */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: bez + sat * 0.5 - w * 0.033,
          width: w * 0.24,
          height: w * 0.066,
          marginLeft: -w * 0.12,
          borderRadius: 99,
          background: '#000',
          boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.06)',
        }}
      />
    </div>
  );
};

/* ───────────── 品牌徽标（来自仓库 src/www/panel/icon.svg，可拆件用于 input-morph-assemble） ───────────── */
export const BrandMark: React.FC<{
  size: number;
  arc1?: number; // 0..1 外弧出现
  arc2?: number; // 内弧
  body?: number; // 路由机身
  plate?: number; // 底板
  slots?: number; // 构造虚线槽
  id?: string;
}> = ({ size, arc1 = 1, arc2 = 1, body = 1, plate = 1, slots = 0, id = 'bm' }) => {
  const drop = (k: number, dy: number) => `translate(0 ${(1 - k) * -dy})`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6a4dff" />
          <stop offset=".5" stopColor="#2f6bff" />
          <stop offset="1" stopColor="#00c2d8" />
        </linearGradient>
        <radialGradient id={`${id}p`} cx=".88" cy=".08" r=".8">
          <stop offset="0" stopColor="#ff5fb4" stopOpacity=".75" />
          <stop offset=".7" stopColor="#ff5fb4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}w`} cx=".3" cy="0" r=".7">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".7" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g opacity={plate}>
        <rect width="32" height="32" rx="8.9" fill={`url(#${id}g)`} />
        <rect width="32" height="32" rx="8.9" fill={`url(#${id}p)`} />
        <rect width="32" height="32" rx="8.9" fill={`url(#${id}w)`} />
      </g>
      {slots > 0 && (
        <g opacity={slots} fill="none" stroke="#9cc3ff" strokeWidth="0.35" strokeDasharray="0.9 0.7">
          <path d="M8.4 9.8a10.8 10.8 0 0 1 15.2 0" />
          <path d="M11.2 12.6a6.8 6.8 0 0 1 9.6 0" />
          <rect x="7.5" y="16" width="17" height="7.5" rx="2.4" />
        </g>
      )}
      <g transform={drop(body, 26)} opacity={Math.min(1, body * 3)}>
        <rect x="7.5" y="16" width="17" height="7.5" rx="2.4" fill="#fff" />
        <circle cx="11.4" cy="19.75" r="1.1" fill="#2f6bff" />
        <circle cx="14.6" cy="19.75" r="1.1" fill="#2f6bff" />
        <path d="M18 19.75h3.4" stroke="#2f6bff" strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <g transform={drop(arc2, 22)} opacity={Math.min(1, arc2 * 3)}>
        <path d="M11.2 12.6a6.8 6.8 0 0 1 9.6 0" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
      </g>
      <g transform={drop(arc1, 18)} opacity={Math.min(1, arc1 * 3)}>
        <path d="M8.4 9.8a10.8 10.8 0 0 1 15.2 0" stroke="#fff" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
};

/* ───────────── 光标（手指触点） ───────────── */
export const Tap: React.FC<{ x: number; y: number; press?: number; opacity?: number; ring?: number }> = ({
  x,
  y,
  press = 0,
  opacity = 1,
  ring = 0,
}) => (
  <div style={{ position: 'absolute', left: x - 22, top: y - 22, width: 44, height: 44, opacity, pointerEvents: 'none' }}>
    {ring > 0 && ring < 1 && (
      <div
        style={{
          position: 'absolute',
          left: 22 - 40 * ring,
          top: 22 - 40 * ring,
          width: 80 * ring,
          height: 80 * ring,
          borderRadius: '50%',
          border: `2px solid rgba(255,255,255,${0.8 * (1 - ring)})`,
        }}
      />
    )}
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0.08) 70%)',
        transform: `scale(${1 - 0.25 * press})`,
        boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
      }}
    />
  </div>
);

/* 胶囊 */
export const Pill: React.FC<{ color?: string; bg?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({
  color = C.text,
  bg = 'rgba(255,255,255,0.08)',
  style,
  children,
}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 18px',
      borderRadius: 999,
      background: bg,
      color,
      fontFamily: FONT.sans,
      fontWeight: 600,
      fontSize: 22,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 0 0 1px rgba(255,255,255,0.08)',
      ...style,
    }}
  >
    {children}
  </div>
);

/* 状态点 */
export const Dot: React.FC<{ color: string; size?: number; glow?: boolean }> = ({ color, size = 10, glow = true }) => (
  <span
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      boxShadow: glow ? `0 0 ${size * 1.4}px ${color}` : undefined,
      flex: 'none',
    }}
  />
);

/* 文本入场：opacity + 8~16px 上浮（极光风格只用 opacity+位移） */
export const Rise: React.FC<{ t: number; at: number; dur?: number; dy?: number; out?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  t,
  at,
  dur = 0.6,
  dy = 14,
  out,
  children,
  style,
}) => {
  const k = ramp(t, at, dur, EASE.out);
  const o = out !== undefined ? 1 - ramp(t, out, 0.35, EASE.exit) : 1;
  return (
    <div style={{ opacity: k * o, transform: `translateY(${(1 - k) * dy - (1 - o) * 10}px)`, ...style }}>{children}</div>
  );
};
