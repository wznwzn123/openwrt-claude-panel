import React from 'react';
import { Img, staticFile } from 'remotion';
import { C, EASE, FONT, mix, ramp } from './core';
import { BrandMark, Dot, Tap } from './visual';
import { Card, OkBadge, ScreenShell, Toggle, rollNum } from './screens';

/* ── 第三幕手机屏（自绘部分依据真实面板功能：插件识别/批量测速/自动切换；文案用中文设备名示意） ── */

const PLUGINS: Array<[string, string, number]> = [
  ['OpenClash', '#2f6bff', 31.25],
  ['Nikki', '#7c3aed', 33.1],
  ['PassWall', '#0ea5e9', 33.6],
  ['PassWall2', '#06b6d4', 33.9],
  ['HomeProxy', '#10b981', 34.75],
  ['SSR Plus+', '#f59e0b', 35.5],
];

export const PluginScreen: React.FC<{ t: number; w: number }> = ({ t, w }) => {
  const k = w / 360;
  const sweep = ramp(t, 37.15, 1.0, EASE.linear);
  const fail = ramp(t, 38.7, 0.25, EASE.out);
  const switched = ramp(t, 39.35, 0.35, EASE.out);
  const nodes: Array<[string, number, number]> = [
    ['新加坡 01 · 高速', 28, 0],
    ['香港 02 · 高速', 35, 0.12],
    ['日本 03 · 高速', 42, 0.24],
  ];
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 360, height: 720, transform: `scale(${k})`, transformOrigin: '0 0' }}>
      <ScreenShell title="网络插件" sub="自动识别已安装插件 · 一次只开一个" badge={<OkBadge text="6 个已识别" />}>
        <Card style={{ padding: '6px 12px' }}>
          {PLUGINS.map(([n, col, at], i) => {
            const on = ramp(t, at, 0.3, EASE.out);
            return (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 37, borderTop: i ? '1px solid rgba(60,60,67,.1)' : undefined }}>
                <div style={{ width: 24, height: 24, borderRadius: 7, background: col, color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: mix(0.3, 1, on) }}>{n[0]}</div>
                <div style={{ fontSize: 15, fontWeight: 650, opacity: mix(0.35, 1, on) }}>{n}</div>
                <div style={{ marginLeft: 'auto', opacity: on, transform: `scale(${mix(0.6, 1, on)})` }}>
                  {i === 0 ? <OkBadge text="运行中" /> : <OkBadge text="已识别" color="#2f6bff" />}
                </div>
              </div>
            );
          })}
        </Card>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>超清影音专线</div>
            <div style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 99, background: t > 37.15 && t < 37.35 ? '#0060d0' : '#007aff', color: '#fff', fontSize: 13, fontWeight: 700 }}>⚡ 批量测速</div>
          </div>
          {nodes.map(([n, ms, d], i) => {
            const lockAt = 37.35 + d + 0.5;
            const locked = t >= lockAt;
            const sel = i === 0 && switched > 0;
            return (
              <div key={n} style={{ display: 'flex', alignItems: 'center', height: 34, borderRadius: 10, padding: '0 8px', background: sel ? `rgba(52,199,89,${0.16 * switched})` : 'transparent' }}>
                <Dot color={locked ? C.ok : '#c7c7cc'} size={7} glow={false} />
                <span style={{ marginLeft: 8, fontSize: 14, fontWeight: 600 }}>{n}</span>
                <span style={{ marginLeft: 'auto', fontFamily: FONT.mono, fontSize: 15, fontWeight: 700, color: locked ? '#1f9d4c' : '#8e8e93', padding: '2px 8px', borderRadius: 8, background: locked ? 'rgba(52,199,89,0.14)' : 'transparent' }}>
                  {sweep > 0 ? rollNum(t, 37.35 + d, 0.5, ms, i * 17) : '--'} ms
                </span>
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', height: 34, borderRadius: 10, padding: '0 8px', background: `rgba(255,59,48,${0.12 * fail * (1 - switched)})`, opacity: mix(1, 0.45, switched) }}>
            <Dot color={fail > 0 ? C.danger : '#c7c7cc'} size={7} glow={false} />
            <span style={{ marginLeft: 8, fontSize: 14, fontWeight: 600, textDecoration: switched > 0.5 ? 'line-through' : undefined }}>日本 05 · 当前</span>
            <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: C.danger, opacity: fail }}>超时</span>
          </div>
        </Card>
        <div style={{ margin: '4px 0 0', padding: '10px 12px', borderRadius: 14, background: 'rgba(52,199,89,0.14)', color: '#1f9d4c', fontSize: 13.5, fontWeight: 700, opacity: switched, transform: `translateY(${(1 - switched) * 10}px)` }}>
          ✓ 节点异常，已自动切换至 新加坡 01（28 ms）
        </div>
      </ScreenShell>
      {t > 36.6 && t < 37.7 && <Tap x={300} y={318} press={ramp(t, 37.05, 0.1, EASE.out) * (1 - ramp(t, 37.2, 0.15, EASE.out))} ring={ramp(t, 37.15, 0.45, EASE.out)} opacity={ramp(t, 36.6, 0.2, EASE.out) * (1 - ramp(t, 37.5, 0.2, EASE.out))} />}
    </div>
  );
};

