// 第二段（288f）：线从左边接进来，围出一扇窗 → 真实面板（电脑端，演示数据）在窗里显影，镜头推近实时流量
// → 窗退到右边，左边词槽轮换「不需要 Python / Node.js / Docker / 公网 IP / 开端口」。
// 镜头卡：line-carry-transition（线条接力围出画框）、PageCam（video-shotcraft 的 2.5D 页面相机，原样拷入）、blur-slide、pill-slot-cycle。
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, DemoNote, F, Rise } from '../lib/look';
import { EASE, mix, ramp } from '../lib/ease';
import { NibDefs, Poly, Stroke, roundRect } from '../lib/thread';
import { L } from '../lib/shot';
import { CamKey, PageCam } from '../lib/PageCam';

// 窗口是 16:9，里面放一个完整的 1920×1080 PageCam 画面，整体缩到窗口大小
const WX = 320, WY = 160, WW = 1280, WH = 720, WR = 30;
const live = L['desk-home'].live;
// PageCam 机位（帧号是本段内的帧）：先正视整页，再带一点 3D 倾斜推近实时流量卡，之后极慢地继续漂
const CAM: CamKey[] = [
  { frame: 40, cx: 960, cy: 540, zoom: 1, rotX: 0, rotY: 0 },
  { frame: 76, cx: 960, cy: 560, zoom: 1.02, rotX: 0, rotY: 0 },
  { frame: 150, cx: live.x + live.w / 2, cy: live.y + live.h / 2 + 10, zoom: 1.6, rotX: 9, rotY: -11, persp: 1700 },
  { frame: 288, cx: live.x + live.w / 2 + 60, cy: live.y + live.h / 2 + 40, zoom: 1.68, rotX: 6, rotY: -17, persp: 1700 },
];
const FRAME = new Poly([[-60, 520], [WX, 520], ...roundRect(WX, WY, WW, WH, WR, 12).slice(1)]);

export const WHY_T = { draw1: 54, reveal: 40, cap: 64, push0: 76, push1: 150, park0: 150, park1: 184, slot0: 198, cap1: 222, cap2: 244 };
const T = WHY_T;
const SLOTS = ['Python', 'Node.js', 'Docker', '公网 IP', '开端口'];
const SLOT_STEP = 18;
export const WHY_SLOT_TIMES = SLOTS.map((_, i) => T.slot0 + i * SLOT_STEP);

// 词槽：句干「不需要」钉住，胶囊里的词每拍滚一格（旧词上飞淡出，新词从下带模糊滑入，胶囊宽度平滑伸缩）
const SlotLine: React.FC<{ f: number }> = ({ f }) => {
  const enter = ramp(f, T.slot0 - 10, 16, EASE.out);
  const k = Math.max(0, Math.min(SLOTS.length - 1, Math.floor((f - T.slot0) / SLOT_STEP)));
  const p = ramp(f - T.slot0 - k * SLOT_STEP, 0, 11, EASE.snappy);
  const wOf = (s: string) => Array.from(s).reduce((w, ch) => w + (/[一-鿿]/.test(ch) ? 62 : ch === ' ' ? 16 : 36), 0) + 72;
  const w = k > 0 ? mix(wOf(SLOTS[k - 1]), wOf(SLOTS[k]), p) : wOf(SLOTS[0]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, opacity: enter, transform: `translateY(${((1 - enter) * 16).toFixed(1)}px)` }}>
      <span style={{ fontSize: 66, fontWeight: 600, color: C.text }}>不需要</span>
      <span style={{ position: 'relative', display: 'inline-block', height: 100, width: w, borderRadius: 50, overflow: 'hidden', background: 'linear-gradient(120deg, #6a4dff 0%, #2f6bff 55%, #00c2d8 100%)', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.35), 0 18px 50px -12px rgba(47,107,255,0.7)' }}>
        {[k - 1, k].map((j) => {
          if (j < 0 || (k === 0 && j !== k)) return null;
          const isNew = j === k;
          const y = k === 0 ? 0 : isNew ? (1 - p) * 70 : -p * 70;
          const o = k === 0 ? 1 : isNew ? p : 1 - p;
          const b = k === 0 ? 0 : isNew ? (1 - p) * 10 : p * 10;
          return <span key={j} style={{ position: 'absolute', left: 0, right: 0, top: 0, lineHeight: '100px', textAlign: 'center', fontFamily: F.sans, fontSize: 58, fontWeight: 700, color: '#fff', opacity: o, transform: `translateY(${y.toFixed(1)}px)`, filter: b > 0.2 ? `blur(${b.toFixed(1)}px)` : undefined }}>{SLOTS[j]}</span>;
        })}
      </span>
    </div>
  );
};

