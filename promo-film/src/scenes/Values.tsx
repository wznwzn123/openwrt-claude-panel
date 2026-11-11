// 四条做事的原则（576f，每条 144f = 2 小节）。左边一句话 + 证据出处，右边是证据本身：
// 1 能关掉（自动任务页，真实截图）  2 不强迫（更新提示「以后再说」+ 安装失败上报的原话）
// 3 说实话（托管服务到期时直说原因，不再说成网络问题）  4 说人话（更新说明原文）
// 线的用法：每条先在大字下面画一道下划线，再去把证据框起来（draw-svg-trace）。
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, Chip, DemoNote, F, Rise, glass } from '../lib/look';
import { EASE, mix, ramp } from '../lib/ease';
import { NibDefs, Poly, Stroke, roundRect } from '../lib/thread';
import { L, Region, Rect } from '../lib/shot';
import { CamKey, PageCam } from '../lib/PageCam';

export const VALUE_LEN = 144;
export const VALUES_T = { say: 4, under0: 24, under1: 44, ev: 30, trace0: 56, trace1: 84, out: 134 };
const T = VALUES_T;

type V = { k: string; big: string; sub: string[]; src: string[] };
const VS: V[] = [
  { k: '01', big: '能关掉', sub: ['每一项自动任务都有开关，', '也写清楚关掉以后会怎样。'], src: ['自动任务页　v2.0.6 · 11.07'] },
  { k: '02', big: '不强迫', sub: ['v3.0.2 之后的新版本，想更新再更新；', '安装失败的报告，你输入 y 才发。'], src: ['不强制更新　11.08 10:23', '失败上报　v3.0.0'] },
  { k: '03', big: '说实话', sub: ['出了问题，说清楚真正的原因，', '不拿别的原因搪塞。'], src: ['到期提示　11.08 03:00'] },
  { k: '04', big: '说人话', sub: ['每一版更新说明，', '都用大白话写。'], src: ['tools/release-notes.md'] },
];

// 证据区：右半边
const EX = 900, EW = 880;

const Underline: React.FC<{ f: number; y: number }> = ({ f, y }) => {
  const poly = new Poly([[140, y], [560, y]]);
  const d = ramp(f, T.under0, T.under1 - T.under0, EASE.smooth) * poly.len;
  return f >= T.under0 ? <Stroke poly={poly} s1={d} width={4} /> : null;
};

const Trace: React.FC<{ f: number; r: Rect; rad?: number }> = ({ f, r, rad = 16 }) => {
  const poly = new Poly(roundRect(r.x, r.y, r.w, r.h, rad, 8));
  const d = ramp(f, T.trace0, T.trace1 - T.trace0, EASE.smooth) * poly.len;
  return f >= T.trace0 ? <Stroke poly={poly} s1={d} width={3} /> : null;
};

// 证据 1：自动任务页。一扇 16:9 小窗里放 PageCam（正视、极慢推近），只取「提醒和备份」这一组，线框住「每日体检」；
// v3：上面那组（隧道、Cloudflare 字样）不进画面（v2 评审）。机位是平面的，框的位置按 PageCam 同一条缓动换算到画面坐标。
const A = L['desk-auto'];
const EV1_CAM: CamKey[] = [
  { frame: 0, cx: 1096, cy: 546, zoom: 1.6 },
  { frame: 144, cx: 1096, cy: 550, zoom: 1.64 },
];
// 窗口是一条宽横幅（只露出画面中间那一带），这样「提醒和备份」一组正好填满，不留大片空白（v3 静帧自检）
const EV1_W = EW, EV1_H = 270, EV1_K = EV1_W / 1920, EV1_TOP = 330, EV1_OFF = (1080 - EV1_H / EV1_K) / 2;
const Ev1: React.FC<{ f: number }> = ({ f }) => {
  const t = EASE.smooth(Math.max(0, Math.min(1, f / 144)));
  const cx = mix(EV1_CAM[0].cx, EV1_CAM[1].cx, t), cy = mix(EV1_CAM[0].cy, EV1_CAM[1].cy, t), z = mix(EV1_CAM[0].zoom, EV1_CAM[1].zoom, t);
  const row = A.autoRows[3]; // 每日体检
  const sx = (x: number) => EX + (960 + (x - cx) * z) * EV1_K, sy = (y: number) => EV1_TOP + (540 - EV1_OFF + (y - cy) * z) * EV1_K;
  const rr = { x: sx(row.x) - 10, y: sy(row.y) - 6, w: row.w * z * EV1_K + 20, h: row.h * z * EV1_K - 2 }; // 框底边比这一行底边高一点，不压下一行标题
  return (
    <>
      <div style={{ position: 'absolute', left: EX, top: EV1_TOP, width: EV1_W, height: EV1_H, borderRadius: 24, overflow: 'hidden', boxShadow: '0 40px 100px -24px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.25)' }}>
        <div style={{ position: 'absolute', left: 0, top: -EV1_OFF * EV1_K, width: 1920, height: 1080, transformOrigin: '0 0', transform: `scale(${EV1_K.toFixed(5)})` }}>
          <PageCam src="ui/desk-auto.png" pageH={1200} keys={EV1_CAM} ease={EASE.smooth} frame={f} />
        </div>
      </div>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}><NibDefs /><Trace f={f} r={rr} /></svg>
    </>
  );
};

