import React from 'react';
import { useVideoConfig } from 'remotion';
import { Abs, C, EASE, FONT, hash, mix, ramp, springAt, useT, useV } from '../lib/core';
import { AuroraBG, Dot, Glass, Grain, Phone, Pill, Vignette, PHONE_ASPECT, phoneBox } from '../lib/visual';
import { AndroidFlow, DEVICES, DevicesScreen, PluginScreen, PwaFlow, TOGGLE_AT } from '../lib/screens3';
import { Img, staticFile } from 'remotion';

/* 第三幕 · 28–54s · 全能掌中矩阵
 * 配方卡：card-stack → axis-rescale-shock → quad-split-parallel-scenes（16:9 对称分屏变体） */

const A = 28;
const FAN = 29.069; // 116 BPM 拍点
const SEG_B = 40.448;
const SEG_C = 46.138;
const END = 54;

const NAV = [
  { at: A, text: '自动识别六款扩展套件 · 线路挂了自动换' },
  { at: SEG_B, text: '每台设备的流量 · 一键定时断网' },
  { at: SEG_C, text: '添加到主屏幕 · 安卓 App · 多台路由切换' },
];

/* 顶部悬浮毛玻璃胶囊导航条 */
const NavCapsule: React.FC<{ t: number }> = ({ t }) => {
  const { W, vertical } = useV();
  const idx = t < SEG_B ? 0 : t < SEG_C ? 1 : 2;
  const k = ramp(t, NAV[idx].at + 0.1, 0.45, EASE.out);
  const yieldK = (ramp(t, 36.75, 0.3, EASE.smooth) - ramp(t, 40.05, 0.3, EASE.smooth)) + (ramp(t, 43.95, 0.3, EASE.smooth) - ramp(t, 45.4, 0.3, EASE.smooth));
  const inK = ramp(t, A + 0.2, 0.5, EASE.out) * (1 - Math.min(1, Math.max(0, yieldK)));
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: vertical ? 120 : 60, display: 'flex', justifyContent: 'center', opacity: inK }}>
      <Glass radius={999} fill={0.08} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 18, padding: vertical ? '16px 28px' : '16px 34px', maxWidth: W - 80 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: i === idx ? 30 : 10, height: 10, borderRadius: 5, background: i === idx ? C.blue : 'rgba(255,255,255,0.25)', boxShadow: i === idx ? `0 0 12px ${C.blue}` : undefined }} />
          ))}
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: 20, color: C.text3, letterSpacing: '0.1em' }}>0{idx + 1}</div>
        <div style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: vertical ? 30 : 34, color: C.text, letterSpacing: '0.03em', opacity: k, transform: `translateY(${(1 - k) * 8}px)`, whiteSpace: 'nowrap' }}>{NAV[idx].text}</div>
      </Glass>
    </div>
  );
};

/* 2.5D 手机外壳 + 3D 姿态 */
const Pose: React.FC<{ x: number; y: number; sw: number; ry?: number; rz?: number; s?: number; o?: number; z?: number; children: React.ReactNode }> = ({ x, y, sw, ry = 0, rz = 0, s = 1, o = 1, z = 0, children }) => {
  const { pw, ph } = phoneBox(sw);
  return (
    <div style={{ position: 'absolute', left: x - pw / 2, top: y - ph / 2, width: pw, height: ph, perspective: 1600, opacity: o, zIndex: z }}>
      <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: `rotateY(${ry}deg) rotateZ(${rz}deg) scale(${s})`, transformOrigin: '50% 60%' }}>{children}</div>
    </div>
  );
};

