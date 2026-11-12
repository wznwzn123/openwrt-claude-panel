// 3D 共用件：纹理加载（配合 Remotion 的 delayRender）、圆角 UI 板（真实面板截图裁切）、笔记本、手机、倒影。
import React, { useMemo } from 'react';
import { Sequence, staticFile } from 'remotion';
import { useOffthreadVideoTexture } from '@remotion/three';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';

import { TEX } from './preload';
// 纹理都在画布挂载前预加载好（./preload.ts），这里同步取
export const useTex = (src: string) => TEX.get(src) ?? null;

export type Crop = { x: number; y: number; w: number; h: number };
// 圆角矩形平面，UV 归一到 0..1（ShapeGeometry 默认 UV 是坐标值）
export const roundedPlane = (w: number, h: number, r: number, crop?: { u0: number; v0: number; u1: number; v1: number }) => {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ShapeGeometry(s, 12);
  const p = g.attributes.position, uv = g.attributes.uv;
  const c = crop ?? { u0: 0, v0: 0, u1: 1, v1: 1 };
  for (let i = 0; i < p.count; i++) uv.setXY(i, c.u0 + ((p.getX(i) - x) / w) * (c.u1 - c.u0), c.v0 + ((p.getY(i) - y) / h) * (c.v1 - c.v0));
  uv.needsUpdate = true;
  return g;
};

// 真实界面的「活」画面：在 [from, from+len) 这段时间播放录好的面板视频（tools/livecap.cjs），之外用静态截图
export type Live = { src: string; from: number; len: number };
const LiveMat: React.FC<{ src: string; opacity: number; color?: THREE.Color }> = ({ src, opacity, color }) => {
  const tex = useOffthreadVideoTexture({ src: staticFile(src), toneMapped: false });
  if (tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex ? <meshBasicMaterial map={tex} transparent opacity={opacity} toneMapped={false} color={color} /> : <meshBasicMaterial color="#0b0e1c" />;
};
export const Surface: React.FC<{ poster: string; live?: Live; f: number; opacity?: number; color?: THREE.Color }> = ({ poster, live, f, opacity = 1, color }) => {
  const still = useTex(poster);
  if (live && f >= live.from && f < live.from + live.len) {
    return <Sequence from={live.from} durationInFrames={live.len} layout="none"><LiveMat src={live.src} opacity={opacity} color={color} /></Sequence>;
  }
  return still ? <meshBasicMaterial map={still} transparent opacity={opacity} toneMapped={false} color={color} /> : <meshBasicMaterial color="#0b0e1c" />;
};

// UI 板：一块真实界面（整页里裁出 crop，裁切做在 UV 上，静态截图和视频都能用），宽 width，带一圈玻璃边
export const UISlab: React.FC<{
  src: string; crop: Crop; pageW?: number; pageH?: number; width: number; position?: [number, number, number]; rotation?: [number, number, number];
  opacity?: number; glow?: number; radius?: number; edge?: string; live?: Live; f?: number;
}> = ({ src, crop, pageW = 1920, pageH = 1200, width, position, rotation, opacity = 1, glow = 1, radius = 0.14, edge = '#9fb4ff', live, f = 0 }) => {
  const h = (width * crop.h) / crop.w;
  const uv = { u0: crop.x / pageW, u1: (crop.x + crop.w) / pageW, v0: 1 - (crop.y + crop.h) / pageH, v1: 1 - crop.y / pageH };
  const geo = useMemo(() => roundedPlane(width, h, radius, uv), [width, h, radius, uv.u0, uv.u1, uv.v0, uv.v1]);
  const edgeGeo = useMemo(() => roundedPlane(width + 0.08, h + 0.08, radius + 0.04), [width, h, radius]);
  return (
    <group position={position} rotation={rotation}>
      {glow > 0 && (
        <mesh geometry={edgeGeo} position={[0, 0, -0.012]}>
          <meshBasicMaterial color={edge} transparent opacity={0.55 * opacity * glow} toneMapped={false} />
        </mesh>
      )}
      <mesh geometry={geo}>
        <Surface poster={src} live={live} f={f} opacity={opacity} />
      </mesh>
    </group>
  );
};

// 笔记本：铝合金底座 + 屏幕（真实面板电脑端截图，16:10）
export const Laptop: React.FC<{ src: string; open?: number; position?: [number, number, number]; rotation?: [number, number, number]; scale?: number; screen?: number; live?: Live; f?: number }> = ({ src, open = 1, position, rotation, scale = 1, screen = 1, live, f = 0 }) => {
  const W = 3.2, SH = 2.0;
  const lid = Math.PI / 2 + (-0.22 - Math.PI / 2) * open; // 合上 +π/2（盖在底座上），打开 -0.22（往后仰一点）
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <RoundedBox args={[W, 0.09, 2.15]} radius={0.04} smoothness={4} position={[0, 0.045, 0]}>
        <meshPhysicalMaterial color="#9aa0b4" metalness={0.9} roughness={0.32} clearcoat={0.4} />
      </RoundedBox>
      <group position={[0, 0.09, -1.06]} rotation={[lid, 0, 0]}>
        <RoundedBox args={[W, SH + 0.12, 0.05]} radius={0.04} smoothness={4} position={[0, SH / 2 + 0.06, -0.026]}>
          <meshPhysicalMaterial color="#8d93a8" metalness={0.9} roughness={0.3} />
        </RoundedBox>
        <mesh position={[0, SH / 2 + 0.06, 0.001]}>
          <planeGeometry args={[W - 0.08, SH + 0.04]} />
          <meshBasicMaterial color="#05060a" />
        </mesh>
        <mesh position={[0, SH / 2 + 0.06, 0.003]}>
          <planeGeometry args={[W - 0.16, (W - 0.16) / 1.6]} />
          <Surface poster={src} live={live} f={f} color={new THREE.Color(screen, screen, screen)} />
        </mesh>
      </group>
    </group>
  );
};

