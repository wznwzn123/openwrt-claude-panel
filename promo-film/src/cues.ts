// 中央音效表：每一条都写成「镜头起点 + 镜头内偏移」，从 timeline.ts 和各场景的时间常量派生（不写裸帧号）。
// tools/dump-cues.mjs 把它导出成 out/cues.json，audio/score.py 读它合成音效和配乐。
import { SHOTS, BIG_HITS, BEAT } from './timeline';
import { T_OPEN } from './scenes/Open';
import { WHY_T, WHY_SLOT_TIMES } from './scenes/Why';
import { TRAVEL_POPS, ARRIVE } from './scenes/Travel';
import { GAP_T } from './scenes/Gap';
import { RUSH_POPS, RUSH_ARRIVE } from './scenes/Rush';
import { BRAKE_T } from './scenes/Brake';
import { VALUES_T, VALUE_LEN } from './scenes/Values';
import { FIN_T } from './scenes/Finale';

export type Cue = { f: number; kind: string; note?: string; gain?: number; dur?: number; i?: number };
const S = SHOTS;
const c: Cue[] = [];
const add = (f: number, kind: string, extra: Partial<Cue> = {}, note?: string) => c.push({ f, kind, note, ...extra });

// 开场
add(S.open.from + T_OPEN.led, 'led_on', {}, '绿灯亮起');
add(S.open.from + T_OPEN.type0, 'typing', { dur: 24 }, '打出 2026.10.31 11:01');
add(S.open.from + T_OPEN.nibOut + 4, 'hop', {}, '笔头从灯里跳出');
add(S.open.from + T_OPEN.draw1, 'draw_riser', { dur: T_OPEN.draw1 - T_OPEN.draw0 }, '一笔画图标（声音在画完时收束）');
add(S.open.from + T_OPEN.draw1 + 4, 'dots', {}, '第二个灯和横杠弹出');
add(S.open.from + T_OPEN.title, 'title', {}, '片名「一根线」');
// 第二段
add(S.why.from + 26, 'whoosh_soft', { dur: 40 }, '线围出窗口');
add(S.why.from + WHY_T.draw1, 'ding', {}, '窗口闭合');
add(S.why.from + WHY_T.reveal + 12, 'swoosh_reveal', {}, '真实面板显影');
add(S.why.from + WHY_T.park0 + 16, 'whoosh_soft', { dur: 30 }, '窗口退到右边');
WHY_SLOT_TIMES.forEach((t, i) => add(S.why.from + t, 'slot', { i }, '词槽滚一格'));
// 时间轴
add(S.travel.from + 12, 'whoosh_soft', { dur: 24 }, '线接进来变成时间轴');
TRAVEL_POPS.forEach((t, i) => add(S.travel.from + t, 'pop', { i }, '版本卡弹立'));
ARRIVE.slice(1).forEach((t) => add(S.travel.from + t - 15, 'move', {}, '相机横移'));
// 停更五天
for (let i = 0; i < 5; i++) add(S.gap.from + GAP_T.day0 + i * GAP_T.dayStep, 'day_tick', { i }, '一天过去');
GAP_T.sparks.forEach((t, i) => add(S.gap.from + t, 'spark', { i }, '笔头闪一下'));
add(S.rush.from, 'relit_riser', { dur: S.rush.from - (S.gap.from + GAP_T.sparks[0]) }, '重新点亮前的上扬');
// 密集更新
add(BIG_HITS[0], 'big_hit', {}, '大冲击 1：重新接上');
RUSH_POPS.forEach((t, i) => add(S.rush.from + t, 'pop_fast', { i }, '版本卡弹立'));
RUSH_ARRIVE.slice(1).forEach((t) => add(S.rush.from + t - 9, 'move_fast', {}, '相机冲刺'));
// 提交长卷急刹
add(BIG_HITS[1], 'scroll_riser', { dur: BRAKE_T.s1 - BRAKE_T.s0 }, '长卷高速滚动');
add(BIG_HITS[1], 'brake_hit', {}, '大冲击 2：急刹停在第 94 次提交');
add(S.brake.from + BRAKE_T.card + 4, 'swoosh_reveal', {}, '「我的反馈」浮出');
add(S.brake.from + BRAKE_T.trace0, 'pen', { dur: BRAKE_T.trace1 - BRAKE_T.trace0 }, '线描三段进度');
add(S.brake.from + BRAKE_T.trace1, 'ding', {}, '描完');
// 四条原则
for (let i = 0; i < 4; i++) {
  const b = S.values.from + i * VALUE_LEN;
  add(b + VALUES_T.say + 2, 'statement', { i }, '大字');
  add(b + VALUES_T.under0, 'pen', { dur: VALUES_T.under1 - VALUES_T.under0 }, '下划线');
  add(b + VALUES_T.ev + 6, 'swoosh_reveal', {}, '证据出现');
  if (i !== 2 && i !== 3) add(b + VALUES_T.trace0, 'pen', { dur: VALUES_T.trace1 - VALUES_T.trace0 }, '线框住证据');
  if (i === 1) { add(b + 46, 'typing', { dur: 40 }, '终端里打出那句问话'); add(b + 100, 'confirm', {}, '没有上报。'); }
  if (i === 2) { add(b + 48, 'pen', { dur: 22 }, '划掉做不到的说法'); add(b + 72, 'ding', {}, '如实写出'); add(b + 92, 'confirm', {}, '加密上线'); }
  if (i === 3) for (let k = 0; k < 5; k++) add(b + 34 + k * 10, 'tick', { i: k }, '更新说明一行行出现');
  add(b + VALUES_T.out + 2, 'whoosh_out', {}, '换下一条');
}
// 收尾
for (let i = 0; i < 4; i++) add(S.finale.from + FIN_T.stats + 10 + i * 6, 'roll', { i }, '数字滚动');
add(BIG_HITS[2], 'draw_riser', { dur: FIN_T.draw1 - FIN_T.draw0 }, '再画一次图标');
add(BIG_HITS[2], 'logo_hit', {}, '大冲击 3：真实图标亮起');
add(S.finale.from + FIN_T.park0 + 8, 'whoosh_soft', { dur: 30 }, '图标左移');
add(S.finale.from + FIN_T.word, 'word', {}, '字标');
add(S.finale.from + FIN_T.tag, 'ding', {}, '线还在，接着写。');

export const CUES = c.sort((a, b) => a.f - b.f);
export const MUSIC = { bpm: 100, beatFrames: BEAT, shots: S, bigHits: BIG_HITS };