/* 流量统计宽屏：axis-rescale-shock（新值冲破天花板 → 坐标轴平滑重标） */
const TrafficPanel: React.FC<{ t: number; x: number; y: number; w: number; h: number; o: number }> = ({ t, x, y, w, h, o }) => {
  const rows = [
    // 与真实面板截图里的演示数据一致（capture/capture.js · DEVS）
    { n: '书房台式机', v: 9.8, c: '#2f6bff' },
    { n: '客厅电视', v: 31.6, c: '#7c3aed' },
    { n: '儿童平板', v: 1.9, c: '#f59e0b' },
    { n: '我的手机', v: 3.5, c: '#06b6d4' },
    { n: '家人的手机', v: 1.6, c: '#10b981' },
  ];
  const grow = ramp(t, 40.7, 0.8, EASE.out);
  const shootStart = 41.58; // 击穿落在 42.00 拍点
  const shoot = ramp(t, shootStart, 0.55, EASE.inQuad); // 越冲越快
  const pierceT = shootStart + 0.42;
  const rescale = ramp(t, 42.26, 0.3, EASE.snappy); // 半拍
  const max = mix(10, 40, rescale);
  const ch = h - 230;
  const cx0 = 120;
  const cw = w - 180;
  const shake = t > pierceT && t < pierceT + 0.25 ? 10 * Math.sin((t - pierceT) * 90) * (1 - (t - pierceT) / 0.25) : 0;
  const ticksOld = [0, 2.5, 5, 7.5, 10];
  const ticksNew = [0, 10, 20, 30, 40];
  const bw = (cw / rows.length) * 0.46;
  return (
    <Glass radius={30} style={{ left: x, top: y, width: w, height: h, opacity: o, transform: `translateY(${shake}px)` }}>
      <div style={{ position: 'absolute', left: 36, top: 30, fontFamily: FONT.sans, fontWeight: 800, fontSize: 34, color: C.text }}>流量统计</div>
      <div style={{ position: 'absolute', left: 36, top: 80, fontFamily: FONT.sans, fontSize: 20, color: C.text2 }}>今日 · 按设备 · 每分钟更新 · 需配合扩展套件</div>
      <div style={{ position: 'absolute', right: 36, top: 36 }}>
        <Pill style={{ fontSize: 20 }}>
          今日合计 <b style={{ fontFamily: FONT.mono }}>{mix(16.8, 48.5, ramp(t, shootStart, 1.2, EASE.out)).toFixed(1)} GB</b>
        </Pill>
      </div>
      <div style={{ position: 'absolute', left: cx0, top: 150, width: cw, height: ch }}>
        {/* 刻度：旧刻度向下飞出 / 新刻度从上滑入 */}
        {ticksOld.map((v, i) => (
          <div key={'o' + i} style={{ position: 'absolute', left: -84, width: 70, textAlign: 'right', top: ch - (v / 10) * ch - 12 + rescale * 120, opacity: 1 - rescale, fontFamily: FONT.mono, fontSize: 18, color: C.text3 }}>{v} GB</div>
        ))}
        {ticksNew.map((v, i) => (
          <div key={'n' + i} style={{ position: 'absolute', left: -84, width: 70, textAlign: 'right', top: ch - (v / 40) * ch - 12 - (1 - rescale) * 120, opacity: rescale, fontFamily: FONT.mono, fontSize: 18, color: C.text3 }}>{v} GB</div>
        ))}
        {Array.from({ length: 4 + Math.round(rescale * 4) }, (_, i) => (
          <div key={'g' + i} style={{ position: 'absolute', left: 0, right: 0, top: (ch * i) / (4 + Math.round(rescale * 4)), height: 1, background: 'rgba(255,255,255,0.07)' }} />
        ))}
        {/* 天花板规线（被击穿处裂开） */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, background: t > pierceT && rescale < 1 ? `linear-gradient(90deg, rgba(255,255,255,0.35) 0 26%, transparent 26% 34%, rgba(255,255,255,0.35) 34%)` : 'rgba(255,255,255,0.35)', opacity: 1 - rescale * 0.6 }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: 'rgba(255,255,255,0.45)' }} />
        {rows.map((r, i) => {
          const isShoot = i === 1;
          const pre = isShoot ? 8.6 : r.v;
          let v = pre * grow;
          if (isShoot) v = mix(pre * grow, r.v, shoot);
          const hpx = Math.min((v / max) * ch, isShoot && rescale < 0.02 ? ch + 90 : 99999);
          const bx = (cw / rows.length) * (i + 0.5) - bw / 2;
          const label = isShoot && rescale > 0.5;
          return (
            <React.Fragment key={r.n}>
              <div style={{ position: 'absolute', left: bx, bottom: 0, width: bw, height: hpx, borderRadius: '12px 12px 4px 4px', background: `linear-gradient(180deg, ${r.c}, ${r.c}55)`, boxShadow: isShoot && shoot > 0 ? `0 0 ${30 * shoot}px ${r.c}` : undefined }} />
              <div style={{ position: 'absolute', left: bx - 30, width: bw + 60, bottom: -44, textAlign: 'center', fontFamily: FONT.sans, fontWeight: 600, fontSize: 20, color: isShoot ? C.text : C.text2 }}>{r.n}</div>
              {label && (
                <div style={{ position: 'absolute', left: bx - 40, width: bw + 80, bottom: hpx + 12, textAlign: 'center', transform: `scale(${ramp(t, 42.5, 0.35, EASE.snappy)})` }}>
                  <Pill bg="rgba(124,58,237,0.5)" style={{ fontSize: 20, fontFamily: FONT.mono }}>31.6 GB · 客厅电视</Pill>
                </div>
              )}
            </React.Fragment>
          );
        })}
        {/* 击穿碎屑 */}
        {t > pierceT && t < pierceT + 0.6 &&
          [0, 1, 2, 3].map((i) => {
            const k = (t - pierceT) / 0.6;
            const bx = (cw / rows.length) * 1.5;
            return <div key={i} style={{ position: 'absolute', left: bx + (i - 1.5) * 40 * k * 3, top: -k * 120 + k * k * 160, width: 14, height: 4, background: 'rgba(255,255,255,0.7)', transform: `rotate(${i * 50 + k * 300}deg)`, opacity: 1 - k }} />;
          })}
      </div>
    </Glass>
  );
};

