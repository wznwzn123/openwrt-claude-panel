// 提交长卷急刹（144f）：从第 1 次提交高速滚到第 94 次，急刹停在 v3.1.1「我的反馈」；其余退暗，
// 右边浮出真实的「我的反馈」页（演示数据），一根线沿三段进度描一圈。
// 镜头卡：changelog-scroll-brake（bezier .45,0,.06,1 快起步长尾急刹，纵向运动模糊由速度差分驱动，停点抬升 + 其余退暗 0.38）。
// 数据：tools/commits.py 从 git 历史生成；含代理一类字眼的提交不上画面。
import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { C, DemoNote, F, Rise, glass } from '../lib/look';
import { EASE, mix, ramp, velocity } from '../lib/ease';
import { SpeedBlur } from '../lib/speedblur';
import { NibDefs, Poly, Stroke, roundRect } from '../lib/thread';
import commits from '../data/commits.json';

type Cm = { n: number; t: string; h: string; s: string; ok: boolean };
const ROWS = (commits as Cm[]).filter((c) => c.ok);
const TARGET = ROWS.length - 1; // 第 94 次提交
const GAP = 14;
const rowH = (i: number) => (i === TARGET ? 96 : 62 + ((i * 29) % 3) * 12);
const rowY: number[] = [];
{ let y = 0; for (let i = 0; i < ROWS.length; i++) { rowY.push(y); y += rowH(i) + GAP; } }
const COL_X = 120, COL_W = 860;
// s1 = 54 = 第 20 小节第 4 拍（整片第 1494 帧），急刹落在拍上
export const BRAKE_T = { s0: 4, s1: 54, lift0: 54, lift1: 66, card: 62, trace0: 80, trace1: 108, cap: 68, out: 134 };
const T = BRAKE_T;
const START = 160, END = 540 - (rowY[TARGET] + rowH(TARGET) / 2);
const scrollAt = (f: number) => mix(START, END, ramp(f, T.s0, T.s1 - T.s0, EASE.brake));

// v2：改用手机版「我的反馈」卡（3x 截图，358×544 CSS px），只取上半段（状态、内容、三段进度、编号），放大 2.1 倍，
// 三段进度的字高约 27px（v1 用电脑版整卡缩小，字只有 9px，评审 F3 / Q11）。坐标按截图里量到的位置。
const CARD = { w: 358, h: 222 }, STEPS = { x: 14, y: 80, w: 330, h: 70 };
const CW = 752, CX = 1060, CY = 330;
const KF = CW / CARD.w;

export const Brake: React.FC = () => {
  const f = useCurrentFrame();
  const y = scrollAt(f);
  const vy = velocity(scrollAt, f);
  const lift = ramp(f, T.lift0, T.lift1 - T.lift0, EASE.out);
  const hit = Math.max(0, 1 - Math.abs(f - T.s1) / 7);
  const cardP = ramp(f, T.card, 22, EASE.panel);
  // 三段进度在卡片里的位置 → 画面坐标，线沿它描一圈
  const sx = CX + STEPS.x * KF, sy = CY + STEPS.y * KF, sw = STEPS.w * KF, sh = STEPS.h * KF;
  const ring = new Poly(roundRect(sx - 8, sy - 8, sw + 16, sh + 16, 26, 8));
  const traced = ramp(f, T.trace0, T.trace1 - T.trace0, EASE.smooth) * ring.len;
  const out = ramp(f, T.out, 10, EASE.swift);
  return (
    <AbsoluteFill style={{ opacity: 1 - out, filter: out > 0.001 ? `blur(${(out * 14).toFixed(1)}px)` : undefined, transform: `scale(${(1 + 0.02 * hit).toFixed(4)})` }}>
      {/* 长卷 */}
      <div style={{ position: 'absolute', left: COL_X, top: 0, width: COL_W, height: 1080, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 14%, #000 86%, transparent 100%)', maskImage: 'linear-gradient(180deg, transparent 0%, #000 14%, #000 86%, transparent 100%)' }}>
        <SpeedBlur vx={0} vy={vy} amount={0.3} max={30}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: COL_W, transform: `translateY(${y.toFixed(2)}px)` }}>
            {ROWS.map((r, i) => {
              const tgt = i === TARGET;
              const lf = tgt ? lift : 0;
              return (
                <div key={r.n} style={{ position: 'absolute', left: 0, top: rowY[i], width: COL_W, height: rowH(i), boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 22, padding: '0 26px', borderRadius: 16,
                  ...glass({ radius: 16, fill: tgt ? 0.06 + 0.1 * lf : 0.05, blur: 0, edge: tgt ? 0.2 + 0.5 * lf : 0.14 }),
                  boxShadow: tgt ? `inset 0 0 0 ${(1 + 1.5 * lf).toFixed(2)}px rgba(160,190,255,${(0.3 + 0.6 * lf).toFixed(2)}), 0 ${(30 * lf).toFixed(0)}px 70px -20px rgba(0,0,0,0.7)` : 'inset 0 0 0 1px rgba(255,255,255,0.1)',
                  transform: `scale(${(1 + 0.04 * lf).toFixed(4)})`, opacity: tgt ? 1 : 1 - 0.62 * lift }}>
                  <span style={{ width: 66, fontFamily: F.mono, fontSize: tgt ? 26 : 20, color: tgt ? C.text : C.faint }}>#{r.n}</span>
                  <span style={{ width: tgt ? 200 : 150, whiteSpace: 'nowrap', fontFamily: F.mono, fontSize: tgt ? 24 : 19, color: r.t.slice(6, 8) < '06' ? '#ffd28a' : C.faint }}>{r.t}</span>
                  <span style={{ flex: 1, fontSize: tgt ? 34 : 24, fontWeight: tgt ? 700 : 500, color: tgt ? C.text : C.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tgt ? 'v3.1.1　面板里有了「我的反馈」' : r.s}</span>
                </div>
              );
            })}
          </div>
        </SpeedBlur>
      </div>
      {/* 右边：真实的「我的反馈」页 */}
      <div style={{ position: 'absolute', left: CX, top: CY, opacity: cardP, transform: `translateX(${((1 - cardP) * 80).toFixed(1)}px)` }}>
        <div style={{ width: CW, height: CARD.h * KF, borderRadius: 30, overflow: 'hidden', boxShadow: '0 40px 100px -24px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.25)' }}>
          <Img src={staticFile('ui/myfb-card.png')} style={{ width: CW, display: 'block' }} />
        </div>
      </div>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <NibDefs />
        {f >= T.trace0 && <Stroke poly={ring} s1={traced} width={3} />}
      </svg>
      <div style={{ position: 'absolute', left: CX, top: 170, width: 780 }}>
        <Rise text="每一条反馈都有编号，" start={T.cap} per={1.2} dur={20} style={{ fontSize: 46, fontWeight: 600, color: C.text }} />
        <Rise text="处理到哪一步，都看得到。" start={T.cap + 10} per={1.2} dur={20} style={{ marginTop: 10, fontSize: 46, fontWeight: 600, color: C.text }} />
      </div>
      <div style={{ position: 'absolute', left: CX, top: CY + CARD.h * KF + 24, fontFamily: F.mono, fontSize: 26, color: C.dim, opacity: cardP }}>
        手机上的「我的反馈」　·　v3.1.1，第 94 次提交
      </div>
      <DemoNote opacity={cardP} />
    </AbsoluteFill>
  );
};