// 手机：圆角机身 + 屏幕（真实面板手机端截图，390×844）
export const Phone3D: React.FC<{ src: string; position?: [number, number, number]; rotation?: [number, number, number]; scale?: number; screen?: number; live?: Live; f?: number }> = ({ src, position, rotation, scale = 1, screen = 1, live, f = 0 }) => {
  const H = 1.7, W = H * (390 / 844) + 0.08;
  const geo = useMemo(() => roundedPlane(W - 0.07, H - 0.07, 0.11), [W]);
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <RoundedBox args={[W, H + 0.08, 0.09]} radius={0.14} smoothness={6}>
        <meshPhysicalMaterial color="#2a2e3c" metalness={0.85} roughness={0.25} clearcoat={1} />
      </RoundedBox>
      <mesh geometry={geo} position={[0, 0, 0.047]}>
        <Surface poster={src} live={live} f={f} color={new THREE.Color(screen, screen, screen)} />
      </mesh>
    </group>
  );
};

// 地面的透明度：中间实、往外渐隐（不然远处地面是一道硬边的黑带，挡住后面的极光）
let _fa: THREE.CanvasTexture | null = null;
const floorAlpha = () => {
  if (_fa) return _fa;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!, grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, '#fff'); grd.addColorStop(0.35, '#fff'); grd.addColorStop(1, '#000');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  return (_fa = new THREE.CanvasTexture(c));
};
// 倒影：把子物体沿地面镜像一份，上面盖半透明地面，越远越暗
export const Reflect: React.FC<{ y: number; children: React.ReactNode; strength?: number }> = ({ y, children, strength = 0.88 }) => (
  <>
    {children}
    <group position={[0, 2 * y, 0]} scale={[1, -1, 1]}>{children}</group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <planeGeometry args={[40, 40]} />
      <meshBasicMaterial color="#05060d" transparent opacity={strength} alphaMap={floorAlpha()} fog={false} depthWrite={false} />
    </mesh>
  </>
);
