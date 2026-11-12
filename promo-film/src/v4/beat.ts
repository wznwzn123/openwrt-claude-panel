// v4 时间线：全部钉在配乐（video-shotcraft assets/audio/bgm/bgm-tech-house.mp3）的节拍网格上。
// 网格来自 tools/beatgrid.py（music-beat-sync.md §1–§3）：124.0 BPM，最小二乘拟合残差 p95 13 ms。
// 小节号 n%4==0 为强拍（第 32 拍 15.75 s 的镲片 + 能量跳变确认）。
// 秒一直用浮点，换算成帧只在最后一步（fr）。
import grid from '../../analysis/bgm-grid.json';

export const FPS = 30;
export const T0 = (grid as { t0: number }).t0; // 第 0 小节强拍（秒）
export const BEAT_S = (grid as { T: number }).T; // 一拍（秒）
export const BAR_S = BEAT_S * 4;

export const sec = (bar: number, beat = 0) => T0 + (bar * 4 + beat) * BEAT_S;
export const fr = (s: number) => Math.round(s * FPS);
/** 第 bar 小节第 beat 拍的帧号（beat 可以是小数：0.5 = 反拍） */
export const B = (bar: number, beat = 0) => fr(sec(bar, beat));
export const BEAT_F = BEAT_S * FPS; // ≈14.52 帧

// 段落（小节）：前奏 0–7 → 落鼓 8：功能 8–19 → 对话 20–27 → 安装 28–31 → 更新 32–35 → 定版 36–39
export const SEC = {
  intro: [0, 8], features: [8, 20], chat: [20, 28], install: [28, 32], updates: [32, 36], finale: [35.5, 40],
} as const;
export const TOTAL = B(40) + 10; // 第 40 小节强拍后再留 1/3 秒（配乐在最后两小节淡出）
// 全片三次大冲击（aesthetic-rules R4：≤3 处，间隔 ≥16 拍）：落鼓、对话段开始、定版
export const BIG_HITS = [B(8), B(20), B(36)];
