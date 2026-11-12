// 功能段（第 8–19 小节）——3D：六块真实界面（电脑端截图裁切，演示数据）漂在空间里，后面是整页界面的淡影和浮尘。
// 镜头每两小节一站：站内缓推，换站在强拍上甩过去（中点落拍，带侧倾）；第 3 拍，发光描边沿要看的那一块画一圈。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { EASE, mix, ramp } from '../lib/ease';
import { B, BEAT_F } from '../v4/beat';
import { Crop, UISlab } from './three/kit3d';
import { Key } from './three/camkeys';
import L1 from '../../public/ui/layout.json';
import L2 from '../../public/ui/layout-v4.json';

const L: any = { ...(L1 as any), ...(L2 as any) };
const pad = (r: Crop, p = 10): Crop => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });
const SPEED_BOX: Crop = { x: L['desk-speed'].stnums.x, y: L['desk-speed'].stnums.y, w: L['desk-speed'].stnums.w / 2 - 5, h: L['desk-speed'].stnums.h };

type Station = { word?: string; page: string; crop: Crop; ring?: Crop; at: number; end: number };
export const STATIONS: Station[] = [
  { word: '实时网速', page: 'desk-home', crop: pad(L['desk-home'].live), ring: L['desk-home'].live, at: B(8), end: B(10) },
  { word: '设备管理', page: 'desk-dev', crop: { x: 512, y: 180, w: 1168, h: 640 }, ring: L['desk-dev'].cards[1], at: B(10), end: B(12) },
  { word: '定时断网', page: 'desk-pause', crop: pad(L['desk-pause'].modal), ring: L['desk-pause'].kv, at: B(12), end: B(14) },
  { word: '每日体检', page: 'desk-wd', crop: pad(L['desk-wd'].dy), ring: L['desk-wd'].dyhead, at: B(14), end: B(16) },
  { word: '网速测试', page: 'desk-speed', crop: pad(L['desk-speed'].cards[0]), ring: SPEED_BOX, at: B(16), end: B(18) },
  { word: '终端 · 文件', page: 'desk-term', crop: { x: 522, y: 80, w: 1148, h: 330 }, at: B(18), end: B(19) },
  { page: 'desk-files', crop: { x: 512, y: 70, w: 1168, h: 560 }, at: B(19), end: B(20) },
];
const SW = 5.0; // 界面板宽
const SX = (i: number) => i * 9;
const ROT = (i: number) => (i % 2 ? -0.14 : 0.14);
const WHIP = 14;

// 镜头：每站从左后方缓推；界面板在画面右侧约六成宽，左边留给关键词
const stationCam = (i: number, t: number) => {
  const x = SX(i);
  return { pos: [x - 1.6 + mix(0.5, -0.2, t), mix(0.4, 0.22, t), mix(8.9, 7.9, t)] as [number, number, number], look: [x - 1.6, 0.12, 0] as [number, number, number] };
};
export const FEAT_KEYS: Key[] = (() => {
  const K: Key[] = [];
  STATIONS.forEach((s, i) => {
    const a = stationCam(i, 0), b = stationCam(i, 1);
    const f0 = i === 0 ? s.at : s.at + WHIP / 2, f1 = i === STATIONS.length - 1 ? s.end - 10 : s.end - WHIP / 2;
    K.push({ f: f0, pos: a.pos, look: a.look, fov: 30, roll: 0, ease: EASE.panel });
    K.push({ f: f1, pos: b.pos, look: b.look, fov: 30, roll: 0, ease: EASE.linear });
  });
  // 收尾：最后 10 帧冲进界面板（下一拍是大冲击）
  const z = STATIONS.length - 1, x = SX(z);
  K.push({ f: B(20), pos: [x + 0.4, 0.15, 1.6], look: [x + 0.4, 0.1, 0], fov: 34, ease: EASE.exit });
  return K;
})();
// 甩镜时的侧倾（只在甩镜期间）
export const featRoll = (f: number) => {
  for (const s of STATIONS.slice(1)) { const k = (f - (s.at - WHIP / 2)) / WHIP; if (k >= 0 && k <= 1) return Math.sin(k * Math.PI) * 0.06; }
  return 0;
};

// 发光描边：沿圆角矩形走一圈（界面板坐标里）
const RingRect: React.FC<{ w: number; h: number; p: number }> = ({ w, h, p }) => {
  const geo = useMemo(() => {
    const r = Math.min(0.08, h / 3), x = -w / 2, y = -h / 2, pts: THREE.Vector3[] = [];
    const arc = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 8; i++) { const a = a0 + (i / 8) * (Math.PI / 2); pts.push(new THREE.Vector3(cx + r * Math.cos(a), cy + r * Math.sin(a), 0)); } };
    arc(x + r, y + h - r, Math.PI / 2); arc(x + r, y + r, Math.PI); arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + h - r, 0); pts.push(pts[0].clone());
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0), 240, 0.012, 6, false);
  }, [w, h]);
  geo.setDrawRange(0, Math.floor((geo.index!.count * Math.max(0, Math.min(1, p))) / 6) * 6);
  return <mesh geometry={geo}><meshBasicMaterial color="#8fc0ff" toneMapped={false} /></mesh>;
};

export const Dust: React.FC<{ f: number; box?: [number, number, number, number, number, number] }> = ({ f, box = [-6, 60, -3, 4, -8, 6] }) => {
  const geo = useMemo(() => {
    const n = 700, a = new Float32Array(n * 3);
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) { a[i * 3] = box[0] + rnd() * (box[1] - box[0]); a[i * 3 + 1] = box[2] + rnd() * (box[3] - box[2]); a[i * 3 + 2] = box[4] + rnd() * (box[5] - box[4]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); return g;
  }, [box]);
  return <points geometry={geo} position={[0, Math.sin(f / 90) * 0.1, 0]}><pointsMaterial size={0.035} color="#b7c8ff" transparent opacity={0.55} sizeAttenuation toneMapped={false} /></points>;
};

export const FeatWorld: React.FC<{ f: number }> = ({ f }) => (
  <group>
    <Dust f={f} />
    {STATIONS.map((s, i) => {
      const x = SX(i), h = (SW * s.crop.h) / s.crop.w;
      const appear = ramp(f, s.at - WHIP, WHIP, EASE.out);
      const rp = ramp(f, s.at + 2 * BEAT_F, 12, EASE.out);
      return (
        <group key={i} position={[x, 0, 0]} rotation={[0, ROT(i), 0]}>
          {/* 后面：整页界面的淡影（给空间纵深） */}
          <UISlab src={`ui/${s.page}.png`} crop={{ x: 0, y: 0, w: 1920, h: 1200 }} width={11} position={[0.5, 0.2, -3.2]} opacity={0.14} glow={0} radius={0.3} />
          <group position={[0, 0, mix(-1.2, 0, appear)]}>
            <UISlab src={`ui/${s.page}.png`} crop={s.crop} width={SW} opacity={Math.max(0.15, appear)} />
            {s.ring && rp > 0 && (() => {
              const r = s.ring, k = SW / s.crop.w, pw = 10;
              const cx = (r.x + r.w / 2 - (s.crop.x + s.crop.w / 2)) * k, cy = -((r.y + r.h / 2) - (s.crop.y + s.crop.h / 2)) * k;
              return <group position={[cx, cy, 0.02]}><RingRect w={(r.w + pw * 2) * k} h={(r.h + pw * 2) * k} p={rp} /></group>;
            })()}
          </group>
        </group>
      );
    })}
  </group>
);
export const FEAT_SLAB_H = (i: number) => (SW * STATIONS[i].crop.h) / STATIONS[i].crop.w;
