// 3D 舞台：程序化环境光（RoomEnvironment，不依赖外部 HDR）、品牌色轮廓光、反光地面、镜头控制、后期（泛光 + 暗角）。
import React, { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshReflectorMaterial } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';

export const Env: React.FC<{ intensity?: number }> = ({ intensity = 0.35 }) => {
  const { gl, scene } = useThree();
  const tex = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const t = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    return t;
  }, [gl]);
  useLayoutEffect(() => {
    scene.environment = tex;
    (scene as any).environmentIntensity = intensity;
  }, [scene, tex, intensity]);
  return null;
};

export type Cam = { pos: [number, number, number]; look: [number, number, number]; fov?: number; roll?: number };
export const CamRig: React.FC<{ cam: Cam }> = ({ cam }) => {
  const { camera } = useThree();
  useLayoutEffect(() => {
    const c = camera as THREE.PerspectiveCamera;
    c.position.set(...cam.pos);
    c.up.set(Math.sin(cam.roll ?? 0), Math.cos(cam.roll ?? 0), 0);
    c.lookAt(...cam.look);
    if (cam.fov && c.fov !== cam.fov) { c.fov = cam.fov; }
    c.updateProjectionMatrix();
  });
  return null;
};

// 品牌色灯光：主光（偏冷白）+ 紫色、青色两道轮廓光 + 一点顶光
export const Lights: React.FC<{ k?: number; sweep?: number }> = ({ k = 1, sweep = 0 }) => (
  <>
    <ambientLight intensity={0.08 * k} />
    <spotLight position={[3 + sweep * 6, 5, 5]} angle={0.45} penumbra={1} intensity={22 * k} color="#eef2ff" decay={2} />
    <pointLight position={[-4, 1.2, -2.5]} intensity={70 * k} color="#6a4dff" decay={2} />
    <pointLight position={[4, 1.0, -2.5]} intensity={60 * k} color="#00c2d8" decay={2} />
    <pointLight position={[0, 5, -1]} intensity={14 * k} color="#2f6bff" decay={2} />
  </>
);

export const Fog: React.FC<{ near?: number; far?: number; color?: string }> = ({ near = 8, far = 22, color = '#05060d' }) => <fog attach="fog" args={[color, near, far]} />;

export const Floor: React.FC<{ y?: number; opacity?: number }> = ({ y = -0.75, opacity = 1 }) => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
    <planeGeometry args={[60, 60]} />
    <MeshReflectorMaterial blur={[400, 120]} resolution={1024} mixBlur={1} mixStrength={6} roughness={0.6} depthScale={1} minDepthThreshold={0.4} maxDepthThreshold={1.4} color="#030308" metalness={0.8} mirror={0.85} transparent opacity={opacity} />
  </mesh>
);

export const Post: React.FC<{ bloom?: number }> = ({ bloom = 1 }) => (
  <EffectComposer multisampling={4}>
    <Bloom intensity={0.9 * bloom} luminanceThreshold={0.85} luminanceSmoothing={0.25} mipmapBlur radius={0.72} />
    <Vignette offset={0.28} darkness={0.62} />
  </EffectComposer>
);
