// 对话段（第 20–27 小节）的 3D 部分：路由器特写在画面右侧，跟着对话起反应——
// 调用工具时灯闪一下；「把访客 Wi-Fi 关了」确认、修改配置完成后，外圈信号弧熄灭（闪一下再灭）。
import React from 'react';
import { EASE, ramp } from '../lib/ease';
import { B } from '../v4/beat';
import { Router } from './three/Router';
import { Reflect } from './three/kit3d';
import { Key } from './three/camkeys';

export const CHAT_KEYS: Key[] = [
  { f: B(20) - 2, pos: [-6.4, 2.2, 13.6], look: [-3.0, 1.15, 0], fov: 28 },
  { f: B(20) + 10, pos: [-5.9, 2.0, 12.6], look: [-2.9, 1.1, 0], fov: 28, ease: EASE.snappy },
  { f: B(28), pos: [-4.8, 2.1, 12.0], look: [-2.8, 1.1, 0], fov: 28, ease: EASE.linear },
];
export const ARC_OFF = B(26) + 10; // 「修改配置」完成的那一帧

export const ChatWorld: React.FC<{ f: number }> = ({ f }) => {
  const hit = (a: number) => (f >= a ? Math.max(0, 1 - (f - a) / 12) : 0);
  const pulse = Math.max(hit(B(21)), hit(B(21) + 7), hit(B(26)));
  const off = ramp(f, ARC_OFF + 3, 8, EASE.swift);
  const flare = f >= ARC_OFF && f < ARC_OFF + 3 ? 2.2 : 1;
  return (
    <Reflect y={-0.5}>
      <Router position={[0, 0, 0]} rotation={[0, -0.32, 0]} pulse={pulse} arc2={(1 - off * 0.94) * flare} />
    </Reflect>
  );
};

// 安装段（第 28–31 小节）：右边一台「新」路由器——安装脚本每完成一步，灯亮一分；「安装完成」那一拍两道信号弧画出来；
// 第 30 小节镜头往左摇开，把右边让给数字。
export const INSTALL_KEYS: Key[] = [
  { f: B(28) - 2, pos: [-5.2, 2.1, 15.0], look: [-2.65, 1.0, 0], fov: 28 },
  { f: B(29, 3), pos: [-4.8, 1.9, 14.2], look: [-2.6, 1.0, 0], fov: 28, ease: EASE.linear },
  { f: B(30) + 12, pos: [-4.6, 1.9, 14.0], look: [-7.5, 1.0, 0], fov: 28, ease: EASE.panel },
  { f: B(32), pos: [-4.5, 1.9, 13.9], look: [-7.8, 1.0, 0], fov: 28 },
];
export const InstallWorld: React.FC<{ f: number; lines: number[] }> = ({ f, lines }) => {
  const okAt = [lines[1], lines[3], lines[5], lines[7]];
  const led = okAt.reduce((a, t) => a + (f >= t ? 0.25 : 0), 0);
  const done = lines[lines.length - 1];
  const arcDraw = ramp(f, done, 12, EASE.out);
  const pulse = okAt.concat([done]).reduce((a, t) => Math.max(a, f >= t ? Math.max(0, 1 - (f - t) / 8) : 0), 0);
  return (
    <Reflect y={-0.5}>
      <Router position={[0, 0, 0]} rotation={[0, -0.32, 0]} led={0.15 + led * 0.85} pulse={pulse} arcDraw={arcDraw} arc1={arcDraw > 0 ? 1 : 0} arc2={arcDraw > 0.3 ? 1 : 0} />
    </Reflect>
  );
};
