// 对话（第 20–27 小节）：AI 版——用中文说一句，它在路由器上查、改。每条消息落在拍上。
// 对话内容是演示（左下角写明）。两轮都对应面板真实提供给 AI 的工具：
//   ① 「路由器现在怎么样？」→ system_info（运行时间、内存、温度）+ net_speed（实时上下行）
//   ② 「把访客 Wi-Fi 关了」→ 会让设备断开，先说明影响、等确认（工具说明里的要求）→ uci_set，改之前自动备份（可以回滚）
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, F, glass } from '../lib/look';
import { EASE, mix, ramp, springAt } from '../lib/ease';
import { B } from './beat';
import { DemoLabel, Keyword } from './kit';

const PX = 700, PY = 120, PW = 1100, PH = 840, PAD = 44, INNER = PH - PAD * 2 - 96; // 下面留一条输入栏
const GAP = 22;

type Item = { at: number; h: number; render: (f: number, p: number) => React.ReactNode };
const typed = (text: string, f: number, at: number, cps = 1.4) => { const n = Math.max(0, Math.floor((f - at) / (1 / cps))); return Array.from(text).slice(0, n).join(''); };

const User: React.FC<{ text: string; f: number; at: number }> = ({ text, f, at }) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
    <div style={{ maxWidth: 760, padding: '20px 30px', borderRadius: '30px 30px 8px 30px', background: 'linear-gradient(120deg,#6a4dff,#2f6bff)', color: '#fff', fontSize: 40, fontWeight: 600, letterSpacing: '0.02em', boxShadow: '0 18px 40px -16px rgba(47,107,255,0.8)' }}>{text}</div>
  </div>
);
const Tool: React.FC<{ names: string[]; f: number; at: number }> = ({ names, f, at }) => (
  <div style={{ display: 'flex', gap: 14 }}>
    {names.map((n, i) => {
      const a = at + i * 7, p = springAt(f, a, { damping: 16, stiffness: 220 }), done = f >= a + 10;
      return (
        <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 12, height: 52, padding: '0 22px', borderRadius: 26, fontFamily: F.sans, fontSize: 28, fontWeight: 600, color: C.text, background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.22)', opacity: Math.min(1, p * 1.3), transform: `scale(${mix(0.8, 1, p).toFixed(3)})` }}>
          <span style={{ width: 26, height: 26, borderRadius: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, background: done ? '#34c759' : 'transparent', boxShadow: done ? 'none' : 'inset 0 0 0 3px rgba(255,255,255,0.5)', color: '#fff', transform: done ? 'none' : `rotate(${(f * 24) % 360}deg)` }}>{done ? '✓' : ''}</span>
          {n}
        </span>
      );
    })}
  </div>
);
const Bot: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ maxWidth: 900, fontSize: 38, lineHeight: 1.5, color: C.text, fontWeight: 500 }}>{children}</div>
);
const Row: React.FC<{ k: string; v: string; f: number; at: number }> = ({ k, v, f, at }) => {
  const p = ramp(f, at, 10, EASE.snappy);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width: 820, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', opacity: p, transform: `translateX(${((1 - p) * 30).toFixed(1)}px)` }}>
      <span style={{ fontSize: 34, color: 'rgba(228,232,255,0.75)' }}>{k}</span>
      <span style={{ fontFamily: F.mono, fontSize: 36, fontWeight: 700, color: C.text }}>{v}</span>
    </div>
  );
};

const ITEMS: Item[] = [
  { at: B(20, 1), h: 88, render: (f) => <User text={typed('路由器现在怎么样？', f, B(20, 1)) || ' '} f={f} at={B(20, 1)} /> },
  { at: B(21), h: 52, render: (f) => <Tool names={['系统信息', '实时网速']} f={f} at={B(21)} /> },
  { at: B(21, 3), h: 4 * 66 + 10, render: (f) => (
    <Bot>
      <Row k="已经运行" v="8 天" f={f} at={B(21, 3)} />
      <Row k="内存还剩" v="286 MB" f={f} at={B(22)} />
      <Row k="温度" v="52°C" f={f} at={B(22, 1)} />
      <Row k="下载 / 上传" v="24.6 / 3.1 MB/s" f={f} at={B(22, 2)} />
    </Bot>
  ) },
  { at: B(24), h: 88, render: (f) => <User text={typed('把访客 Wi-Fi 关了', f, B(24))} f={f} at={B(24)} /> },
  { at: B(24, 2), h: 114, render: (f) => <Bot>{typed('关掉后，连着访客 Wi-Fi 的 2 台设备会断开。', f, B(24, 2), 2.4)}<br />{f >= B(25) ? typed('确定吗？', f, B(25), 2.4) : ''}</Bot> },
  { at: B(25, 2), h: 88, render: (f) => <User text="确定" f={f} at={B(25, 2)} /> },
  { at: B(26), h: 52, render: (f) => <Tool names={['修改配置']} f={f} at={B(26)} /> },
  { at: B(26, 2), h: 114, render: (f) => <Bot>{typed('已关闭。改之前自动备份了，', f, B(26, 2), 2.4)}<br />{f >= B(27) ? typed('想恢复说一声就行。', f, B(27), 2.4) : ''}</Bot> },
];
const TOPS: number[] = []; { let y = 0; for (const it of ITEMS) { TOPS.push(y); y += it.h + GAP; } }
const SCROLL = ITEMS.map((it, i) => Math.max(0, TOPS[i] + it.h - INNER));

export const Chat: React.FC<{ f: number }> = ({ f }) => {
  const enter = springAt(f, B(20), { damping: 15, stiffness: 160 });
  const out = ramp(f, B(28) - 8, 8, EASE.exit);
  let scroll = 0;
  ITEMS.forEach((it, i) => { scroll = mix(scroll, Math.max(scroll, SCROLL[i]), ramp(f, it.at, 12, EASE.panel)); });
  return (
    <AbsoluteFill style={{ opacity: 1 - out, filter: out > 0.01 ? `blur(${(out * 18).toFixed(1)}px)` : undefined }}>
      <Keyword f={f} at={B(20)} out={B(28)} idx="AI 版" text="用中文说" x={110} y={420} />
      <div style={{ position: 'absolute', left: PX, top: PY, width: PW, height: PH, ...glass({ radius: 40, fill: 0.07 }), opacity: Math.min(1, enter * 1.3), transform: `translateY(${((1 - enter) * 80).toFixed(1)}px) scale(${mix(1.06, 1, Math.min(1, enter)).toFixed(4)})`, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: PAD, right: PAD, top: PAD, height: INNER, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: -scroll }}>
            {ITEMS.map((it, i) => {
              if (f < it.at - 1) return null;
              const p = ramp(f, it.at, 10, EASE.snappy);
              return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: TOPS[i], opacity: p, transform: `translateY(${((1 - p) * 24).toFixed(1)}px)` }}>{it.render(f, p)}</div>;
            })}
          </div>
        </div>
        {/* 输入栏 */}
        <div style={{ position: 'absolute', left: PAD, right: PAD, bottom: PAD - 6, height: 76, borderRadius: 38, background: 'rgba(255,255,255,0.08)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', padding: '0 30px', fontSize: 30, color: 'rgba(228,232,255,0.45)' }}>
          用中文说你想做什么…
        </div>
      </div>
      <DemoLabel text="AI 版 · 对话内容为演示" />
    </AbsoluteFill>
  );
};
