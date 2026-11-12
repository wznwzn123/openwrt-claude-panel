// 试验：3D 路由器 + 舞台 + 后期，量单帧耗时和画面质量
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { Router } from './three/Router';
import { CamRig, Env, Floor, Fog, Lights, Post } from './three/Stage';

export const Spike: React.FC = () => {
  const f = useCurrentFrame();
  const a = f / 60;
  return (
    <AbsoluteFill style={{ background: '#05060d' }}>
      <ThreeCanvas width={1920} height={1080} gl={{ antialias: true, alpha: true }} camera={{ fov: 22, near: 0.1, far: 100 }}>
        <CamRig cam={{ pos: [Math.sin(a) * 10, 1.4, Math.cos(a) * 10], look: [0, 0.9, 0] }} />
        <Env intensity={0.6} />
        <Fog near={7} far={16} />
        <Lights />
        <Router position={[0, 0, 0]} />
        <Floor y={-0.5} />
        <Post />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