// 证据 2：首页的更新提示（框住「以后再说」）+ 安装失败时终端里的原话
const Ev2: React.FC<{ f: number }> = ({ f }) => {
  const h = L['desk-home'], u = h.update, later = h.updLater;
  const k = EW / (u.w + 16), top = 200;
  const rr = { x: EX + (later.x - u.x + 8) * k - 14, y: top + (later.y - u.y + 8) * k - 10, w: later.w * k + 28, h: later.h * k + 20 };
  const line1 = '要上报吗？输入 y 上报，n 不上报 [n]：';
  const typed = Math.max(0, Math.min(line1.length, Math.floor((f - 46) / 1.1)));
  const t2 = f > 46 + line1.length * 1.1 + 14;
  const termP = ramp(f, 36, 16, EASE.panel);
  return (
    <>
      <div style={{ position: 'absolute', left: EX, top }}><Region page="desk-home" rect={u} pad={8} width={EW} radius={24} style={{ boxShadow: '0 40px 100px -24px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.25)' }} /></div>
      <div style={{ position: 'absolute', left: EX, top: top + (u.h + 16) * k + 36, width: EW, height: 190, ...glass({ radius: 22, fill: 0.05 }), background: 'rgba(8,10,20,0.78)', opacity: termP, transform: `translateY(${((1 - termP) * 30).toFixed(1)}px)`, padding: '26px 32px', boxSizing: 'border-box', fontFamily: F.mono, fontSize: 27, lineHeight: 1.7, color: '#d6e2ff' }}>
        <div style={{ color: C.faint, fontSize: 21, marginBottom: 6 }}>安装没有成功时，终端里会问一句：</div>
        <div style={{ whiteSpace: 'pre' }}>{line1.slice(0, typed)}<span style={{ opacity: !t2 && f % 16 < 9 ? 1 : 0, color: C.green }}>▍</span></div>
        <div style={{ opacity: t2 ? 1 : 0, color: '#9fe3b4' }}>没有上报。</div>
      </div>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}><NibDefs /><Trace f={f} r={rr} rad={12} /></svg>
    </>
  );
};

// 证据 3：提交 37eed7e「托管服务到期后打开面板：直接说『托管服务已到期，专属网址暂停了』和怎么续期，不再说成手机网络的问题」。
// 划掉的是以前那句笼统的报错（面板代码里的原文），换上的是现在的提示（SVC_EXP_MSG 原文，节选）。v3 换的例子：不涉及安全，不读作自曝（v2 评审）。
const Ev3: React.FC<{ f: number }> = ({ f }) => {
  const top = 240, P = 46;
  const strike = new Poly([[-6, 24], [612, 24]]);
  const s = ramp(f, 48, 22, EASE.smooth) * strike.len;
  const newP = ramp(f, 70, 18, EASE.out);
  return (
    <div style={{ position: 'absolute', left: EX, top, width: EW, height: 440, ...glass({ radius: 26, fill: 0.08 }), padding: P, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 36, fontWeight: 700, color: C.text }}>托管服务到期后，面板上的提示</span>
        <span style={{ marginLeft: 'auto', fontFamily: F.mono, fontSize: 24, color: C.dim }}>11.08 03:00 改</span>
      </div>
      <div style={{ position: 'relative', marginTop: 34, fontSize: 32, lineHeight: '48px', color: f > 60 ? C.faint : C.text, whiteSpace: 'nowrap' }}>
        连不上路由器（网络断开或路由器在重启）
        <svg width={640} height={48} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}><NibDefs />{f >= 48 && <Stroke poly={strike} s1={s} width={4} />}</svg>
      </div>
      <div style={{ marginTop: 22, fontSize: 32, lineHeight: 1.6, color: '#ffe2a8', opacity: newP, transform: `translateY(${((1 - newP) * 12).toFixed(1)}px)`, whiteSpace: 'pre-line' }}>{'托管服务已到期，专属网址暂停了，\n所以连不上路由器；\n家里上网和路由器上的设置都不受影响。'}</div>
    </div>
  );
};

