// 动效工作台（video-shotcraft workbench）接入清单：成片拆成 五幕镜头 / 逐句字幕 / 逐条音效 / 配乐与人声 多轨。
// 同源：幕表来自 Main.ACTS，字幕来自 Subtitles.phrases()，音效来自 sfx.json（cues.json 切片）。
import React from 'react';
import { Sequence } from 'remotion';
import { ACTS, Main } from './Main';
import { Act1 } from './acts/Act1';
import { Act2 } from './acts/Act2';
import { Act3 } from './acts/Act3';
import { Act4 } from './acts/Act4';
import { Act5 } from './acts/Act5';
import { SubtitleLine, phrases } from './Subtitles';
import SFX from './sfx.json';

const FPS = 60;
const COMPS: Record<string, React.FC> = { a1: Act1, a2: Act2, a3: Act3, a4: Act4, a5: Act5 };
const LABELS: Record<string, string> = {
  a1: '第一幕 · 旧时代的终结（HUD）',
  a2: '第二幕 · 轻盈之躯，破界而生',
  a3: '第三幕 · 全能掌中矩阵',
  a4: '第四幕 · 与 AI 对话，言出法随',
  a5: '终幕 · 全天候守护与双轨启航',
};
// 各幕组件按全片绝对时间作画：在 clip 内用负偏移 Sequence 还原绝对帧
const atAbs = (id: string, startSec: number) => {
  const C: React.FC = () => React.createElement(Sequence, { from: -Math.round(startSec * FPS) }, React.createElement(COMPS[id]));
  C.displayName = `Promo_${id}`;
  return C;
};

export const WORKBENCH = {
  name: 'OpenWrt Claude Panel · 90s promo',
  fps: FPS,
  width: 1920,
  height: 1080,
  total: 5400,
  background: '#07090E',
  shots: ACTS.map((a) => ({
    id: a.id,
    label: LABELS[a.id],
    from: Math.round(a.start * FPS),
    duration: Math.round((a.end - a.start) * FPS),
    component: atAbs(a.id, a.start) as React.ComponentType<Record<string, unknown>>,
  })),
  captions: phrases().map((p) => ({
    id: p.id,
    label: p.text,
    from: Math.round(p.start * FPS),
    duration: Math.max(1, Math.round((p.end - p.start) * FPS)),
    component: SubtitleLine as unknown as React.ComponentType<Record<string, unknown>>,
    props: { text: p.text },
    schema: [{ type: 'textarea', key: 'text', label: '字幕文案', default: '' }],
    cardId: 'subtitle',
    cardName: '跟读字幕',
  })),
  sfx: (SFX as { t: number; dur: number; src: string; name: string }[]).map((s) => ({
    from: Math.round(s.t * FPS),
    duration: Math.max(1, Math.round(s.dur * FPS)),
    src: s.src,
    volume: 0.4,
    label: s.name,
  })),
  bgm: [
    { from: 0, duration: 5400, src: 'audio/bgm.wav', volume: 0.3, label: '配乐' },
    { from: 0, duration: 5400, src: 'audio/narration.wav', volume: 1, label: '人声' },
  ],
  original: Main as unknown as React.ComponentType<Record<string, unknown>>,
};
