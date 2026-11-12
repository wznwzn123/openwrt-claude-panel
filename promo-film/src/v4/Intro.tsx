// 前奏（第 0–7 小节，配乐的前奏段）：绿灯 → 一笔画出图标 → 真实图标 → 产品名 → 电脑和手机上的真实面板 → 推近实时网速，落鼓前蓄力。
import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { C, F, Rise } from '../lib/look';
import { EASE, mix, ramp, springAt } from '../lib/ease';
import { MultiStroke, NibDefs, iconStrokes } from '../lib/thread';
import { Led, LedDefs } from '../scenes/Open';
import { B } from './beat';
import { DemoLabel, L4, Phone, Win } from './kit';

const S = 18, OX = 960 - 16 * S, OY = 460 - 16 * S - 40; // 图标 576px，中心 (960, 420)
const ICON = iconStrokes(OX, OY, S);
const live = L4['desk-home'].live;

export const Intro: React.FC<{ f: number }> = ({ f }) => {
  // ① 灯 + 一笔画（第 0 小节第 1 拍 → 第 2 小节强拍）
  const ledOn = ramp(f, B(0), 8, EASE.out);
  const drawn = ramp(f, B(0, 1), B(2) - B(0, 1) - 4, EASE.smooth);
  // ② 第 2 小节强拍：真实图标亮起；第 2 小节第 2 拍起缩小上移
  const bloom = springAt(f, B(2), { damping: 14, stiffness: 150 });
  const lift = ramp(f, B(2, 2), 22, EASE.panel);
  const iconS = mix(1, 0.42, lift), iconY = mix(0, -150, lift);
  const lineFade = 1 - ramp(f, B(2), 10, EASE.swift);
  // ③ 第 4 小节强拍：图标和名字退出，电脑窗口升起；第 5 小节手机进来；第 6–7 小节推近实时网速
  const out1 = ramp(f, B(4) - 6, 12, EASE.swift);
  const win = ramp(f, B(4), 20, EASE.panel);
  const phone = ramp(f, B(5), 18, EASE.panel);
  const phoneOut = ramp(f, B(6), 16, EASE.swift);
  const pre = ramp(f, B(7, 2), B(8) - B(7, 2), EASE.exit); // 落鼓前最后两拍：整体往里吸
  const CAM = [
    { frame: B(4), cx: 960, cy: 600, zoom: 1 },
    { frame: B(6), cx: 960, cy: 600, zoom: 1.02 },
    { frame: B(7, 2), cx: live.x + live.w / 2, cy: live.y + live.h / 2, zoom: 1.75 },
    { frame: B(8), cx: live.x + live.w / 2, cy: live.y + live.h / 2, zoom: 1.9 },
  ];
  const winS = mix(0.92, 1, win) * mix(1, 1.08, pre);
  const winX = mix(0, -110, phone) * (1 - phoneOut);
  return (
    <AbsoluteFill>
      {out1 < 1 && (
        <AbsoluteFill style={{ opacity: 1 - out1, filter: out1 > 0.01 ? `blur(${(out1 * 16).toFixed(1)}px)` : undefined, transform: `translateY(${(-out1 * 40).toFixed(1)}px)` }}>
          <AbsoluteFill style={{ transform: `translateY(${iconY.toFixed(1)}px) scale(${iconS.toFixed(4)})`, transformOrigin: '960px 420px' }}>
            {f >= B(2) - 2 && (
              <div style={{ position: 'absolute', left: OX, top: OY, width: 32 * S, height: 32 * S, opacity: Math.min(1, bloom * 1.2), transform: `scale(${mix(0.9, 1, bloom).toFixed(4)})`, filter: `drop-shadow(0 30px 70px rgba(47,107,255,${(0.55 * bloom).toFixed(2)}))` }}>
                <Img src={staticFile('brand/icon.svg')} style={{ width: '100%', height: '100%' }} />
              </div>
            )}
            <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
              <NibDefs />
              <LedDefs />
              {f >= B(0, 1) && <MultiStroke polys={ICON} p={drawn} width={5} glow={1.3} dim={[1, 1, 0.6]} opacity={lineFade} />}
              {lineFade > 0 && <Led x={OX + 11.4 * S} y={OY + 19.75 * S} f={f} on={ledOn * lineFade} size={1.4} />}
            </svg>
          </AbsoluteFill>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 560, textAlign: 'center' }}>
            <Rise text="OpenWrt Claude Panel" by="char" start={B(3)} per={0.7} dur={16} dy={14} blur={12} style={{ fontSize: 96, fontWeight: 800, letterSpacing: '-0.01em', color: C.text }} />
            <Rise text="OpenWrt 路由器控制面板" start={B(3, 2)} per={1.2} dur={16} dy={10} blur={10} style={{ marginTop: 22, fontSize: 44, fontWeight: 500, color: 'rgba(228,232,255,0.78)', letterSpacing: '0.12em' }} />
          </div>
        </AbsoluteFill>
      )}
      {win > 0 && (
        <AbsoluteFill style={{ opacity: win, transform: `translate(${winX.toFixed(1)}px, ${((1 - win) * 120).toFixed(1)}px) scale(${winS.toFixed(4)})`, transformOrigin: '960px 540px' }}>
          <Win src="ui/desk-home.png" keys={CAM} f={f} x={280} y={160} w={1360} ease={EASE.smooth} />
        </AbsoluteFill>
      )}
      {phone > 0 && phoneOut < 1 && (
        <div style={{ position: 'absolute', left: 0, top: 0, opacity: phone * (1 - phoneOut), transform: `translate(${mix(1620, 1470, phone).toFixed(1)}px, ${mix(300, 170, phone).toFixed(1)}px) rotate(${mix(6, 0, phone).toFixed(2)}deg)` }}>
          <Phone src="ui/home-dark-full.png" h={720} style={{ left: 0, top: 0 }} />
        </div>
      )}
      {win > 0 && <DemoLabel opacity={win * (1 - pre)} />}
    </AbsoluteFill>
  );
};
