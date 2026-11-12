// 更新段（第 32–35 小节）——3D 时间轴：十天铺在纵深方向，镜头贴着轴往里飞。
// 94 次提交是轴上的发光小柱（git 历史，北京时间），20 个版本标签按时间立在两侧；播放头每半拍跳到下一个版本。
// 11.02–11.06 没有提交，那一段轴是虚线。第 34 小节第 2 拍镜头升起，俯看整条十天。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { LABEL, labelKey } from './three/preload';
import commits from '../data/commits.json';
import { EASE, mix, ramp, springAt } from '../lib/ease';
import { B } from '../v4/beat';
import { Key } from './three/camkeys';
import { Dust } from './FeatWorld';
const DUST_BOX: [number, number, number, number, number, number] = [-7, 7, -2.5, 5, -55, 6];

export const VERS: [string, string][] = [
  ['v1.0', '10.31 11:01'], ['v1.1', '10.31 16:08'], ['v1.2', '10.31 21:26'], ['v1.3.0', '11.01 02:12'], ['v1.3.1', '11.01 03:14'],
  ['v2.0', '11.01 11:41'], ['v2.0.1', '11.01 15:22'], ['v2.0.2', '11.01 16:06'], ['v2.0.3', '11.01 17:17'], ['v2.0.4', '11.07 02:14'],
  ['v2.0.5', '11.07 02:37'], ['v2.0.6', '11.07 09:29'], ['v2.0.7', '11.07 10:56'], ['v2.0.8', '11.07 15:32'], ['v3.0', '11.07 16:40'],
  ['v3.0.1', '11.08 01:10'], ['v3.0.2', '11.08 09:52'], ['v3.0.3', '11.08 11:15'], ['v3.1.0', '11.08 23:14'], ['v3.1.1', '11.09 01:29'],
];
export const VER_AT = VERS.map((_, i) => B(32, i * 0.5));
export const OVER = B(34, 2); // 升起俯看
const DZ = 5; // 一天 = 5 单位纵深
const days = (t: string) => { const [md, hm] = t.split(' '); const [mo, d] = md.split('.').map(Number); const [h, m] = hm.split(':').map(Number); return (mo === 10 ? d - 31 : d) + (h + m / 60) / 24; };
const Z = (t: string) => -days(t) * DZ;
const AXY = -0.6;
const TICKS = (() => { const seen: Record<number, number> = {}; return (commits as { t: string }[]).map((c) => { const z = Z(c.t), b = Math.round(z / 0.32); const k = (seen[b] = (seen[b] ?? -1) + 1); return { z, k }; }); })();

// 播放头位置（z）：在两次翻版本之间按时间平滑过去
export const playZ = (f: number) => {
  let k = 0; VER_AT.forEach((a, i) => { if (f >= a) k = i; });
  if (f < VER_AT[0]) return Z(VERS[0][1]) + 2;
  if (k >= VERS.length - 1) return Z(VERS[VERS.length - 1][1]);
  return mix(Z(VERS[k][1]), Z(VERS[k + 1][1]), ramp(f, VER_AT[k], VER_AT[k + 1] - VER_AT[k], EASE.smooth));
};
export const updCam = (f: number) => {
  const z = playZ(f);
  const fly = { pos: [1.6, 1.1, z + 5.2] as [number, number, number], look: [0.0, -0.3, z - 6] as [number, number, number], fov: 34, roll: 0 };
  const up = ramp(f, OVER - 4, 26, EASE.panel);
  if (up <= 0) return fly;
  const ov = { pos: [9.5, 11, -14] as [number, number, number], look: [0, AXY, -26] as [number, number, number] };
  const l = (a: number[], b: number[]) => a.map((x, i) => mix(x, b[i], up)) as [number, number, number];
  return { pos: l(fly.pos, ov.pos), look: l(fly.look, ov.look), fov: mix(34, 40, up), roll: 0 };
};
export const UPD_KEYS: Key[] = []; // 镜头由 updCam 直接算

const Label: React.FC<{ i: number; f: number }> = ({ i, f }) => {
  const [v, t] = VERS[i];
  const tex = LABEL.get(labelKey(v, t));
  // 只显示当前版本（立在播放头正上方），翻到下一个时旧的缩小淡出
  const p = springAt(f, VER_AT[i] - 3, { damping: 14, stiffness: 200 });
  const gone = i < VERS.length - 1 ? ramp(f, VER_AT[i + 1] - 4, 5, EASE.swift) : ramp(f, OVER, 10, EASE.swift);
  if (!tex || gone >= 1) return null;
  const s = mix(0.6, 1, Math.min(1, p)) * mix(1, 0.7, gone);
  return (
    <mesh position={[0.15, 0.35 + mix(-0.3, 0, Math.min(1, p)) + gone * 0.8, Z(t)]} scale={[s, s, 1]}>
      <planeGeometry args={[1.6, 0.5]} />
      <meshBasicMaterial map={tex} transparent opacity={Math.min(1, p) * (1 - gone)} toneMapped={false} />
    </mesh>
  );
};

export const UpdWorld: React.FC<{ f: number }> = ({ f }) => {
  const pz = playZ(f);
  const zEnd = -10 * DZ;
  const gap0 = Z('11.01 17:28'), gap1 = Z('11.07 01:26');
  const solid = (a: number, b: number) => (
    <mesh position={[0, AXY, (a + b) / 2]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.018, 0.018, Math.abs(a - b), 8]} /><meshBasicMaterial color="#c9d6ff" toneMapped={false} /></mesh>
  );
  const dashes = useMemo(() => { const out: number[] = []; for (let z = gap0 - 0.3; z > gap1 + 0.3; z -= 0.9) out.push(z); return out; }, [gap0, gap1]);
  return (
    <group>
      {solid(2, gap0)}
      {dashes.map((z) => <mesh key={z} position={[0, AXY, z - 0.2]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.014, 0.014, 0.4, 6]} /><meshBasicMaterial color="#7d88b0" toneMapped={false} /></mesh>)}
      {solid(gap1, zEnd)}
      {/* 日刻度 */}
      {Array.from({ length: 11 }, (_, d) => <mesh key={d} position={[0, AXY, -d * DZ]}><boxGeometry args={[0.9, 0.012, 0.012]} /><meshBasicMaterial color={d >= 2 && d <= 6 ? '#55607f' : '#9fb0e0'} toneMapped={false} /></mesh>)}
      {/* 提交：发光小柱，播放头走过就亮 */}
      {TICKS.map((t, i) => {
        const lit = t.z >= pz - 0.05;
        return (
          <mesh key={i} position={[0.22, AXY + 0.05 + t.k * 0.075, t.z]}>
            <boxGeometry args={[0.035, 0.05, 0.035]} />
            <meshBasicMaterial color={lit ? '#ffffff' : '#3a4366'} toneMapped={false} />
          </mesh>
        );
      })}
      {/* 播放头 */}
      <mesh position={[0, AXY, pz]}><sphereGeometry args={[0.09, 24, 24]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
      <mesh position={[0, AXY, pz]}><sphereGeometry args={[0.15, 24, 24]} /><meshBasicMaterial color="#7fb2ff" transparent opacity={0.3} toneMapped={false} /></mesh>
      {VERS.map((_, i) => (f >= VER_AT[i] - 3 ? <Label key={i} i={i} f={f} /> : null))}
      <Dust f={f} box={DUST_BOX} />
    </group>
  );
};