// 旁白后段前移对齐：第三幕后半句旁白紧接前半句（35.11s），34.5s 之后的画面事件整体提前 4 拍（2.069s，仍在拍点网格上）
export const SHIFT3 = 2.069;
const smooth01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export const Act3: React.FC = () => {
  const tr = useT();
  // 34.0–34.5s 是扇面静置段，在其中平滑追帧，之后全部事件按新旁白时刻运行
  const t = tr + SHIFT3 * smooth01((tr - 34.0) / 0.5);
  const { fps } = useVideoConfig();
  const { W, H, vertical } = useV();
  const cx = W / 2;
  const cy = vertical ? H * 0.5 : H * 0.53;

  /* ── 段 A：card-stack 三联扇形矩阵 ── */
  const fan = springAt(t, FAN, fps, { damping: 20, stiffness: 150, mass: 1 });
  const prep = ramp(t, FAN - 0.15, 0.15, EASE.swift) * (1 - fan);
  const swA = vertical ? 470 : 338; // 竖屏只留主机、近满宽（审片 B12）；横屏主机放大 1.08 后仍留出底部安全边与字幕区
  const spread = vertical ? 300 : 450;
  const enter = (i: number) => springAt(t, A + 0.05 + i * 0.16, fps, { damping: 14, stiffness: 200, mass: 0.85 });
  const stackPress = [0, 1, 2].reduce((acc, i) => acc + Math.max(0, Math.sin(Math.PI * ramp(t, A + 0.25 + i * 0.16, 0.18, EASE.linear))) * 5, 0);
  const breathA = 1 + 0.038 * ramp(t, A, SEG_B - A, EASE.linear);
  const pushA = 1 + 0.3 * (ramp(t, 36.85, 0.45, EASE.smooth) - ramp(t, 39.95, 0.45, EASE.smooth));
  const swB = vertical ? 278 : 316;
  const pxB = vertical ? W / 2 : W * 0.24;
  const pyB = vertical ? H * 0.3 : cy;
  const pushB = 1 + (vertical ? 0.3 : 0.45) * (ramp(t, 44.05, 0.4, EASE.smooth) - ramp(t, 45.3, 0.4, EASE.smooth));
  const togX = pxB + ((313 - 180) / 360) * swB * (vertical ? 0.82 : 1);
  const togY = pyB + (-swB + (436 / 360) * swB) * (vertical ? 0.82 : 1);

  /* ── 转场①（原 40.45s）：100% 不透明磨砂卡片自右向左推入（translateX 100% → 0），旧画面视差左移，零叠影 ── */
  const pushIn = ramp(t, SEG_B, 0.5, EASE.smooth);
  const panelK = springAt(t, SEG_B + 0.35, fps);
  /* ── 转场②（原 46.2s）：卡片自中心向两侧对称滑开（split-reveal），露出下层分屏，旧层 0.5s 内完全出画 ── */
  const split = ramp(t, SEG_C, 0.5, EASE.smooth);
  const endOut = ramp(tr, END - 0.45, 0.45, EASE.exit);

  const segBContent = (
    <>
      <AuroraBG t={tr} />
      <Abs style={{ inset: 0, background: 'linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 45%, rgba(255,255,255,0.05))', boxShadow: 'inset 1.5px 0 0 rgba(255,255,255,0.35)' }} />
      <Abs style={{ inset: 0, transform: `scale(${pushB})`, transformOrigin: `${togX}px ${togY}px` }}>
        <Abs style={{ inset: 0, transform: `scale(${1 + 0.03 * ramp(t, SEG_B, SEG_C - SEG_B, EASE.linear)})` }}>
          <TrafficPanel t={t} x={vertical ? 60 : W * 0.43 + (1 - panelK) * 160} y={vertical ? H * 0.52 : 210} w={vertical ? W - 120 : W * 0.5} h={vertical ? 540 : 690} o={1} />
        </Abs>
        <Pose x={pxB} y={pyB} sw={swB} s={vertical ? 0.82 : 1} ry={8 + 2 * Math.sin(t * 0.6)}>
          <Phone w={swB} full>
            <DevicesScreen t={t} w={swB} />
          </Phone>
        </Pose>
      </Abs>
      {/* 定时断网锁定提示（不随推轨缩放，避开字幕与导航） */}
      {t >= TOGGLE_AT && (
        <div style={{ position: 'absolute', left: vertical ? 60 : W * 0.43, top: vertical ? H * 0.52 - 74 : 150, opacity: ramp(t, TOGGLE_AT + 0.2, 0.4, EASE.out), whiteSpace: 'nowrap' }}>
          <Pill bg="rgba(255,149,0,0.22)" color="#ffd8a8" style={{ fontSize: 24 }}>
            🔒 儿童平板 · 每晚 23:00 自动断网 · 已锁定
          </Pill>
        </div>
      )}
    </>
  );

  return (
    <Abs style={{ inset: 0, overflow: 'hidden' }}>
      <AuroraBG t={tr} />
      {/* 段 C：对称分屏（在卡片下层，先在场，由 split-reveal 揭开） */}
      {t >= SEG_C - 0.05 && (
        <Abs style={{ inset: 0, opacity: 1 - endOut }}>
          {!vertical && <div style={{ position: 'absolute', left: W / 2 - 1, top: 160, bottom: 120, width: 2, background: 'linear-gradient(180deg, rgba(255,255,255,0), rgba(160,200,255,0.55), rgba(255,255,255,0))' }} />}
          {[0, 1].map((i) => {
            const x = W * (0.25 + i * 0.5);
            const sw = vertical ? 440 : 306; // 竖屏双机放大到并排满宽（审片 B12）
            return (
              <React.Fragment key={i}>
                <Pose x={x} y={vertical ? H * 0.47 : cy + 30} sw={sw} s={1} ry={(i ? -8 : 8) + 2 * Math.sin(t * 0.6 + i)}>
                  {i === 0 ? <Phone w={sw} full><PwaFlow t={t} w={sw} a={SEG_C} /></Phone> : <Phone w={sw} full dark><AndroidFlow t={t} w={sw} a={SEG_C} /></Phone>}
                </Pose>
                <div style={{ position: 'absolute', left: x - 300, width: 600, top: vertical ? H * 0.47 + 340 : 146, textAlign: 'center', opacity: ramp(t, SEG_C + 0.4, 0.5, EASE.out) }}>
                  {!vertical && (
                    <>
                      <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 30, color: C.text, whiteSpace: 'nowrap' }}>{i === 0 ? '添加到主屏幕' : '安卓 App'}</div>
                      <div style={{ fontFamily: FONT.mono, fontSize: 18, color: C.text3, marginTop: 6, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{i === 0 ? 'iOS / ANDROID · 指纹面板锁' : 'v3.1.3 · 扫码 / 粘贴添加 · 多路由切换'}</div>
                    </>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </Abs>
      )}
      {/* 段 A（推入时视差左移，卡片完全覆盖后卸载） */}
      {pushIn < 1 && (
        <Abs style={{ inset: 0, transform: `translateX(${-0.35 * W * pushIn}px)` }}>
          <Abs style={{ inset: 0, transform: `scale(${breathA * pushA * (1 - prep * 0.02)}) translateY(${stackPress}px)`, transformOrigin: `${vertical ? W / 2 : W * 0.58}px ${cy + 0.05 * swA}px` }}>
            <div style={{ position: 'absolute', left: W * 0.55 - 600, top: cy + swA + 30, width: 1200, height: 80, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,0,0,0.5), rgba(0,0,0,0) 70%)' }} />
            {/* 黄金三角立体交错：主机居中偏右前景、左辅机退到左后方虚化、右辅机沉入右下角露出局部测速面板 */}
            {(vertical ? [1] : [0, 2, 1]).map((i) => {
              const e = enter(i);
              const L = [
                { x: W * 0.33, dy: -10, s: 0.88, ry: 22, rz: -2, z: 1, blur: 1.6, dim: 0.78 }, // 辅机一：左后方
                { x: vertical ? W / 2 : W * 0.58, dy: 0, s: vertical ? 1 : 1.08, ry: vertical ? -4 : -8, rz: 0, z: 3, blur: 0, dim: 1 }, // 主机：前景主视角
                { x: W * 0.77, dy: 40, s: 0.82, ry: -12, rz: 3, z: 2, blur: 0, dim: 0.92 }, // 辅机二：右下角，部分被主机遮挡
              ][i];
              const x = mix(cx, L.x, fan);
              const y = cy - (vertical ? 0 : 15) + (1 - e) * H * 0.9 + L.dy * fan;
              const s = mix(1, L.s, fan);
              return (
                <div key={i} style={{ position: 'absolute', inset: 0, zIndex: L.z, filter: L.blur * fan > 0.2 || L.dim < 1 ? `blur(${(L.blur * fan).toFixed(2)}px) brightness(${mix(1, L.dim, fan)})` : undefined }}>
                  <Pose x={x} y={y} sw={swA} rz={L.rz * fan} s={s} ry={L.ry * fan + 2 * Math.sin(t * 0.6 + i)} z={L.z}>
                    <Phone w={swA} full>
                      {i === 1 ? <PluginScreen t={t} w={swA} /> : <Img src={staticFile(i === 2 ? 'shots/real/traf.png' : 'shots/real/dev.png')} style={{ width: swA, height: swA * PHONE_ASPECT, display: 'block' }} />}
                    </Phone>
                  </Pose>
                </div>
              );
            })}
          </Abs>
        </Abs>
      )}
      {/* 段 B 卡片：推入 → 分屏前对称滑开 */}
      {t >= SEG_B && split < 1 && (
        split <= 0 ? (
          <Abs style={{ inset: 0, overflow: 'hidden', transform: `translateX(${W * (1 - pushIn)}px)`, boxShadow: pushIn < 1 ? '-30px 0 80px rgba(0,0,0,0.55)' : undefined, borderRadius: pushIn < 1 ? 36 : 0 }}>{segBContent}</Abs>
        ) : (
          <>
            <Abs style={{ inset: 0, overflow: 'hidden', clipPath: 'inset(0 50% 0 0)', transform: `translateX(${(-W / 2) * split}px)` }}>{segBContent}</Abs>
            <Abs style={{ inset: 0, overflow: 'hidden', clipPath: 'inset(0 0 0 50%)', transform: `translateX(${(W / 2) * split}px)` }}>{segBContent}</Abs>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: W / 2 - 2, width: 4, background: '#cfe6ff', boxShadow: '0 0 30px 8px rgba(120,180,255,0.7)', opacity: 1 - split }} />
          </>
        )
      )}
      <NavCapsule t={t} />
      <Vignette strength={0.45} />
      <Grain opacity={0.1} />
    </Abs>
  );
};
