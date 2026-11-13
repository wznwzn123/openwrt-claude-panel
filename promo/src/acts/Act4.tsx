import React from 'react';
import ACT4 from '../act4.json';
import { useVideoConfig } from 'remotion';
import { Abs, C, EASE, FONT, SHIFT5, hash, mix, ramp, springAt, useT, useV } from '../lib/core';
import { AuroraBG, Dot, Glass, Grain, Pill, Vignette } from '../lib/visual';

/* 第四幕 · 54–74s · 说一句，它来办（改动前先确认）（琥珀金 × 克莱因蓝双色极光）
 * 配方卡：flying-words → glass-pill-dictation-typing */

const A = 54;
const CONVERGE = 57.517;
const CONSOLE = 58.034;
const END = 74 - SHIFT5;

/* 连接器的 32 个真实工具（src/www/cgi-bin/mcp 的 title，按合规口径：节点→线路、代理→加速、OpenClash→智能调度套件） */
const TOOLS: string[] = [
  '路由器状态', '查看加速通道/线路', '测速', '切换线路', '切换加速模式', '查看连接', '断开连接', '查看生效规则',
  '实时日志', '读取自定义规则', '保存自定义规则', '还原自定义规则', '重启智能调度套件', '智能调度套件日志', 'OAF 配置', 'OAF 查找应用',
  '修改 OAF 配置', '系统信息', '实时网速', '设备列表', '网络信息', '服务列表', '控制服务', '重启路由器',
  '防火墙与端口转发', '读取配置', '修改配置', '放弃未提交修改', '配置备份', '系统日志', '软件包', '执行命令',
];

/* 工具清单：32 个工具名整齐排成网格依次亮起（替换早期的 3D 飞字词云，审片 AI 味），54.0–57.5；随后飞入左右双屏外框 */
const Tunnel: React.FC<{ t: number }> = ({ t }) => {
  const { W, H, vertical } = useV();
  const conv = ramp(t, CONVERGE, CONSOLE - CONVERGE + 0.05, EASE.exit);
  const L = layout(W, H, vertical);
  const slot = (i: number): [number, number] => {
    const r = i % 2 ? { x: L.rx, y: L.ry } : { x: L.lx, y: L.ly };
    const p = ((Math.floor(i / 2) + 0.5) / Math.ceil(TOOLS.length / 2)) * 2 * (L.pw + L.ph);
    if (p < L.pw) return [r.x + p, r.y];
    if (p < L.pw + L.ph) return [r.x + L.pw, r.y + p - L.pw];
    if (p < 2 * L.pw + L.ph) return [r.x + L.pw - (p - L.pw - L.ph), r.y + L.ph];
    return [r.x, r.y + L.ph - (p - 2 * L.pw - L.ph)];
  };
  const cols = vertical ? 4 : 8;
  const cw = vertical ? 236 : 206, chh = vertical ? 64 : 54, gx = vertical ? 14 : 14, gy = vertical ? 16 : 14;
  const rows = Math.ceil(TOOLS.length / cols);
  const gw = cols * cw + (cols - 1) * gx, gh = rows * chh + (rows - 1) * gy;
  const gx0 = W / 2 - gw / 2, gy0 = (vertical ? H * 0.5 : H * 0.6) - gh / 2;
  const sweep = ((t - A - 1.2) / 1.6) % 1; // 琥珀高光自左向右扫过一遍又一遍：工具都在线
  return (
    <Abs style={{ inset: 0 }}>
      {TOOLS.map((name, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        const x0 = gx0 + c * (cw + gx), y0 = gy0 + r * (chh + gy);
        const inK = ramp(t, A + 0.35 + i * 0.035, 0.35, EASE.out);
        const [sx, sy] = slot(i);
        const x = mix(x0, sx - cw / 2, conv), y = mix(y0, sy - chh / 2, conv);
        const hot = t > A + 1.2 && Math.abs(c / (cols - 1) - sweep) < 0.08;
        const o = inK * (1 - ramp(t, CONSOLE + 0.05, 0.15, EASE.linear));
        return (
          <div key={name} style={{ position: 'absolute', left: x, top: y + (1 - inK) * 14, width: cw, height: chh, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transform: `scale(${mix(1, 0.4, conv)})`, opacity: o, background: hot ? 'rgba(217,119,87,0.22)' : 'rgba(255,255,255,0.06)', boxShadow: hot ? 'inset 0 0 0 1px rgba(255,190,150,0.6)' : 'inset 0 0 0 1px rgba(255,255,255,0.1)', fontFamily: FONT.sans, fontSize: vertical ? 22 : 19, fontWeight: 600, color: hot ? '#FFE2D6' : C.text2, whiteSpace: 'nowrap' }}>
            <Dot color={hot ? C.amber : C.ok} size={7} /> {name}
          </div>
        );
      })}
    </Abs>
  );
};

