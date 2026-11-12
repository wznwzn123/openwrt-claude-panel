// v4 中央音效表：帧号全部从各段导出的时间常量来（同一份节拍网格），改画面时间音效跟着动。
// 用法：node tools/dump-cues.mjs src/v4/cues.ts → out/cues4.json → python3 audio/score4.py
// 节制（aesthetic-rules R4 / music-beat-sync §2）：配乐鼓点已经很密，音效只钉画面独有的动作；大冲击只有 3 处。
import { B, BAR_S, BIG_HITS, FPS, TOTAL } from './beat';
import { CUTS, SHOTS, FEAT_START } from './Features';
import { INSTALL_LINES, INSTALL_SLOTS } from './Install';
import { VER_AT, STAT_AT } from './Updates';
import { FIN } from './Finale';

type Cue = { f: number; kind: string; i?: number; dur?: number };
export const CUES: Cue[] = [
  // 前奏
  { f: B(0), kind: 'led_on' },
  { f: B(0, 1), kind: 'pen', dur: B(2) - B(0, 1) - 4 },
  { f: B(2), kind: 'icon_bloom' },
  { f: B(3), kind: 'word' },
  { f: B(4) + 6, kind: 'window_rise' }, // 窗口上升最快的那一帧
  { f: B(5), kind: 'phone_in' },
  { f: B(6), kind: 'riser', dur: B(8) - B(6) },
  // 三次大冲击
  ...BIG_HITS.slice(0, 2).map((f, i) => ({ f, kind: 'big_hit', i })),
  // 功能：每次甩镜（中点落拍，whoosh 提前到甩镜开始）+ 描边圈
  ...CUTS.slice(1).map((f, i) => ({ f, kind: 'whip', i })), // f = 甩镜中点（落拍）；音效按峰值对齐到这里
  ...SHOTS.map((s, i) => (s.split ? null : { f: B(8 + 2 * i, 2), kind: 'ring', i })).filter(Boolean) as Cue[],
  // 对话
  { f: B(20, 1), kind: 'typing', dur: 12 },
  { f: B(21), kind: 'tool', i: 0 }, { f: B(21) + 7, kind: 'tool', i: 1 },
  { f: B(21) + 10, kind: 'done' },
  ...[B(21, 3), B(22), B(22, 1), B(22, 2)].map((f, i) => ({ f, kind: 'row', i })),
  { f: B(24), kind: 'typing', dur: 12 },
  { f: B(24, 2), kind: 'bot', i: 0 },
  { f: B(25, 2), kind: 'send' },
  { f: B(26), kind: 'tool', i: 2 },
  { f: B(26) + 10, kind: 'done' },
  { f: B(26, 2), kind: 'bot', i: 1 },
  // 安装
  { f: B(28), kind: 'typing', dur: 14 },
  ...INSTALL_LINES.map((f, i) => ({ f, kind: i === INSTALL_LINES.length - 1 ? 'install_done' : 'line', i })),
  { f: B(30), kind: 'big_number' },
  ...INSTALL_SLOTS.map((f, i) => ({ f: f - 2, kind: 'slot', i })),
  // 更新
  ...VER_AT.slice(1).map((f, i) => ({ f, kind: 'ver', i })),
  ...STAT_AT.map((f, i) => ({ f, kind: 'stat', i })),
  // 定版
  { f: FIN.lens0, kind: 'lens_glide', dur: FIN.bloom - FIN.lens0 },
  { f: FIN.bloom, kind: 'logo_hit' },
  { f: FIN.park0, kind: 'park' },
  { f: FIN.word, kind: 'word' },
];
export const MUSIC = { src: 'bgm-tech-house.mp3', fadeFrom: B(38, 2), end: TOTAL, fps: FPS, bar: BAR_S, ducks: BIG_HITS, featStart: FEAT_START };