// 证据 4：更新说明原文（tools/release-notes.md · v3.0.3）
const NOTES = ['v3.0.3 的更新：', '面板一直开着也能收到新版本提示。', '以前只有打开面板时才检查一次更新，', 'App 放在后台再切回来、或者面板一直亮着，就不会再查。', '现在切回来或者开着超过 10 分钟都会再查一次。'];
const Ev4: React.FC<{ f: number }> = ({ f }) => (
  <div style={{ position: 'absolute', left: EX, top: 250, width: EW, ...glass({ radius: 26, fill: 0.08 }), padding: '40px 46px', boxSizing: 'border-box' }}>
    {NOTES.map((n, i) => (
      <Rise key={i} text={n} start={34 + i * 10} per={0.35} dur={16} dy={8} blur={6} style={{ fontFamily: i === 0 ? F.mono : F.sans, fontSize: i === 0 ? 24 : i === 1 ? 34 : 28, fontWeight: i === 1 ? 700 : 400, color: i === 0 ? C.faint : i === 1 ? C.text : C.dim, marginTop: i ? 14 : 0, lineHeight: 1.5 }} />
    ))}
  </div>
);

const EVS = [Ev1, Ev2, Ev3, Ev4];

export const Values: React.FC = () => {
  const F0 = useCurrentFrame();
  const i = Math.min(3, Math.floor(F0 / VALUE_LEN));
  const f = F0 - i * VALUE_LEN;
  const v = VS[i];
  const Ev = EVS[i];
  const enter = ramp(f, 0, 18, EASE.panel);
  const out = ramp(f, T.out, 10, EASE.swift);
  const evP = ramp(f, T.ev, 22, EASE.panel);
  return (
    <AbsoluteFill style={{ opacity: Math.min(enter, 1 - out), filter: out > 0.001 ? `blur(${(out * 14).toFixed(1)}px)` : undefined, transform: `translateY(${((1 - enter) * 30 - out * 30).toFixed(1)}px)` }}>
      <div style={{ position: 'absolute', left: 140, top: 286, width: 700 }}>
        <div style={{ fontFamily: F.mono, fontSize: 24, color: C.faint, letterSpacing: '0.2em' }}>原则 {v.k}</div>
        <Rise text={v.big} start={T.say} per={5} dur={24} dy={20} blur={18} style={{ marginTop: 18, fontFamily: F.serif, fontSize: 132, fontWeight: 700, color: C.text, letterSpacing: '0.06em', lineHeight: 1.1 }} />
        <div style={{ marginTop: 48 }}>
          {v.sub.map((s, j) => <Rise key={j} text={s} start={T.say + 18 + j * 8} per={0.6} dur={18} dy={10} style={{ fontSize: 36, color: C.dim, lineHeight: 1.6 }} />)}
        </div>
        <div style={{ marginTop: 30, display: 'flex', gap: 12, opacity: ramp(f, 40, 14) }}>{v.src.map((s) => <Chip key={s}>{s}</Chip>)}</div>
      </div>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}><NibDefs /><Underline f={f} y={490} /></svg>
      <div style={{ position: 'absolute', inset: 0, opacity: evP, transform: `translateX(${((1 - evP) * 60).toFixed(1)}px)` }}>
        <Ev f={f} />
      </div>
      {i < 2 && <DemoNote opacity={evP} />}
      {i >= 2 && <div style={{ position: 'absolute', left: 64, bottom: 40, fontSize: 26, color: 'rgba(228,232,255,0.6)', opacity: evP, letterSpacing: '0.04em' }}>{i === 2 ? '内容摘自仓库提交记录' : '原文摘自 tools/release-notes.md'}</div>}
      <div style={{ position: 'absolute', right: 72, top: 64, fontFamily: F.mono, fontSize: 22, color: C.faint, opacity: 0.8 }}>{mix(1, 4, i / 3).toFixed(0)} / 4</div>
    </AbsoluteFill>
  );
};
