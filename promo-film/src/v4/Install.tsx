// 安装（第 28–31 小节）：一条命令；终端里逐拍出现安装脚本真实打印的步骤（install.sh 的 say / ok 文案，选的是「纯面板版·精简版」）。
// 右边：面板本身约 2 MB（README「运行要求」；cloudflared 另算，所以写「面板本身」）；不需要 Python / Node.js / Docker。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, F, glass } from '../lib/look';
import { EASE, mix, ramp, springAt } from '../lib/ease';
import { B } from './beat';
import { Keyword } from './kit';

const LINES: [number, string, 'say' | 'ok' | 'done'][] = [
  [B(28, 2), '==> 安装 纯面板版·精简版（v3.1.1）', 'say'],
  [B(28, 3), ' ✓ 依赖齐全', 'ok'],
  [B(29), '==> 复制文件', 'say'],
  [B(29, 0.5), ' ✓ 文件已就位', 'ok'],
  [B(29, 1), '==> 生成密钥', 'say'],
  [B(29, 1.5), ' ✓ 密钥已就绪', 'ok'],
  [B(29, 2), '==> 启动服务', 'say'],
  [B(29, 2.5), ' ✓ 面板服务已运行', 'ok'],
  [B(29, 3), '================ 安装完成 ================', 'done'],
];
export const INSTALL_LINES = LINES.map((l) => l[0]);
const CMD = 'sh install.sh';
const SLOTS = ['Python', 'Node.js', 'Docker'];
export const INSTALL_SLOTS = [B(30, 2), B(30, 3), B(31)];

export const Install: React.FC<{ f: number }> = ({ f }) => {
  const enter = springAt(f, B(28), { damping: 15, stiffness: 160 });
  const out = ramp(f, B(32) - 8, 8, EASE.exit);
  const typedN = Math.max(0, Math.min(CMD.length, Math.floor((f - B(28)) / 1.1)));
  const shift = ramp(f, B(30) - 4, 16, EASE.panel); // 装完后终端往左让一点
  const big = springAt(f, B(30), { damping: 13, stiffness: 150 });
  const k = SLOTS.reduce((a, _, i) => (f >= INSTALL_SLOTS[i] - 2 ? i : a), -1);
  const kp = k >= 0 ? ramp(f, INSTALL_SLOTS[k] - 2, 9, EASE.snappy) : 0;
  const app = ramp(f, B(31, 2), 12, EASE.out);
  return (
    <AbsoluteFill style={{ opacity: 1 - out, filter: out > 0.01 ? `blur(${(out * 18).toFixed(1)}px)` : undefined }}>
      <Keyword f={f} at={B(28)} out={B(32)} idx="安装" text="一条命令装好" x={140} y={96} size={76} />
      <div style={{ position: 'absolute', left: mix(140, 110, shift), top: 290, width: mix(1100, 960, shift), height: 640, ...glass({ radius: 30, fill: 0.04 }), background: 'rgba(8,10,22,0.78)', opacity: Math.min(1, enter * 1.3), transform: `translateY(${((1 - enter) * 60).toFixed(1)}px)`, padding: '36px 44px', boxSizing: 'border-box', fontFamily: F.mono, fontVariantLigatures: 'none', fontFeatureSettings: '"liga" 0, "calt" 0', fontSize: 30, lineHeight: 1.62, color: '#d6dcf5', overflow: 'hidden', whiteSpace: 'pre' }}>
        <div><span style={{ color: '#7ee787' }}>root@OpenWrt</span><span style={{ color: '#9fb4ff' }}>:~#</span> {CMD.slice(0, typedN)}{f < B(28, 2) && f % 14 < 8 ? '▍' : ''}</div>
        {LINES.map(([at, t, kind], i) => {
          if (f < at) return null;
          const p = ramp(f, at, 5, EASE.out);
          const col = kind === 'say' ? '#7fb2ff' : kind === 'ok' ? '#7ee787' : '#ffffff';
          return <div key={i} style={{ opacity: p, color: kind === 'say' ? '#d6dcf5' : col, fontWeight: kind === 'done' ? 700 : 400 }}>
            {kind === 'say' ? <><span style={{ color: col, fontWeight: 700 }}>==&gt;</span>{t.slice(3)}</> : kind === 'ok' ? <><span style={{ color: col, fontWeight: 700 }}> ✓</span>{t.slice(2)}</> : t}
          </div>;
        })}
      </div>
      {/* 右边：数字 + 不需要 */}
      {f >= B(30) - 2 && (
        <div style={{ position: 'absolute', left: 1160, top: 300, opacity: Math.min(1, big * 1.3), transform: `translateY(${((1 - big) * 50).toFixed(1)}px)` }}>
          <div style={{ fontSize: 36, color: 'rgba(228,232,255,0.72)', fontWeight: 500, letterSpacing: '0.06em' }}>面板本身约</div>
          <div style={{ fontFamily: F.mono, fontSize: 200, fontWeight: 800, color: C.text, lineHeight: 1, marginTop: 8, letterSpacing: '-0.03em' }}>2<span style={{ fontSize: 96, marginLeft: 20 }}>MB</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 56, opacity: ramp(f, INSTALL_SLOTS[0] - 4, 8, EASE.out) }}>
            <span style={{ fontSize: 52, fontWeight: 700, color: C.text }}>不需要</span>
            <span style={{ position: 'relative', display: 'inline-block', width: 300, height: 88, borderRadius: 44, overflow: 'hidden', background: 'linear-gradient(120deg,#6a4dff,#2f6bff 55%,#00c2d8)', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.35)' }}>
              {[k - 1, k].map((j) => j < 0 ? null : (
                <span key={j} style={{ position: 'absolute', left: 0, right: 0, top: 0, lineHeight: '88px', textAlign: 'center', fontSize: 48, fontWeight: 800, color: '#fff',
                  opacity: j === k ? kp : 1 - kp, transform: `translateY(${(j === k ? (1 - kp) * 60 : -kp * 60).toFixed(1)}px)` }}>{SLOTS[j]}</span>
              ))}
            </span>
          </div>
          <div style={{ marginTop: 40, fontSize: 34, color: 'rgba(228,232,255,0.72)', opacity: app, transform: `translateY(${((1 - app) * 16).toFixed(1)}px)` }}>手机加到主屏幕 · 安卓 App</div>
        </div>
      )}
    </AbsoluteFill>
  );
};
