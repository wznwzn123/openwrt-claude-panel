// 收尾（288f）：四个数字（全部来自 git 历史）→ 线再一笔画出图标 → 真实图标在线后面亮起（全片第三次大冲击）
// → 图标左移，字标和一句话落定，hold 到结束。
// 镜头卡：DigitRoll（video-shotcraft assets/lib）、ui-to-brand-morph（线稿 → 品牌标志）、R1 字标落定 hold ≥1s。
import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { C, F, Rise, glass } from '../lib/look';
import { EASE, mix, ramp, springAt } from '../lib/ease';
import { DigitRoll } from '../lib/DigitRoll';
import { NibDefs, Poly, Stroke, iconPath } from '../lib/thread';
import { Led, LedDefs } from './Open';

// bloom = 144 = 第 32 小节的强拍（全片第三次、也是最后一次整画面冲击）
export const FIN_T = { stats: 6, statsOut: 80, draw0: 88, draw1: 144, bloom: 144, park0: 170, park1: 200, word: 190, tag: 208, url: 224, end: 272 };
const T = FIN_T;
const S = 10, OX = 800, OY = 280; // 图标 32 网格 → 320px，居中在 (960, 440)
const ICON2 = new Poly(iconPath(OX, OY, S));

const STATS = [
  { v: '94', l: '次提交' },
  { v: '20', l: '个版本' },
  { v: '28', l: '次在凌晨提交' },
  { v: '24,236', l: '行新增（代码和文档）' },
];

export const Finale: React.FC = () => {
  const f = useCurrentFrame();
  const statsO = 1 - ramp(f, T.statsOut, 12, EASE.swift);
  const drawn = ramp(f, T.draw0, T.draw1 - T.draw0, EASE.smooth) * ICON2.len;
  const bloom = springAt(f, T.bloom, { damping: 13, stiffness: 140 });
  const flash = Math.max(0, 1 - Math.abs(f - T.bloom) / 9);
  const park = ramp(f, T.park0, T.park1 - T.park0, EASE.panel);
  const scale = mix(1, 0.56, park);
  const dx = mix(0, 600 - 960, park);
  const lineFade = 1 - ramp(f, T.bloom + 4, 18, EASE.swift);
  const end = ramp(f, T.end, 16, EASE.swift);
  return (
    <AbsoluteFill style={{ opacity: 1 - end }}>
      {/* 数字 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 290, opacity: statsO, filter: statsO < 0.999 ? `blur(${((1 - statsO) * 14).toFixed(1)}px)` : undefined }}>
        <Rise text="10.31 — 11.09" start={T.stats} per={0.8} dur={16} style={{ textAlign: 'center', fontFamily: F.mono, fontSize: 30, color: C.faint, letterSpacing: '0.1em' }} />
        <div style={{ marginTop: 50, display: 'flex', justifyContent: 'center', gap: 28 }}>
          {STATS.map((s, i) => {
            const p = springAt(f, T.stats + 6 + i * 6, { damping: 15, stiffness: 150 });
            return (
              <div key={i} style={{ width: 380, height: 270, ...glass({ radius: 30, fill: 0.08 }), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: Math.min(1, p * 1.4), transform: `translateY(${((1 - p) * 50).toFixed(1)}px)` }}>
                <div style={{ fontFamily: F.mono, fontWeight: 700 }}><DigitRoll value={s.v} delay={T.stats + 10 + i * 6} fontSize={104} color={C.text} /></div>
                <div style={{ marginTop: 12, fontSize: 32, color: C.dim }}>{s.l}</div>
              </div>
            );
          })}
        </div>
      </div>
      {/* 图标：线稿 → 真实图标 */}
      <AbsoluteFill style={{ transform: `translateX(${dx.toFixed(2)}px) scale(${scale.toFixed(4)})`, transformOrigin: '960px 440px' }}>
        {f >= T.bloom - 2 && (
          <div style={{ position: 'absolute', left: OX, top: OY, width: 32 * S, height: 32 * S, opacity: Math.min(1, bloom * 1.2), transform: `scale(${mix(0.86, 1, bloom).toFixed(4)})`, filter: `drop-shadow(0 30px 80px rgba(47,107,255,${(0.55 * bloom).toFixed(2)}))` }}>
            <Img src={staticFile('brand/icon.svg')} style={{ width: '100%', height: '100%' }} />
          </div>
        )}
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <NibDefs />
          <LedDefs />
          {f >= T.draw0 && <Stroke poly={ICON2} s1={drawn} width={3.5} opacity={lineFade} glow={1 + flash * 2} />}
          {f >= T.draw0 - 6 && f < T.bloom + 20 && <Led x={OX + 11.4 * S} y={OY + 19.75 * S} f={f} on={ramp(f, T.draw0 - 6, 8) * lineFade} size={0.8} />}
        </svg>
      </AbsoluteFill>
      {flash > 0 && <AbsoluteFill style={{ background: `radial-gradient(circle at ${960 + dx}px 440px, rgba(200,215,255,${(0.35 * flash).toFixed(3)}) 0%, rgba(200,215,255,0) 55%)` }} />}
      {/* 字标 + 一句话 */}
      <div style={{ position: 'absolute', left: 820, top: 330 }}>
        <Rise text="OpenWrt Claude Panel" by="char" start={T.word} per={0.9} dur={20} dy={14} blur={12} style={{ fontSize: 84, fontWeight: 700, letterSpacing: '-0.02em', color: C.text }} />
        <Rise text="线还在，接着写。" start={T.tag} per={2.2} dur={22} dy={12} blur={12} style={{ marginTop: 22, fontFamily: F.serif, fontSize: 52, fontWeight: 600, color: C.text, letterSpacing: '0.06em' }} />
        <div style={{ marginTop: 46, fontFamily: F.mono, fontSize: 28, lineHeight: 1.7, color: C.dim, opacity: ramp(f, T.url, 16, EASE.out) }}>
          <div>yrlove520.com</div>
          <div style={{ color: C.faint }}>github.com/wznwzn123/openwrt-claude-panel</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
