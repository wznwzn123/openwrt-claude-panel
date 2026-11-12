// 产品主角：按产品图标（src/www/panel/icon.svg）造型的 3D 路由器——白色陶瓷机身、正面两颗蓝灯 + 一道灯条，上方两道信号弧。
// 单位：机身宽 3.4。原点在机身中心。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';

const W = 3.4, H = 1.0, D = 2.3, R = 0.3;
// 图标 32 网格：机身 x 7.5..24.5（宽 17）→ 3.4 单位，1 格 = 0.2；机身中心 (16, 19.75)
const g = 0.2;
const arcPts = (r: number, n = 64) => Array.from({ length: n + 1 }, (_, i) => {
  const a = (-135 + (90 * i) / n) * (Math.PI / 180);
  return new THREE.Vector3(Math.cos(a) * r * g, -Math.sin(a) * r * g, 0);
});

export const Router: React.FC<{
  led?: number; arc1?: number; arc2?: number; body?: number; arcDraw?: number; pulse?: number; position?: [number, number, number]; rotation?: [number, number, number]; scale?: number;
}> = ({ led = 1, arc1 = 1, arc2 = 1, body = 1, arcDraw = 1, pulse = 0, position, rotation, scale = 1 }) => {
  const tube1 = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPts(6.8)), 96, 0.06, 16, false), []);
  const tube2 = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPts(10.8)), 128, 0.06, 16, false), []);
  const draw = (geo: THREE.TubeGeometry, p: number) => { geo.setDrawRange(0, Math.floor(geo.index!.count * Math.max(0, Math.min(1, p)) / 6) * 6); return geo; };
  const ledCol = new THREE.Color('#3b7bff');
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <RoundedBox args={[W, H, D]} radius={R} smoothness={8}>
        <meshPhysicalMaterial color="#1a1c26" roughness={0.38} metalness={0.55} clearcoat={1} clearcoatRoughness={0.12} iridescence={0.25} iridescenceIOR={1.3} transparent={body < 1} opacity={body} />
      </RoundedBox>
      {/* 正面：两颗灯 + 灯条（图标 (11.4,19.75)、(14.6,19.75)、横杠 18→21.4） */}
      <group position={[0, 0, D / 2 + 0.002]}>
        {[11.4, 14.6].map((x, i) => (
          <group key={x} position={[(x - 16) * g, 0, 0]}>
          <mesh position={[0, 0, -0.001]}>
            <circleGeometry args={[0.85 * g, 48]} />
            <meshPhysicalMaterial color="#05060c" roughness={0.15} metalness={0.2} clearcoat={1} />
          </mesh>
          <mesh>
            <circleGeometry args={[0.42 * g, 40]} />
            <meshStandardMaterial color="#0d1440" emissive={ledCol} emissiveIntensity={(i === 0 ? 9 * led : 6 * led) * (1 + 1.2 * pulse)} toneMapped={false} />
          </mesh>
          </group>
        ))}
        <mesh position={[(19.7 - 16) * g, 0, 0]}>
          <planeGeometry args={[3.0 * g, 0.5 * g]} />
          <meshStandardMaterial color="#0d1440" emissive={ledCol} emissiveIntensity={3.5 * led} toneMapped={false} />
        </mesh>
      </group>
      {/* 信号弧：圆心在图标 (16, 17.45)，即机身中心上方 2.3 格 = 0.46 */}
      <group position={[0, (19.75 - 17.45) * g, 0]}>
        <mesh geometry={draw(tube1, arcDraw)}>
          <meshStandardMaterial color="#ffffff" emissive="#9db8ff" emissiveIntensity={2.4 * arc1} toneMapped={false} transparent opacity={Math.min(1, arc1 * 1.5)} />
        </mesh>
        <mesh geometry={draw(tube2, arcDraw)}>
          <meshStandardMaterial color="#ffffff" emissive="#7d6bff" emissiveIntensity={1.8 * arc2} toneMapped={false} transparent opacity={Math.min(1, arc2 * 1.2) * 0.85} />
        </mesh>
      </group>
    </group>
  );
};
export const ROUTER_DIMS = { W, H, D };
