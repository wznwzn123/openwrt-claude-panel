// 镜头关键帧：位置 / 注视点 / 焦距 / 侧倾，在相邻两帧之间按缓动插值
import { EASE } from '../../lib/ease';
import type { Cam } from './Stage';

export type Key = { f: number; pos: [number, number, number]; look: [number, number, number]; fov?: number; roll?: number; ease?: (t: number) => number };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const l3 = (a: number[], b: number[], t: number) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)] as [number, number, number];

export const camAt = (keys: Key[], f: number): Cam => {
  if (f <= keys[0].f) return { pos: keys[0].pos, look: keys[0].look, fov: keys[0].fov ?? 30, roll: keys[0].roll ?? 0 };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (f <= b.f) {
      const t = (b.ease ?? EASE.smooth)((f - a.f) / Math.max(1, b.f - a.f));
      return { pos: l3(a.pos, b.pos, t), look: l3(a.look, b.look, t), fov: lerp(a.fov ?? 30, b.fov ?? 30, t), roll: lerp(a.roll ?? 0, b.roll ?? 0, t) };
    }
  }
  const z = keys[keys.length - 1];
  return { pos: z.pos, look: z.look, fov: z.fov ?? 30, roll: z.roll ?? 0 };
};