/* 双屏版式（飞字槽位与面板同源） */
const layout = (W: number, H: number, vertical: boolean) => {
  const pw = vertical ? W - 80 : 860;
  const ph = vertical ? 700 : 720;
  return { pw, ph, lx: vertical ? 40 : W / 2 - pw - 22, rx: vertical ? 40 : W / 2 + 22, ly: vertical ? 170 : 110, ry: vertical ? 170 + ph + 30 : 110 };
};

/* —— 对话脚本 —— */
type Cmd = { text: string; t0: number; send: number; think: number; tools: Array<{ name: string; at: number }>; confirm?: { ask: number; ok: number; text: string }; toolAt: number; state: number; reply: string; replyAt: number };
// 三条指令的时刻由 voice/act4_sync.py 从字级时间戳推导（状态响应 = 旁白关键词发声帧），换配音后重跑即重新对齐
const CMDS: Cmd[] = ACT4.cmds;
const CHAR = ACT4.char;
export const ROLLBACK_AT = ACT4.rollback; // 旁白「改之前还自动备份」：右屏弹出变更前快照

const GlassPill: React.FC<{ t: number; w: number }> = ({ t, w }) => {
  // 当前正在输入的指令
  const cur = [...CMDS].reverse().find((c) => t >= c.t0 - 0.35);
  const typing = cur && t < cur.send ? cur : undefined;
  const n = typing ? Math.max(0, Math.min(typing.text.length, Math.floor((t - typing.t0) / CHAR))) : 0;
  const g = typing ? 1 - ramp(t, typing.t0, typing.text.length * CHAR + 0.2, EASE.smooth) : 0; // 暖光随打字退去
  const sendFlash = cur && t >= cur.send && t < cur.send + 0.2 ? 1 - (t - cur.send) / 0.2 : 0;
  const caret = typing && Math.floor(t * 2.4) % 2 === 0;
  return (
    <div style={{ position: 'relative', width: w, height: 84, borderRadius: 42, overflow: 'hidden', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(28px) saturate(165%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28), inset 0 0 0 1px rgba(255,255,255,0.1), 0 20px 50px rgba(0,0,0,0.35)' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(217,119,87,0) 0%, rgba(217,119,87,0.38) 70%, rgba(255,190,150,0.55) 100%)', opacity: g }} />
      <div style={{ position: 'absolute', left: 32, top: 0, bottom: 0, right: 110, display: 'flex', alignItems: 'center', fontFamily: FONT.sans, fontWeight: 500, fontSize: 30, color: typing ? C.text : C.text3, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {typing ? typing.text.slice(0, n) : '用中文告诉 Claude 你想做什么…'}
        {caret && <span style={{ display: 'inline-block', width: 3, height: 34, background: '#FFD2BF', marginLeft: 4 }} />}
      </div>
      <div style={{ position: 'absolute', right: 14, top: 12, width: 60, height: 60, borderRadius: 30, background: g > 0.05 ? `rgba(217,119,87,${0.4 + 0.6 * g})` : 'transparent', boxShadow: `inset 0 0 0 2px rgba(255,255,255,${0.25 + 0.5 * sendFlash})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, transform: `scale(${1 - 0.12 * sendFlash})` }}>↑</div>
    </div>
  );
};

const Bubble: React.FC<{ me?: boolean; children: React.ReactNode; k: number }> = ({ me, children, k }) => (
  <div style={{ display: 'flex', justifyContent: me ? 'flex-end' : 'flex-start', marginBottom: 14, opacity: k, transform: `translateY(${(1 - k) * 14}px)` }}>
    <div style={{ maxWidth: '82%', padding: '14px 20px', borderRadius: me ? '22px 22px 6px 22px' : '22px 22px 22px 6px', background: me ? 'linear-gradient(135deg, #2563EB, #3b82f6)' : 'rgba(255,255,255,0.08)', boxShadow: me ? '0 10px 30px rgba(37,99,235,0.35)' : 'inset 0 1px 0 rgba(255,255,255,0.16), inset 0 0 0 1px rgba(255,255,255,0.08)', fontFamily: FONT.sans, fontSize: 25, lineHeight: 1.5, color: C.text, fontWeight: me ? 600 : 400 }}>{children}</div>
  </div>
);

const ChatCabin: React.FC<{ t: number; w: number; h: number }> = ({ t, w, h }) => {
  const items: Array<{ at: number; h: number; node: (k: number) => React.ReactNode }> = [];
  items.push({ at: 58.7, h: 130, node: (k) => <Bubble k={k}>已接入路由器面板，30+ 项底层工具就绪。直接用中文告诉我要做什么。</Bubble> });
  CMDS.forEach((c) => {
    items.push({ at: c.send, h: 78, node: (k) => <Bubble me k={k}>{c.text}</Bubble> });
    // 思考中 → 依次调用的工具（连接器里的真实工具名）；生效后圆点变绿
    items.push({
      at: c.think,
      h: 52,
      node: (k) => {
        const shown = c.tools.filter((tl) => t >= tl.at);
        return (
          <div style={{ marginBottom: 10, opacity: k, display: 'flex', alignItems: 'center', gap: 10, fontFamily: FONT.mono, fontSize: 18, color: '#FFD2BF' }}>
            {shown.length === 0 ? (
              <span style={{ padding: '6px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: C.text2 }}>
                思考中{'·'.repeat(1 + (Math.floor(t * 4) % 3))}
              </span>
            ) : (
              shown.map((tl, j) => (
                <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 10, background: 'rgba(217,119,87,0.14)', boxShadow: 'inset 0 0 0 1px rgba(217,119,87,0.4)', opacity: ramp(t, tl.at, 0.2, EASE.out) }}>
                  <Dot color={t > c.state || j < shown.length - 1 ? C.ok : C.amber} size={8} /> {j === 0 ? '调用工具 · ' : ''}{tl.name}
                </span>
              ))
            )}
          </div>
        );
      },
    });
    if (c.confirm) {
      const cf = c.confirm;
      items.push({
        at: cf.ask,
        h: 168,
        node: (k) => {
          const done = t >= cf.ok;
          const press = ramp(t, cf.ok - 0.06, 0.06, EASE.out) * (1 - ramp(t, cf.ok + 0.06, 0.15, EASE.out));
          return (
            <div style={{ opacity: k, transform: `translateY(${(1 - k) * 14}px)`, marginBottom: 14 }}>
              <div style={{ maxWidth: '86%', padding: '14px 20px', borderRadius: '22px 22px 22px 6px', background: 'rgba(255,255,255,0.08)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), inset 0 0 0 1px rgba(255,190,150,0.35)', fontFamily: FONT.sans, fontSize: 24, lineHeight: 1.5, color: C.text }}>
                {cf.text}
                <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                  <span style={{ padding: '6px 22px', borderRadius: 12, fontWeight: 700, fontSize: 22, background: done ? 'rgba(52,199,89,0.3)' : '#D97757', color: done ? '#bbf7d0' : '#fff', transform: `scale(${1 - 0.08 * press})`, boxShadow: done ? 'inset 0 0 0 1.5px rgba(52,199,89,0.7)' : '0 6px 18px rgba(217,119,87,0.45)' }}>{done ? '✓ 已确认' : '确认'}</span>
                  <span style={{ padding: '6px 22px', borderRadius: 12, fontSize: 22, color: C.text3, background: 'rgba(255,255,255,0.06)', opacity: done ? 0.4 : 1 }}>取消</span>
                </div>
              </div>
            </div>
          );
        },
      });
    }
    items.push({ at: c.replyAt, h: c.reply.length > 26 ? 130 : 92, node: (k) => <Bubble k={k}>{c.reply}</Bubble> });
  });
  const visible = items.filter((it) => t >= it.at);
  const total = visible.reduce((a, b) => a + b.h, 0);
  const area = h - 290;
  // 平滑滚动：按每条入场时刻插值
  let scroll = 0;
  let acc = 0;
  items.forEach((it) => {
    acc += it.h;
    const target = Math.max(0, acc - area);
    scroll = Math.max(scroll, mix(scroll, target, ramp(t, it.at, 0.35, EASE.out)));
  });
  void total;
  return (
    <Glass radius={34} fill={0.08} style={{ left: 0, top: 0, width: w, height: h, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 30, top: 26, right: 30, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 54, height: 54, borderRadius: 16, background: 'radial-gradient(circle at 35% 30%, #F2B49B, #D97757 55%, #a4502f)', boxShadow: '0 0 24px rgba(217,119,87,0.6)' }} />
        <div>
          <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 30, color: C.text }}>Claude · 自定义连接器</div>
          <div style={{ fontFamily: FONT.sans, fontSize: 19, color: C.text2, marginTop: 2 }}>已连接 路由器面板 · 30+ 项工具</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 30, top: 104, right: 30 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 12, background: 'rgba(217,119,87,0.16)', boxShadow: 'inset 0 0 0 1px rgba(217,119,87,0.45)', fontFamily: FONT.sans, fontSize: 19, fontWeight: 600, color: '#FFE2D6', opacity: ramp(t, CONSOLE + 0.3, 0.4, EASE.out) }}>
          🔐 双钥匙架构隔离 · 连接器地址仅限 AI 调用，无法打开面板
        </div>
      </div>
      <div style={{ position: 'absolute', left: 30, right: 30, top: 170, height: area, overflow: 'hidden', maskImage: 'linear-gradient(180deg, transparent 0, #000 40px)' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 30 - scroll }}>
          {items.map((it, i) => (
            <div key={i} style={{ height: it.h }}>{t >= it.at ? it.node(ramp(t, it.at, 0.35, EASE.out)) : null}</div>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 24, right: 24, bottom: 24 }}>
        <GlassPill t={t} w={w - 48} />
      </div>
    </Glass>
  );
};

/* 右银幕：OpenWrt 底层状态实时映射 */
const StatePanel: React.FC<{ t: number; w: number; h: number }> = ({ t, w, h }) => {
  const s1 = CMDS[0].state;
  const s2 = CMDS[1].state;
  const s3 = CMDS[2].state;
  const state = t < s1 ? 0 : t < s2 ? 1 : t < s3 ? 2 : 3;
  const k = ramp(t, [CONSOLE, s1, s2, s3][state], 0.4, EASE.out);
  const row = (children: React.ReactNode, hi = false, key?: string | number) => (
    <div key={key} style={{ display: 'flex', alignItems: 'center', height: 64, padding: '0 20px', borderRadius: 16, marginBottom: 10, background: hi ? 'rgba(52,199,89,0.16)' : 'rgba(255,255,255,0.05)', boxShadow: hi ? 'inset 0 0 0 1.5px rgba(52,199,89,0.6), 0 0 30px rgba(52,199,89,0.2)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)', fontFamily: FONT.sans, fontSize: 24, color: C.text }}>{children}</div>
  );
  let body: React.ReactNode = null;
  if (state <= 1) {
    const sel = state === 1 ? ramp(t, s1 + 0.1, 0.35, EASE.snappy) : 0;
    const nodes: Array<[string, string]> = [['备用线路 05', '超时'], ['企业多线内网线路', '35 ms'], ['跨区域办公线路', '42 ms'], ['低延迟线路 01', '28 ms']];
    body = (
      <>
        <div style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 26, color: C.text, marginBottom: 16 }}>加速通道 · 超清影音通道</div>
        <div style={{ position: 'relative' }}>
          {nodes.map(([n, ms], i) => row(
            <>
              <Dot color={i === 0 ? (state === 0 ? C.warn : '#64748b') : C.ok} size={10} />
              <span style={{ marginLeft: 14 }}>{n}</span>
              <span style={{ marginLeft: 'auto', fontFamily: FONT.mono, color: i === 0 ? '#fca5a5' : '#86efac' }}>{ms}</span>
              {((state === 0 && i === 0) || (state === 1 && i === 3)) && <span style={{ marginLeft: 16, fontSize: 18, padding: '3px 10px', borderRadius: 8, background: state === 1 ? 'rgba(52,199,89,0.3)' : 'rgba(255,149,0,0.25)', color: state === 1 ? '#bbf7d0' : '#fed7aa' }}>当前</span>}
            </>,
            state === 1 && i === 3 && sel > 0.5,
            n,
          ))}
        </div>
        {state === 1 && <div style={{ marginTop: 10, opacity: sel }}><Pill bg="rgba(52,199,89,0.2)" color="#bbf7d0">✓ 已切换至低延迟线路 01 · 28 ms</Pill></div>}
      </>
    );
  } else if (state === 2) {
    const sortK = ramp(t, s2 + 0.15, 0.45, EASE.snappy);
    const devs: Array<[string, number]> = [['客厅电视', 6.2], ['儿童平板', 1.1], ['书房台式机', 86.4], ['手机 · 主卧', 0.8]];
    const sorted = [2, 0, 1, 3];
    body = (
      <>
        <div style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 26, color: C.text, marginBottom: 16 }}>终端实时下行速率排行</div>
        <div style={{ position: 'relative', height: 4 * 74 }}>
          {devs.map(([n, v], i) => {
            const y = mix(i, sorted.indexOf(i), sortK) * 74;
            const top = i === 2;
            return (
              <div key={n} style={{ position: 'absolute', left: 0, right: 0, top: y, transform: `perspective(900px) rotateX(${(1 - ramp(t, s2 + 0.05 + i * 0.06, 0.35, EASE.snappy)) * 88}deg)`, transformOrigin: '50% 50%' }}>
                {row(
                  <>
                    <span style={{ width: 200 }}>{n}</span>
                    <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.08)', margin: '0 18px' }}>
                      <div style={{ width: `${(v / 90) * 100 * mix(0.3, 1, sortK)}%`, height: '100%', borderRadius: 5, background: top ? 'linear-gradient(90deg, #f59e0b, #D97757)' : '#3b82f6' }} />
                    </div>
                    <span style={{ fontFamily: FONT.mono, color: top ? '#fde68a' : C.text2, width: 150, textAlign: 'right' }}>{v.toFixed(1)} MB/s</span>
                  </>,
                  false,
                )}
                {top && sortK > 0.9 && (
                  <>
                    <div style={{ position: 'absolute', left: -6, right: -6, top: -6, height: 76, borderRadius: 20, boxShadow: '0 0 0 2px #f59e0b, 0 0 30px rgba(245,158,11,0.45)' }} />
                    {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([bx, by], j) => (
                      <div key={j} style={{ position: 'absolute', [bx ? 'right' : 'left']: -14, top: by ? 58 : -14, width: 20, height: 20, borderLeft: bx ? undefined : '3px solid #fbbf24', borderRight: bx ? '3px solid #fbbf24' : undefined, borderTop: by ? undefined : '3px solid #fbbf24', borderBottom: by ? '3px solid #fbbf24' : undefined, filter: 'drop-shadow(0 0 6px #f59e0b)' }} />
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  } else {
    const wk = ramp(t, s3 + 0.1, 0.4, EASE.out);
    const bk = ramp(t, ROLLBACK_AT, 0.4, EASE.out);
    // 连接器 uci_set：在 DHCP 里加一条静态地址（config host），reload dhcp；改前自动备份（uci_backups 可还原）
    const lines = ["dhcp.@host[-1]=host", "dhcp.@host[-1].name='study-pc'", "dhcp.@host[-1].mac='3C:22:FB:4A:1E:12'", "dhcp.@host[-1].ip='192.168.1.10'", "reload: dhcp"];
    body = (
      <>
        <div style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 26, color: C.text, marginBottom: 16 }}>DHCP · 静态地址</div>
        {row(
          <>
            <span>书房台式机 · 3C:22:FB:4A:1E:12 → 192.168.1.10</span>
            <span style={{ marginLeft: 'auto', fontSize: 20, color: '#bbf7d0' }}>✓ 已写入生效</span>
          </>,
          wk > 0.5,
        )}
        <div style={{ fontFamily: FONT.mono, fontSize: 19, lineHeight: 1.65, color: '#a5b4fc', padding: '16px 20px', borderRadius: 16, background: 'rgba(2,6,23,0.55)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
          {lines.map((l, i) => (
            <div key={i} style={{ opacity: ramp(t, s3 + 0.15 + i * 0.07, 0.15, EASE.linear), whiteSpace: 'pre' }}>{l}</div>
          ))}
        </div>
        <div style={{ marginTop: 14, opacity: bk, transform: `translateY(${(1 - bk) * 10}px)` }}>
          {row(
            <>
              <span style={{ fontSize: 20, color: C.text2 }}>UCI 备份</span>
              <span style={{ marginLeft: 16 }}>备份 #12 · 修改前自动快照</span>
              <span style={{ marginLeft: 'auto', fontSize: 18, padding: '4px 12px', borderRadius: 8, background: 'rgba(217,119,87,0.25)', color: '#FFD2BF' }}>↺ 一键还原</span>
            </>,
          )}
        </div>
      </>
    );
  }
  return (
    <Glass radius={34} fill={0.08} style={{ left: 0, top: 0, width: w, height: h, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 30, top: 28, right: 30, display: 'flex', alignItems: 'center' }}>
        <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 30, color: C.text }}>OpenWrt · 底层状态</div>
        <div style={{ marginLeft: 'auto' }}>
          <Pill style={{ fontSize: 18 }}>
            <Dot color={C.ok} size={8} /> 实时映射
          </Pill>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 30, right: 30, top: 108, opacity: k, transform: `translateY(${(1 - k) * 12}px)` }}>{body}</div>
      <div style={{ position: 'absolute', left: 30, right: 30, bottom: 26, display: 'flex', gap: 14, fontFamily: FONT.mono, fontSize: 17, color: C.text3 }}>
        <span>CPU {(11 + 4 * Math.sin(t * 1.3)).toFixed(0)}%</span>
        <span>MEM 41%</span>
        <span>UPTIME 12d 04h</span>
        <span style={{ marginLeft: 'auto' }}>uhttpd · ucode</span>
      </div>
    </Glass>
  );
};


/* —— 快切镜头表：打字特写 → 对话特写（思考中 / 工具 / 确认）→ 光束全景 → 结果特写 → 中景；硬切，每刀 0.25s 微推。
   切点吸附到 116 BPM 半拍网格（相对 12.0s 起拍），最大挪动 0.13s —— */
type Shot = { at: number; kind: 'wide' | 'mid' | 'type' | 'chat' | 'result' | 'rollback' };
const HALF = 60 / 116 / 2;
const snap = (x: number) => 12 + Math.round((x - 12) / HALF) * HALF;
const SHOTS: Shot[] = (() => {
  const raw: Shot[] = [];
  CMDS.forEach((c, i) => {
    const next = CMDS[i + 1];
    raw.push({ at: c.t0 - 0.1, kind: 'type' }, { at: c.send + 0.08, kind: 'chat' });
    raw.push({ at: c.confirm ? c.confirm.ok + 0.12 : c.toolAt - 0.3, kind: 'wide' }, { at: c.state, kind: 'result' });
    if (next) {
      const m = Math.min(c.state + 1.1, next.t0 - 0.35);
      if (next.t0 - 0.1 - m >= 0.45) raw.push({ at: m, kind: 'mid' });
    } else {
      raw.push({ at: Math.max(ROLLBACK_AT - 0.05, c.state + 0.45), kind: 'rollback' }, { at: Math.min(ROLLBACK_AT + 0.9, END - 0.6), kind: 'wide' });
    }
  });
  const out: Shot[] = [{ at: 0, kind: 'wide' }];
  for (const sh of raw) {
    const at = snap(sh.at);
    if (at <= out[out.length - 1].at) out[out.length - 1] = { at: out[out.length - 1].at, kind: sh.kind };
    else out.push({ at, kind: sh.kind });
  }
  return out;
})();
const camAt = (t: number, W: number, H: number, L: ReturnType<typeof layout>, vertical: boolean) => {
  let cur = SHOTS[0];
  for (const sh of SHOTS) if (t >= sh.at) cur = sh;
  const rTop = L.ry + (vertical ? 0 : 24);
  const F: Record<Shot['kind'], [number, number, number]> = {
    wide: [W / 2, H / 2, 1],
    mid: [W / 2, H / 2, vertical ? 1.02 : 1.1],
    type: [L.lx + L.pw / 2, L.ly + L.ph * (vertical ? 0.74 : 0.8), vertical ? 1.06 : 1.55],
    chat: [L.lx + L.pw / 2, L.ly + L.ph * (vertical ? 0.5 : 0.56), vertical ? 1.06 : 1.32],
    result: [L.rx + L.pw / 2, rTop + L.ph * 0.4, vertical ? 1.06 : 1.42],
    rollback: [L.rx + L.pw / 2, rTop + L.ph * 0.62, vertical ? 1.06 : 1.42],
  };
  // 竖屏双屏上下排、各占满宽：只做 1.06 轻推 + 上下换焦点，不放大裁字
  const [fx, fy, s0] = F[cur.kind];
  const dt = t - cur.at;
  // 切入瞬间 2% 冲击回弹 + 镜头内缓推；最后一个全景缓拉回 1.0
  const punch = 1 + 0.02 * (1 - ramp(t, cur.at, 0.25, EASE.out));
  const drift = cur.kind === 'wide' && cur.at > 0 && cur.at >= ROLLBACK_AT ? mix(1.1, 1, ramp(t, cur.at, END - cur.at, EASE.smooth)) : 1 + 0.012 * Math.min(dt, 1.5);
  return { fx, fy, s: s0 * punch * drift };
};

export const Act4: React.FC = () => {
  const t = useT();
  const { fps } = useVideoConfig();
  const { W, H, vertical } = useV();
  const panelK = springAt(t, CONSOLE, fps);
  const endOut = 0 * ramp(t, END - 0.5, 0.5, EASE.exit); // 74s 由主合成的 scanline-wipe 接管，不再淡出
  // 光束抵达右屏核心 → 1.03 弹性冲击波 + 全绿爆闪
  const hits = [...CMDS.map((c) => c.toolAt + 0.12), ROLLBACK_AT + 0.12];
  const dts = hits.map((a) => t - a).filter((d) => d >= 0 && d < 0.8);
  const dt = dts.length ? Math.min(...dts) : -1;
  const impact = dt >= 0 ? 0.03 * Math.exp(-dt * 6) * Math.cos(dt * 14) : 0;
  const greenFlash = dt >= 0 ? Math.exp(-dt * 7) : 0;
  // 一拍一个主角：打字时对话舱是主角，工具调用后右屏状态是主角，另一侧降权留守
  const focusR = CMDS.reduce((acc, c) => Math.max(acc, ramp(t, c.toolAt, 0.3, EASE.smooth) * (1 - ramp(t, c.toolAt + 1.6, 0.4, EASE.smooth))), 0) + ramp(t, ROLLBACK_AT, 0.3, EASE.smooth) * (1 - ramp(t, ROLLBACK_AT + 1.5, 0.4, EASE.smooth));
  const fL = 1 - 0.35 * Math.min(1, focusR);
  const fR = 1 - 0.35 * (1 - Math.min(1, focusR)) * ramp(t, CONSOLE + 0.4, 0.4, EASE.linear);
  const breath = 1 + 0.03 * ramp(t, CONSOLE, END - CONSOLE, EASE.linear);
  const L = layout(W, H, vertical);
  const { pw, ph, lx, rx, ly, ry } = L;
  const cam = t >= CONSOLE ? camAt(t, W, H, L, vertical) : { fx: W / 2, fy: H / 2, s: 1 };
  const sway = vertical ? 0 : 2.5 * Math.sin((2 * Math.PI * (t - CONSOLE)) / 9);
  const tilt = vertical ? 0 : 9; // 双屏相向内倾 9°，右屏错落下沉 24px，去正面平铺
  const rim = ramp(t, CONSOLE, 0.12, EASE.out) * (1 - ramp(t, CONSOLE + 0.12, 0.6, EASE.linear));
  const barText = t < 58.55 ? '连接器地址只给 AI 用 · 打不开你的面板' : '30+ 项路由器工具 · 改动前先确认';
  const barK = ramp(t, t < 58.55 ? 54.55 : 58.55, 0.45, EASE.out);
  // 开幕：一束琥珀金光注入
  const amberIn = ramp(t, A, 1.2, EASE.out);
  return (
    <Abs style={{ inset: 0, overflow: 'hidden' }}>
      <AuroraBG amber={amberIn} intensity={1.1} />
      {t < CONSOLE + 0.4 && <Tunnel t={t} />}
      {/* 开幕标题 */}
      {t < CONVERGE + 0.4 && (
        <Abs style={{ left: 0, right: 0, top: vertical ? H * 0.2 : H * 0.17, textAlign: 'center', opacity: ramp(t, 54.45, 0.6, EASE.out) * (1 - ramp(t, CONVERGE - 0.2, 0.4, EASE.exit)) }}>
          <div style={{ fontFamily: FONT.mono, fontSize: 20, letterSpacing: '0.4em', color: '#FFD2BF' }}>CUSTOM CONNECTOR · 32 TOOLS</div>
          <div style={{ marginTop: 16, fontFamily: FONT.sans, fontWeight: 800, fontSize: vertical ? 64 : 84, color: C.text, textShadow: '0 0 40px rgba(217,119,87,0.45)' }}>说一句，它来办</div>
          <div style={{ marginTop: 14, fontFamily: FONT.sans, fontWeight: 600, fontSize: vertical ? 30 : 34, color: '#FFD2BF' }}>要改设置时，会先跟你确认</div>
        </Abs>
      )}
      <Abs style={{ left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', transform: `translate(${W / 2 - cam.fx * cam.s}px, ${H / 2 - cam.fy * cam.s}px) scale(${cam.s})` }}>
      {t >= CONSOLE - 0.2 && (
        <Abs style={{ inset: 0, transform: `scale(${breath * (1 - endOut * 0.04)})`, opacity: 1 - endOut }}>
          <div style={{ position: 'absolute', left: lx, top: ly, width: pw, height: ph, opacity: t < CONSOLE - 0.05 ? 0 : 0.55 + 0.45 * fL, filter: `brightness(${0.75 + 0.25 * fL})`, transform: `perspective(1800px) translateZ(${-900 * (1 - panelK)}px) rotateY(${vertical ? 0 : 3 * (1 - panelK) + tilt + sway}deg) scale(${0.97 + 0.03 * fL})`, boxShadow: `0 0 ${60 * rim}px rgba(217,119,87,${0.9 * rim})`, borderRadius: 34 }}>
            <ChatCabin t={t} w={pw} h={ph} />
          </div>
          <div style={{ position: 'absolute', left: rx, top: ry + (vertical ? 0 : 24), width: pw, height: ph, opacity: t < CONSOLE - 0.05 ? 0 : 0.55 + 0.45 * fR, filter: `brightness(${0.75 + 0.25 * fR})`, transform: `perspective(1800px) translateZ(${-900 * (1 - panelK)}px) rotateY(${vertical ? 0 : -3 * (1 - panelK) - tilt + sway}deg) scale(${(0.97 + 0.03 * fR) * (1 + impact)})`, boxShadow: `0 0 ${60 * rim}px rgba(217,119,87,${0.9 * rim}), 0 0 ${80 * greenFlash}px rgba(52,199,89,${0.85 * greenFlash})`, borderRadius: 34 }}>
            <StatePanel t={t} w={pw} h={ph} />
            <div style={{ position: 'absolute', inset: 0, borderRadius: 34, background: `radial-gradient(ellipse at 20% 30%, rgba(74,222,128,${0.35 * greenFlash}), rgba(52,199,89,${0.12 * greenFlash}) 60%, rgba(52,199,89,0) 100%)`, boxShadow: `inset 0 0 0 ${2 + 2 * greenFlash}px rgba(134,239,172,${0.9 * greenFlash})`, pointerEvents: 'none' }} />
          </div>
        </Abs>
      )}
      {t >= CONSOLE && CMDS.map((c, i) => {
        const k = ramp(t, c.toolAt - 0.25, 0.37, EASE.exit);
        const o = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - c.toolAt + 0.25) / 0.6)));
        if (o <= 0) return null;
        const x0 = vertical ? W / 2 : lx + pw - 30, y0 = vertical ? ly + ph - 20 : ly + ph * 0.62;
        const x1 = vertical ? W / 2 : rx + 30, y1 = vertical ? ry + 20 : ry + ph * 0.3;
        const hx = mix(x0, x1, k), hy = mix(y0, y1, k);
        return (
          <svg key={i} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
            <defs>
              <linearGradient id={`trail${i}`} gradientUnits="userSpaceOnUse" x1={x0} y1={y0} x2={hx} y2={hy}>
                <stop offset="0" stopColor="#D97757" stopOpacity="0" />
                <stop offset="1" stopColor="#FFD2BF" stopOpacity={0.95} />
              </linearGradient>
            </defs>
            <line x1={x0} y1={y0} x2={hx} y2={hy} stroke={`url(#trail${i})`} strokeWidth={8} strokeLinecap="round" opacity={o} style={{ filter: 'drop-shadow(0 0 14px #D97757) drop-shadow(0 0 30px rgba(217,119,87,0.8))' }} />
            <circle cx={hx} cy={hy} r={14} fill="#FFF4EC" opacity={o} style={{ filter: 'drop-shadow(0 0 18px #FFB089) drop-shadow(0 0 40px #D97757)' }} />
          </svg>
        );
      })}
      {(() => {
        const s1 = CMDS[0].toolAt + 0.15;
        const s3 = CMDS[2].toolAt + 0.15;
        const cxr = vertical ? W / 2 : rx + pw * 0.5;
        const cyr = vertical ? ry + ph * 0.35 : ry + ph * 0.42;
        const R = Math.hypot(W, H);
        const p1 = ramp(t, s1, 0.9, EASE.out);
        const p3 = ramp(t, s3, 0.8, EASE.swift);
        return (
          <>
            {t >= s1 && t < s1 + 0.95 && [0, 0.12, 0.24].map((d, j) => {
              const q = ramp(t, s1 + d, 0.8, EASE.out);
              return <div key={j} style={{ position: 'absolute', left: cxr, top: cyr, width: 2 * R * q, height: 2 * R * q, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `${3 - j}px solid rgba(255,214,170,${0.9 * (1 - q)})`, boxShadow: `0 0 40px rgba(217,119,87,${0.6 * (1 - q)}), inset 0 0 60px rgba(96,165,250,${0.35 * (1 - q)})`, pointerEvents: 'none' }} />;
            })}
            {t >= s1 - 0.05 && t < s1 + 1.6 && (
              <div style={{ position: 'absolute', left: cxr - 120, top: cyr - 120, width: 240, height: 240, borderRadius: '50%', background: `radial-gradient(circle, rgba(255,240,220,${0.95 * (1 - ramp(t, s1 + 0.2, 1.3, EASE.out))}) 0%, rgba(217,119,87,${0.5 * (1 - p1)}) 35%, rgba(0,0,0,0) 70%)`, pointerEvents: 'none', mixBlendMode: 'screen' }} />
            )}
            {t >= s3 && t < s3 + 0.85 && (
              <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, rgba(52,199,89,0) ${p3 * 130 - 40}%, rgba(134,239,172,0.55) ${p3 * 130 - 15}%, rgba(52,199,89,0) ${p3 * 130}%)`, mixBlendMode: 'screen', pointerEvents: 'none' }} />
            )}
          </>
        );
      })()}
      </Abs>
      {/* 底部通栏毛玻璃字幕条（屏幕大字）；快切特写期间隐去，避免压住特写画面，收尾全景再回来 */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: vertical ? 120 : 160, display: 'flex', justifyContent: 'center', opacity: (1 - endOut) * Math.min(1, ramp(t, 54.55, 0.45, EASE.out)) * (1 - ramp(t, CMDS[0].t0 - 0.3, 0.2, EASE.out) * (1 - ramp(t, ROLLBACK_AT + 1.0, 0.4, EASE.out))) }}>
        <Glass radius={20} fill={0.08} style={{ position: 'relative', padding: '14px 40px' }}>
          <div style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: vertical ? 30 : 34, letterSpacing: '0.06em', color: C.text, opacity: barK, whiteSpace: 'nowrap' }}>{barText}</div>
        </Glass>
      </div>
      {/* 演示已加速：AI 调用真实耗时为数秒，片中压缩呈现 */}
      {t > CMDS[0].t0 - 0.4 && (
        <div style={{ position: 'absolute', right: vertical ? 54 : 96, top: vertical ? 46 : 64, display: 'flex', alignItems: 'center', gap: 10, padding: vertical ? '8px 18px' : '8px 18px', borderRadius: 999, background: 'rgba(8,12,24,0.55)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)', fontFamily: FONT.sans, fontSize: vertical ? 24 : 22, fontWeight: 600, color: 'rgba(226,232,240,0.85)', opacity: ramp(t, CMDS[0].t0 - 0.4, 0.3, EASE.out) }}>
          <span style={{ fontFamily: FONT.mono, letterSpacing: '-0.1em' }}>▶▶</span> 画面已加速
        </div>
      )}
      <Vignette strength={0.45} />
      <Grain opacity={0.1} />
    </Abs>
  );
};
