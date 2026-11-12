// 冷开场（第 0–7 小节）——3D：
//  0–2  黑场。微距贴着路由器正面：第一颗灯随强拍亮起，镜头沿机身横移，一道光扫过机身
//  2–4  镜头拉开、升高，两道信号弧被画出来（产品图标的轮廓在 3D 里成形）；片名出现
//  4–6  笔记本和手机从两侧滑进来，屏幕亮起真实面板；两道光流从路由器连到两台设备
//  6–8  镜头一路推进笔记本屏幕，第 8 小节落鼓时屏幕占满画面 → 接功能段
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { EASE, mix, ramp } from '../lib/ease';
import { B, BEAT_F } from '../v4/beat';
import { Router } from './three/Router';
import { Laptop, Phone3D, Reflect } from './three/kit3d';
import { Key } from './three/camkeys';

const FLOOR = -0.5;
const LAP = { pos: new THREE.Vector3(-4.0, FLOOR, 0.3), rotY: 0.38 };
const PHO = { pos: new THREE.Vector3(3.7, FLOOR + 0.89, 0.6), rotY: -0.32 };
// 笔记本屏幕中心和法线（世界坐标）：铰链 (0,0.09,-1.06)，屏幕往后仰 0.22 rad
const lapScreen = (() => {
  const a = -0.22, local = new THREE.Vector3(0, 0.09 + 1.06 * Math.cos(a), -1.06 + 1.06 * Math.sin(a));
  const n = new THREE.Vector3(0, -Math.sin(a), Math.cos(a));
  const e = new THREE.Euler(0, LAP.rotY, 0);
  return { c: local.applyEuler(e).add(LAP.pos), n: n.applyEuler(e).normalize() };
})();
const v = (p: THREE.Vector3): [number, number, number] => [p.x, p.y, p.z];
const fill = lapScreen.c.clone().add(lapScreen.n.clone().multiplyScalar(3.05)); // 屏幕正好占满 16:9 画面（fov 30）

export const OPEN_KEYS: Key[] = [
  { f: 0, pos: [-3.3, 0.38, 3.4], look: [-0.5, 0.0, 1.15], fov: 24 },
  { f: B(2), pos: [2.3, 0.42, 3.1], look: [0.35, 0.0, 1.15], fov: 24, ease: EASE.linear },
  { f: B(3, 2), pos: [0.2, 1.2, 10.0], look: [0, 0.55, 0], fov: 26, ease: EASE.panel },
  { f: B(4), pos: [0.1, 1.25, 10.6], look: [0, 0.55, 0], fov: 26 },
  { f: B(5, 2), pos: [0, 2.6, 12.5], look: [0, 0.55, 0], fov: 30, ease: EASE.panel },
  { f: B(6, 2), pos: [-0.8, 2.2, 10.5], look: [-1.2, 0.6, -0.2], fov: 30 },
  { f: B(8), pos: v(fill), look: v(lapScreen.c), fov: 30, ease: EASE.exit },
];

const arcCurve = (a: THREE.Vector3, b: THREE.Vector3, h: number) => new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, h, 0)), b);
const Stream: React.FC<{ curve: THREE.Curve<THREE.Vector3>; p: number; f: number; color: string }> = ({ curve, p, f, color }) => {
  const geo = useMemo(() => new THREE.TubeGeometry(curve, 160, 0.014, 8, false), [curve]);
  geo.setDrawRange(0, Math.floor((geo.index!.count * Math.max(0, Math.min(1, p))) / 6) * 6);
  // 光点：每拍发一颗，沿线跑完用一拍半
  const pulses = [0, 1, 2, 3].map((k) => {
    const t = ((f / BEAT_F + k * 0.37) % 1.5) / 1.5;
    return t <= p ? curve.getPoint(t) : null;
  });
  return (
    <group>
      <mesh geometry={geo}><meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.85} /></mesh>
      {pulses.map((q, i) => q && (
        <mesh key={i} position={q}><sphereGeometry args={[0.045, 16, 16]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
      ))}
    </group>
  );
};

export const OpenWorld: React.FC<{ f: number }> = ({ f }) => {
  const led = ramp(f, B(0), 4, EASE.out) * (f < B(0, 2) ? (Math.floor((f - B(0)) / (BEAT_F / 2)) % 2 === 0 ? 1 : 0.25) : 1);
  const arcDraw = ramp(f, B(2), B(3) - B(2), EASE.smooth);
  const lapUp = ramp(f, B(4), 22, EASE.panel), phoUp = ramp(f, B(4, 2), 22, EASE.panel);
  const scr = ramp(f, B(5), 12, EASE.out);
  const streams = ramp(f, B(5, 1), BEAT_F * 3, EASE.smooth);
  // 两台设备从画面两侧滑进来（地面有倒影，不能从地面下面升起）
  const lapP = LAP.pos.clone().add(new THREE.Vector3(mix(-6, 0, lapUp), 0, mix(1.5, 0, lapUp)));
  const phoP = PHO.pos.clone().add(new THREE.Vector3(mix(6, 0, phoUp), 0, mix(1.5, 0, phoUp)));
  const top = new THREE.Vector3(0, 1.3, 0);
  const c1 = useMemo(() => arcCurve(top, lapScreen.c, 2.2), []);
  const c2 = useMemo(() => arcCurve(top, new THREE.Vector3(PHO.pos.x - 0.1, PHO.pos.y + 0.3, PHO.pos.z + 0.1), 2.0), []);
  const content = (
    <group>
      <Router position={[0, 0, 0]} led={led} arcDraw={arcDraw} arc1={arcDraw > 0 ? 1 : 0} arc2={arcDraw > 0.4 ? 1 : 0} pulse={Math.max(0, 1 - (f - B(4)) / 10) * (f >= B(4) ? 1 : 0)} />
      {lapUp > 0 && <Laptop src="ui/desk-home.png" position={v(lapP)} rotation={[0, LAP.rotY, 0]} screen={scr} />}
      {phoUp > 0 && <Phone3D src="ui/home-dark-full.png" position={v(phoP)} rotation={[0, PHO.rotY, 0]} screen={scr} />}
    </group>
  );
  return (
    <group>
      <Reflect y={FLOOR}>{content}</Reflect>
      {streams > 0 && <Stream curve={c1} p={streams} f={f} color="#7fb2ff" />}
      {streams > 0 && <Stream curve={c2} p={streams} f={f} color="#b98cff" />}
    </group>
  );
};
