// 全片唯一的时间表（30fps）。画面、字幕、音效钉帧、配乐结构都从这里派生。
// 速度 100 BPM：一拍 18 帧，一小节 72 帧（2.4 秒）。镜头边界都落在小节线上。
export const FPS = 30;
export const BPM = 100;
export const BEAT = 18;
export const BAR = 72;
export const bar = (n: number) => n * BAR;

export const SHOTS = {
  open: { from: bar(0), dur: bar(4) }, //   一盏灯、一根线、画出图标、片名
  why: { from: bar(4), dur: bar(4) }, //    为什么做：手机上管路由器很难 → 一块面板 → 小
  travel: { from: bar(8), dur: bar(6) }, // 时间轴：10.31 – 11.01，六个版本
  gap: { from: bar(14), dur: bar(2) }, //   11.02 – 11.06 停了五天，又接上
  rush: { from: bar(16), dur: bar(4) }, //  11.07 – 11.09 密集更新
  brake: { from: bar(20), dur: bar(2) }, // 提交长卷急刹在 v3.1.1「我的反馈」
  values: { from: bar(22), dur: bar(8) }, // 四条做事的原则
  finale: { from: bar(30), dur: bar(4) }, // 数字 + 图标定版
} as const;
export const TOTAL = bar(34); // 2448 帧 = 81.6 秒

// 节奏里最重的三下（整画面级冲击，全片只有这三处）
export const BIG_HITS = [SHOTS.rush.from, SHOTS.brake.from + 54, SHOTS.finale.from + 144];