export const Why: React.FC = () => {
  const f = useCurrentFrame();
  const drawn = ramp(f, 0, T.draw1, EASE.smooth) * FRAME.len;
  const reveal = ramp(f, T.reveal, 26, EASE.panel);
  const flash = Math.max(0, 1 - Math.abs(f - T.draw1) / 8);
  // 窗退到右边
  const park = ramp(f, T.park0, T.park1 - T.park0, EASE.panel);
  const s = mix(1, 0.6, park);
  const tx = mix(0, 1330 - 960, park), ty = mix(0, 540 - (WY + WH / 2), park);
  const out = ramp(f, 270, 18, EASE.swift);
  return (
    <AbsoluteFill style={{ opacity: 1 - out, filter: out > 0.001 ? `blur(${(out * 14).toFixed(1)}px)` : undefined }}>
      <AbsoluteFill style={{ transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(4)})`, transformOrigin: `960px ${WY + WH / 2}px` }}>
        {/* 窗里的真实页面 */}
        <div style={{ position: 'absolute', left: WX, top: WY, width: WW, height: WH, borderRadius: WR, overflow: 'hidden', clipPath: `inset(0 0 ${((1 - reveal) * 100).toFixed(2)}% 0 round ${WR}px)`, boxShadow: '0 50px 120px -30px rgba(0,0,0,0.8)' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: `scale(${(WW / 1920).toFixed(5)})` }}>
            <PageCam src="ui/desk-home.png" pageH={1200} keys={CAM} ease={EASE.smooth} />
          </div>
        </div>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <NibDefs />
          <Stroke poly={FRAME} s1={drawn} width={3.5} glow={0.7 + flash * 2} />
        </svg>
      </AbsoluteFill>
      {/* 窗下的说明（窗还在中间时） */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: WY + WH + 40, textAlign: 'center' }}>
        <Rise text="OpenWrt Claude Panel　路由器的控制面板，手机和电脑都能打开" start={T.cap} per={0.6} dur={20} dy={10} out={T.park0 - 14} style={{ fontSize: 34, color: C.dim, letterSpacing: '0.04em' }} />
      </div>
      {/* 左边：词槽 + 两条说明 */}
      <div style={{ position: 'absolute', left: 130, top: 360, width: 760 }}>
        {f >= T.slot0 - 10 && <SlotLine f={f} />}
        <Rise text="面板跑在路由器自带的 ucode + uhttpd 上，" start={T.cap1} per={0.5} dur={18} dy={10} style={{ marginTop: 48, fontSize: 30, color: C.dim }} />
        <Rise text="本身只有约 2 MB。" start={T.cap1 + 8} per={0.5} dur={18} dy={10} style={{ marginTop: 6, fontSize: 30, color: C.dim }} />
        <Rise text="远程打开走 Cloudflare 隧道，" start={T.cap2} per={0.5} dur={18} dy={10} style={{ marginTop: 22, fontSize: 30, color: C.dim }} />
        <Rise text="不用公网 IP，也不用开端口。" start={T.cap2 + 8} per={0.5} dur={18} dy={10} style={{ marginTop: 6, fontSize: 30, color: C.dim }} />
      </div>
      <DemoNote opacity={reveal} />
    </AbsoluteFill>
  );
};
