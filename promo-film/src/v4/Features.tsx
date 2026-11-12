// 功能（第 8–19 小节，落鼓后的满能量段）：六个功能，每个两小节；关键词在左，右边是真实面板（电脑端，演示数据）。
// 换功能落在每两小节的强拍上：窗里的页面横向甩过去（whip + 按速度的 SpeedBlur），关键词同拍滚一格。
// 每个功能的第 3 拍，描边圈把要看的那一块圈出来。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, mix, ramp } from '../lib/ease';
import { CamKey } from '../lib/PageCam';
import { SpeedBlur } from '../lib/speedblur';
import { B, BEAT_F } from './beat';
import { DemoLabel, Keyword, L4, Rect, Ring, Win, pulse } from './kit';

type Shot = { word: string; src: string; keys: (s: number, e: number) => CamKey[]; ring?: Rect; ringPad?: number; split?: { src: string; keys: (s: number, e: number) => CamKey[]; ring?: Rect } };
const c = (r: Rect) => [r.x + r.w / 2, r.y + r.h / 2];
const live = L4['desk-home'].live, dev = L4['desk-dev'], pz = L4['desk-pause'], wd = L4['desk-wd'], sp = L4['desk-speed'], tm = L4['desk-term'], fm = L4['desk-files'];
const spBox: Rect = { x: sp.stnums.x, y: sp.stnums.y, w: sp.stnums.w / 2 - 5, h: sp.stnums.h };

export const SHOTS: Shot[] = [
  { word: '实时网速', src: 'ui/desk-home.png', ring: live, keys: (s, e) => [{ frame: s, cx: c(live)[0], cy: c(live)[1] + 20, zoom: 1.52 }, { frame: e, cx: c(live)[0], cy: c(live)[1], zoom: 1.62 }] },
  { word: '设备管理', src: 'ui/desk-dev.png', ring: dev.cards[1], keys: (s, e) => [{ frame: s, cx: 1096, cy: 470, zoom: 1.5 }, { frame: e, cx: 1096, cy: 560, zoom: 1.62 }] },
  { word: '定时断网', src: 'ui/desk-pause.png', ring: pz.kv, ringPad: 6, keys: (s, e) => [{ frame: s, cx: 960, cy: 610, zoom: 1.85 }, { frame: e, cx: 960, cy: 650, zoom: 2.05 }] },
  { word: '每日体检', src: 'ui/desk-wd.png', ring: wd.dyhead, keys: (s, e) => [{ frame: s, cx: c(wd.dy)[0], cy: c(wd.dy)[1], zoom: 1.52 }, { frame: e, cx: c(wd.dy)[0], cy: c(wd.dy)[1] - 20, zoom: 1.62 }] },
  { word: '网速测试', src: 'ui/desk-speed.png', ring: spBox, keys: (s, e) => [{ frame: s, cx: 1096, cy: 298, zoom: 1.8 }, { frame: e, cx: 880, cy: 270, zoom: 2.4 }] },
  { word: '终端 · 文件', src: 'ui/desk-term.png', keys: (s, e) => [{ frame: s, cx: 1096, cy: 300, zoom: 1.55 }, { frame: e, cx: 1096, cy: 285, zoom: 1.64 }],
    split: { src: 'ui/desk-files.png', keys: (s, e) => [{ frame: s, cx: 1096, cy: 400, zoom: 1.55 }, { frame: e, cx: 1096, cy: 480, zoom: 1.68 }] } },
];
export const FEAT_START = SHOTS.map((_, i) => B(8 + 2 * i));
const WX = 640, WY = 196, WW = 1220;

// 一块「内容」：一张页面 + 它的镜头 + 描边圈
type Panel = { src: string; keys: CamKey[]; ring?: Rect; ringAt: number; ringPad?: number };
const panels: Panel[] = [];
SHOTS.forEach((sh, i) => {
  const s = FEAT_START[i], e = B(10 + 2 * i), mid = B(9 + 2 * i);
  if (sh.split) {
    panels.push({ src: sh.src, keys: sh.keys(s, mid), ringAt: 1e9 });
    panels.push({ src: sh.split.src, keys: sh.split.keys(mid, e), ringAt: 1e9 });
  } else panels.push({ src: sh.src, keys: sh.keys(s, e), ring: sh.ring, ringAt: B(8 + 2 * i, 2), ringPad: sh.ringPad });
});
export const CUTS = [...FEAT_START, B(19)]; // 每块内容开始的帧（最后一块从第 19 小节开始：文件）
export const WHIP = 12; // 甩镜 12 帧，中点落在拍上

export const Features: React.FC<{ f: number }> = ({ f }) => {
  // 当前是第几块；甩镜期间同时画前后两块
  let k = 0;
  for (let i = 0; i < CUTS.length; i++) if (f >= CUTS[i] - WHIP / 2) k = i;
  const cut = CUTS[k];
  const t = k === 0 ? 1 : ramp(f, cut - WHIP / 2, WHIP, EASE.smooth);
  const tPrev = ramp(f - 0.5, cut - WHIP / 2, WHIP, EASE.smooth), tNext = ramp(f + 0.5, cut - WHIP / 2, WHIP, EASE.smooth);
  const vx = k === 0 ? 0 : -(tNext - tPrev) * WW * 1.0;
  const show = (j: number, dx: number) => {
    const p = panels[j];
    const rp = ramp(f, p.ringAt, 12, EASE.out);
    return (
      <div key={j} style={{ position: 'absolute', inset: 0, transform: `translateX(${dx.toFixed(1)}px)` }}>
        <Win src={p.src} keys={p.keys} f={f} x={WX} y={WY} w={WW}>
          {p.ring && <Ring r={p.ring} p={rp} pad={p.ringPad ?? 10} />}
        </Win>
      </div>
    );
  };
  // 出场：第 20 小节强拍前 8 帧往里吸 + 虚化（下一拍是大冲击）
  const out = ramp(f, B(20) - 8, 8, EASE.exit);
  const inn = ramp(f, B(8), 10, EASE.snappy);
  const sc = pulse(f, BEAT_F, B(8), 0.008) * mix(0.9, 1, inn) * mix(1, 1.12, out);
  return (
    <AbsoluteFill style={{ opacity: 1 - out, filter: out > 0.01 ? `blur(${(out * 18).toFixed(1)}px)` : undefined }}>
      <AbsoluteFill style={{ transform: `scale(${sc.toFixed(4)})`, transformOrigin: `${WX + WW / 2}px ${WY + 315}px`, opacity: inn }}>
        <SpeedBlur vx={vx} amount={0.35} max={40}>
          {k > 0 && t < 1 && show(k - 1, -t * (WW + 120))}
          {show(k, k === 0 ? 0 : (1 - t) * (WW + 120))}
        </SpeedBlur>
      </AbsoluteFill>
      {SHOTS.map((sh, i) => (
        <Keyword key={i} f={f} at={FEAT_START[i]} out={i < SHOTS.length - 1 ? FEAT_START[i + 1] : B(20) - 4} idx={`0${i + 1} / 06`} text={sh.word} x={110} y={410} size={sh.word.length > 4 ? 92 : 112} />
      ))}
      <DemoLabel />
    </AbsoluteFill>
  );
};