/* 设备管理（中文设备名示意 · 分流状态 · 定时断网） */
export const DEVICES: Array<{ n: string; ip: string; route: string; color: string; dn: number[] }> = [
  { n: '书房台式机', ip: '192.168.1.20', route: '直连', color: '#2f6bff', dn: [12.4, 3.1] },
  { n: '客厅电视', ip: '192.168.1.36', route: '4K 超清影音专线', color: '#7c3aed', dn: [38.6, 0.4] },
  { n: '儿童平板', ip: '192.168.1.52', route: '直连', color: '#f59e0b', dn: [2.3, 0.2] },
];
export const TOGGLE_AT = 44.55;

export const DevicesScreen: React.FC<{ t: number; w: number }> = ({ t, w }) => {
  const k = w / 360;
  const tog = ramp(t, TOGGLE_AT, 0.18, EASE.swift);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 360, height: 720, transform: `scale(${k})`, transformOrigin: '0 0' }}>
      <ScreenShell title="设备" sub="谁在线、走哪条线路、用了多少流量" badge={<OkBadge text="3 台在线" />}>
        {DEVICES.map((d, i) => {
          const live = d.dn[0] * (0.85 + 0.15 * Math.sin(t * 2.3 + i * 2));
          return (
            <Card key={d.n} style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: `${d.color}22`, color: d.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{['▭', '▣', '▯'][i]}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 750 }}>{d.n}</div>
                  <div style={{ fontSize: 12, color: '#6e6e73', fontFamily: FONT.mono }}>{d.ip}</div>
                </div>
                <div style={{ marginLeft: 'auto' }}>{i === 2 && tog > 0.5 ? <OkBadge text="已锁定" color={C.warn} /> : <OkBadge text="在线" />}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: 12.5, fontWeight: 650 }}>
                <span style={{ padding: '3px 9px', borderRadius: 99, background: 'rgba(0,122,255,0.1)', color: '#007aff' }}>分流 · {d.route}</span>
                <span style={{ padding: '3px 9px', borderRadius: 99, background: 'rgba(118,118,128,.12)', fontFamily: FONT.mono }}>↓ {live.toFixed(1)} MB/s</span>
              </div>
              {i === 2 && (
                <div style={{ display: 'flex', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(60,60,67,.1)' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>定时断网</div>
                    <div style={{ fontSize: 12, color: tog > 0.5 ? '#c26a00' : '#6e6e73' }}>{tog > 0.5 ? '每晚 23:00 自动断网 · 已生效' : '每晚 23:00 – 次日 07:00'}</div>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <Toggle on={tog} />
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </ScreenShell>
      {t > TOGGLE_AT - 0.7 && t < TOGGLE_AT + 0.7 && (
        <Tap x={313} y={436} press={ramp(t, TOGGLE_AT - 0.08, 0.08, EASE.out) * (1 - ramp(t, TOGGLE_AT + 0.08, 0.15, EASE.out))} ring={ramp(t, TOGGLE_AT, 0.45, EASE.out)} opacity={ramp(t, TOGGLE_AT - 0.7, 0.2, EASE.out) * (1 - ramp(t, TOGGLE_AT + 0.45, 0.2, EASE.out))} />
      )}
    </div>
  );
};

/* PWA：浏览器 → 分享 → 添加到主屏幕 → 桌面图标 → 面板锁指纹 → 面板 */
export const PwaFlow: React.FC<{ t: number; w: number; a: number }> = ({ t, w, a }) => {
  const k = w / 360;
  const sheet = ramp(t, a + 0.35, 0.4, EASE.snappy);
  const add = a + 1.05;
  const home = t >= a + 1.55;
  const iconPop = ramp(t, a + 1.7, 0.45, EASE.snappy);
  const lock = t >= a + 2.45;
  const fp = ramp(t, a + 3.25, 0.7, EASE.linear);
  const unlocked = t >= a + 4.05;
  const panelIn = ramp(t, a + 4.05, 0.45, EASE.snappy);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 360, height: 720, transform: `scale(${k})`, transformOrigin: '0 0', fontFamily: FONT.sans, overflow: 'hidden' }}>
      {!home && (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Img src={staticFile('shots/home.png')} style={{ width: 360, height: 720, transform: 'translateY(52px)', filter: `brightness(${1 - sheet * 0.45})` }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 92, background: '#f2f2f7', borderBottom: '1px solid #ddd' }}>
            <div style={{ position: 'absolute', left: 16, right: 16, top: 48, height: 34, borderRadius: 10, background: '#e3e3e8', fontSize: 15, color: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🔒 你的专属域名 / panel</div>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 300, background: '#f2f2f7', borderRadius: '18px 18px 0 0', transform: `translateY(${(1 - sheet) * 320}px)`, padding: 16, boxSizing: 'border-box' }}>
            {['拷贝链接', '添加到主屏幕', '添加书签'].map((s, i) => (
              <div key={s} style={{ height: 52, borderRadius: 12, background: i === 1 && t > add ? '#d8e7ff' : '#fff', marginBottom: 8, display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 17, fontWeight: i === 1 ? 700 : 500, color: '#111' }}>
                {s}
                <span style={{ marginLeft: 'auto', color: '#888' }}>{['⧉', '⊞', '☆'][i]}</span>
              </div>
            ))}
          </div>
          {t > add - 0.4 && t < add + 0.4 && <Tap x={180} y={496} ring={ramp(t, add, 0.4, EASE.out)} press={ramp(t, add - 0.06, 0.06, EASE.out)} opacity={1 - ramp(t, add + 0.25, 0.15, EASE.out)} />}
        </div>
      )}
      {home && !lock && (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #1e3a8a, #6d28d9 60%, #0e7490)' }}>
          {Array.from({ length: 16 }, (_, i) => {
            const isNew = i === 9;
            const x = 28 + (i % 4) * 80;
            const y = 90 + Math.floor(i / 4) * 96;
            return (
              <div key={i} style={{ position: 'absolute', left: x, top: y, width: 60, textAlign: 'center' }}>
                <div style={{ width: 60, height: 60, borderRadius: 15, background: isNew ? 'transparent' : 'rgba(255,255,255,0.18)', transform: isNew ? `scale(${iconPop})` : undefined }}>
                  {isNew && <BrandMark size={60} id="pwa" />}
                </div>
                <div style={{ fontSize: 11, color: '#fff', marginTop: 5, opacity: isNew ? iconPop : 0.6 }}>{isNew ? '路由器面板' : ''}</div>
              </div>
            );
          })}
          {t > a + 2.0 && <Tap x={58 + 80} y={312 + 30} ring={ramp(t, a + 2.3, 0.4, EASE.out)} opacity={ramp(t, a + 2.0, 0.15, EASE.out)} />}
        </div>
      )}
      {lock && (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #0f172a, #1e1b4b)' }}>
          <div style={{ position: 'absolute', top: 150, left: 0, right: 0, textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: 26, fontWeight: 800 }}>面板锁</div>
            <div style={{ fontSize: 14, opacity: 0.6, marginTop: 6 }}>指纹或数字密码解锁</div>
          </div>
          <svg width={140} height={140} viewBox="0 0 24 24" style={{ position: 'absolute', left: 110, top: 300 }}>
            {['M12 3a9 9 0 0 1 9 9', 'M3 12a9 9 0 0 1 6-8.5', 'M12 6.5a5.5 5.5 0 0 1 5.5 5.5v2', 'M6.5 12a5.5 5.5 0 0 1 3-4.9', 'M12 10v4.5a4 4 0 0 0 2 3.5', 'M9 12.5v2a7 7 0 0 0 1.5 4.3', 'M15 13v1.5'].map((d, i) => (
              <path key={i} d={d} stroke={unlocked ? C.ok : fp > i / 7 ? '#60a5fa' : 'rgba(255,255,255,0.35)'} strokeWidth={1.2} fill="none" strokeLinecap="round" />
            ))}
          </svg>
          {fp > 0 && fp < 1 && <div style={{ position: 'absolute', left: 100, width: 160, top: 300 + fp * 140, height: 2, background: '#60a5fa', boxShadow: '0 0 12px #60a5fa' }} />}
          <div style={{ position: 'absolute', top: 470, left: 0, right: 0, textAlign: 'center', color: unlocked ? '#86efac' : 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: 600 }}>{unlocked ? '✓ 已解锁' : '请验证指纹'}</div>
          {unlocked && (
            <div style={{ position: 'absolute', inset: 0, transform: `translateY(${(1 - panelIn) * 720}px)` }}>
              <Img src={staticFile('shots/home.png')} style={{ width: 360, height: 720 }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* 原生安卓客户端：扫码秒连 → 多台路由一键切换 */
export const AndroidFlow: React.FC<{ t: number; w: number; a: number }> = ({ t, w, a }) => {
  const k = w / 360;
  const scanned = t >= a + 1.9;
  const listIn = ramp(t, a + 2.1, 0.4, EASE.snappy);
  const switchAt = 51.25;
  const sel = t < switchAt ? 0 : 2;
  const selY = mix(0, 2, ramp(t, switchAt, 0.3, EASE.snappy));
  const routers = [
    ['家里 · AX3000T', '在线 · 3 台设备'],
    ['公司 · R4S', '在线 · 12 台设备'],
    ['父母家 · AX6S', '在线 · 5 台设备'],
  ];
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 360, height: 720, transform: `scale(${k})`, transformOrigin: '0 0', fontFamily: FONT.sans, background: '#0b1220', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 40, height: 56, display: 'flex', alignItems: 'center', padding: '0 18px', color: '#fff', gap: 10 }}>
        <BrandMark size={30} id="and" />
        <div style={{ fontSize: 18, fontWeight: 750 }}>路由器面板</div>
        <div style={{ marginLeft: 'auto', fontFamily: FONT.mono, fontSize: 12, color: '#94a3b8' }}>v3.0.2</div>
      </div>
      {!scanned && (
        <div style={{ position: 'absolute', left: 50, top: 170, width: 260, height: 260 }}>
          <div style={{ position: 'absolute', inset: 30, background: 'repeating-conic-gradient(#e2e8f0 0% 25%, #0b1220 0% 50%) 0 0/24px 24px', opacity: 0.85, borderRadius: 6 }} />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ position: 'absolute', width: 40, height: 40, left: i % 2 ? undefined : 0, right: i % 2 ? 0 : undefined, top: i < 2 ? 0 : undefined, bottom: i < 2 ? undefined : 0, borderLeft: i % 2 ? undefined : '4px solid #22d3ee', borderRight: i % 2 ? '4px solid #22d3ee' : undefined, borderTop: i < 2 ? '4px solid #22d3ee' : undefined, borderBottom: i < 2 ? undefined : '4px solid #22d3ee' }} />
          ))}
          <div style={{ position: 'absolute', left: 10, right: 10, top: 20 + 220 * ((t - a) % 0.9) / 0.9, height: 3, background: '#22d3ee', boxShadow: '0 0 14px #22d3ee' }} />
          <div style={{ position: 'absolute', left: -50, right: -50, top: 290, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>扫描面板里「添加新手机」的二维码</div>
        </div>
      )}
      {scanned && (
        <div style={{ position: 'absolute', left: 16, right: 16, top: 120, opacity: listIn, transform: `translateY(${(1 - listIn) * 20}px)` }}>
          <div style={{ color: '#86efac', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>✓ 已添加，三台路由器随时切换</div>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: selY * 84, height: 74, borderRadius: 16, background: 'rgba(37,99,235,0.28)', boxShadow: 'inset 0 0 0 1.5px #3b82f6' }} />
            {routers.map(([n, s], i) => (
              <div key={n} style={{ position: 'relative', height: 74, marginBottom: 10, borderRadius: 16, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', padding: '0 16px', color: '#fff' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{n}</div>
                  <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 4 }}>{s}</div>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 13, color: i === sel ? '#93c5fd' : '#64748b', fontWeight: 700 }}>{i === sel ? '当前' : '切换'}</div>
              </div>
            ))}
          </div>
          {t > switchAt - 0.5 && t < switchAt + 0.5 && <Tap x={300} y={20 + 30 + 2 * 84 + 37} ring={ramp(t, switchAt, 0.4, EASE.out)} opacity={1 - ramp(t, switchAt + 0.3, 0.2, EASE.out)} />}
          {t > switchAt + 0.3 && (
            <div style={{ marginTop: 12, borderRadius: 16, overflow: 'hidden', height: 300, opacity: ramp(t, switchAt + 0.3, 0.4, EASE.out) }}>
              <Img src={staticFile('shots/dark.png')} style={{ width: 328, height: 656, transform: 'translateY(-48px)' }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
