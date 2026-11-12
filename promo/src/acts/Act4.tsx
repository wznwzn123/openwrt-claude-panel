import React from 'react';
import ACT4 from '../act4.json';
import { useVideoConfig } from 'remotion';
import { Abs, C, EASE, FONT, hash, mix, ramp, springAt, useT, useV } from '../lib/core';
import { AuroraBG, Dot, Glass, Grain, Pill, Vignette } from '../lib/visual';

/* 第四幕 · 54–74s · 与 AI 对话，言出法随（琥珀金 × 克莱因蓝双色极光）
 * 配方卡：flying-words → glass-pill-dictation-typing */

const A = 54;
const CONVERGE = 57.517;
const CONSOLE = 58.034;
const END = 74;

/* 30+ 项底层能力（来自仓库 cgi-bin/mcp 的真实工具清单，中文化） */
const TOOLS: Array<[string, string]> = [
  ['线路智能调度', 'switch_proxy'], ['UCI 配置读写与回滚', 'uci_set'], ['系统日志智能诊断', 'system_log'], ['OAF 应用过滤', 'oaf_uci'],
  ['实时网速排行', 'net_speed'], ['系统服务控制', 'service_control'], ['设备列表', 'device_list'], ['连接追踪', 'list_connections'],
  ['防火墙总览', 'firewall_overview'], ['调度规则管理', 'list_rules'], ['线路延迟测试', 'test_delay'], ['自定义规则', 'set_custom_rules'],
  ['规则一键还原', 'restore_custom_rules'], ['网络信息', 'network_info'], ['软件包查询', 'packages'], ['套件日志', 'suite_log'],
  ['调度模式切换', 'set_mode'], ['路由器状态', 'router_status'], ['UCI 备份清单', 'uci_backups'], ['配置回滚', 'uci_revert'],
  ['应用识别', 'oaf_find_app'], ['关闭异常连接', 'close_connections'], ['加速通道总览', 'list_proxy_groups'], ['系统信息', 'system_info'],
  ['服务清单', 'list_services'], ['日志检索', 'get_logs'], ['读取自定义规则', 'get_custom_rules'], ['套件重启', 'restart_suite'],
  ['UCI 配置查看', 'uci_show'], ['应用过滤详情', 'oaf_show'], ['安全命令执行', 'run_command'], ['计划重启', 'reboot_router'],
];

/* flying-words：词语纵深隧道（手算透视 s = P/(P−z)） */
const Tunnel: React.FC<{ t: number }> = ({ t }) => {
  const { W, H } = useV();
  const P = 4400;
  const conv = ramp(t, CONVERGE, CONSOLE - CONVERGE + 0.05, EASE.exit); // 越飞越快，被吸进槽位
  const { vertical } = useV();
  const L = layout(W, H, vertical);
  const slot = (i: number): [number, number] => {
    const r = i % 2 ? { x: L.rx, y: L.ry } : { x: L.lx, y: L.ly };
    const p = ((Math.floor(i / 2) + 0.5) / Math.ceil(TOOLS.length / 2)) * 2 * (L.pw + L.ph);
    if (p < L.pw) return [r.x + p, r.y];
    if (p < L.pw + L.ph) return [r.x + L.pw, r.y + p - L.pw];
    if (p < 2 * L.pw + L.ph) return [r.x + L.pw - (p - L.pw - L.ph), r.y + L.ph];
    return [r.x, r.y + L.ph - (p - 2 * L.pw - L.ph)];
  };
  const items = TOOLS.map(([zh, en], i) => {
    const golden = i * 2.39996;
    const rad = 260 + (i % 5) * 120 + hash(i) * 80;
    const layer = i % 3; // 三层纵深，速度错开
    const u = ((t - A) * [0.34, 0.42, 0.52][layer] + i / TOOLS.length) % 1.0;
    const z = mix(-7000, 3000, u);
    const s = P / (P - z);
    const x = W / 2 + Math.cos(golden) * rad * s;
    const y = H / 2 + Math.sin(golden) * rad * 0.62 * s;
    const life = u < 0.25 ? u / 0.25 : u < 0.6 ? mix(1, 0.6, (u - 0.25) / 0.35) : mix(0.6, 0, (u - 0.6) / 0.4);
    const fog = Math.min(1, s * 1.4);
    // 汇聚：飞向左右双屏
    const side = Math.cos(golden) < 0 ? -1 : 1;
    void side;
    const [sx, sy] = slot(i);
    const tx = mix(x, sx, conv);
    const ty = mix(y, sy, conv);
    const accent = i % 6 === 0;
    const dc = Math.hypot((x - W / 2) / 640, (y - H / 2) / 220);
    const titleDim = t < CONVERGE ? mix(0.08, 1, Math.min(1, Math.max(0, dc - 0.7) * 1.5)) : 1;
    const blur = conv > 0.5 ? 0 : s < 0.55 ? (0.55 - s) * 7 : s > 1.6 ? Math.min(6, (s - 1.6) * 3) : 0; // 远景失焦 / 擦身而过失焦
    return { zh, en, x: tx, y: ty, s: mix(s, 0.3, conv), o: mix(life * fog * titleDim, 1, conv) * (1 - ramp(t, CONSOLE + 0.05, 0.15, EASE.linear)) * ramp(t, A, 0.3, EASE.linear), accent, z, blur };
  });
  items.sort((a, b) => a.z - b.z);
  // 隧道壁发丝环
  const rings = Array.from({ length: 9 }, (_, i) => {
    const u = ((t - A) * 0.42 + i / 9) % 1;
    const s = P / (P - mix(-7000, 3000, u));
    return <div key={i} style={{ position: 'absolute', left: W / 2 - 520 * s, top: H / 2 - 320 * s, width: 1040 * s, height: 640 * s, borderRadius: '50%', border: `${Math.min(3, 0.6 * s)}px solid rgba(217,119,87,${0.22 * Math.min(1, u * 3) * (1 - u)})`, opacity: 1 - conv }} />;
  });
  return (
    <Abs style={{ inset: 0 }}>
      <Abs style={{ left: W / 2 - 400, top: H / 2 - 400, width: 800, height: 800, borderRadius: '50%', background: `radial-gradient(circle, rgba(217,119,87,${0.5 + 0.15 * Math.sin(t * 3)}) 0%, rgba(37,99,235,0.18) 40%, rgba(0,0,0,0) 70%)`, opacity: 1 - conv }} />
      {rings}
      {items.map((w, i) => (
        <div key={i} style={{ position: 'absolute', left: w.x, top: w.y, transform: `translate(-50%,-50%) scale(${w.s})`, opacity: w.o, whiteSpace: 'nowrap', textAlign: 'center', filter: w.blur > 0.3 ? `blur(${w.blur.toFixed(1)}px)` : undefined }}>
          <div style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 40, color: w.accent ? '#FFD2BF' : C.text, textShadow: w.accent ? '0 0 24px rgba(217,119,87,0.9)' : '0 0 12px rgba(120,160,255,0.35)' }}>{w.zh}</div>
        </div>
      ))}
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
type Cmd = { text: string; t0: number; send: number; tool: string; toolAt: number; reply: string; replyAt: number };
// 三条指令的时刻由 voice/act4_sync.py 从字级时间戳推导（状态响应 = 旁白关键词发声帧），换配音后重跑即重新对齐
const CMDS: Cmd[] = ACT4.cmds;
const CHAR = ACT4.char;
export const ROLLBACK_AT = ACT4.rollback; // 旁白「回滚 UCI 配置」

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
    items.push({
      at: c.toolAt,
      h: 50,
      node: (k) => (
        <div style={{ marginBottom: 10, opacity: k }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 14px', borderRadius: 10, background: 'rgba(217,119,87,0.14)', boxShadow: 'inset 0 0 0 1px rgba(217,119,87,0.4)', fontFamily: FONT.mono, fontSize: 18, color: '#FFD2BF' }}>
            <Dot color={t > c.replyAt ? C.ok : C.amber} size={8} /> 调用工具 · {c.tool}
          </span>
        </div>
      ),
    });
    items.push({ at: c.replyAt, h: c.reply.length > 26 ? 130 : 92, node: (k) => <Bubble k={k}>{c.reply}</Bubble> });
  });
  items.push({
    at: ROLLBACK_AT,
    h: 130,
    node: (k) => (
      <Bubble k={k}>
        变更前已自动备份 UCI 配置，可随时 <span style={{ color: '#FFD2BF' }}>一键回滚</span>
      </Bubble>
    ),
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
  const s1 = CMDS[0].toolAt + 0.15;
  const s2 = CMDS[1].toolAt + 0.15;
  const s3 = CMDS[2].toolAt + 0.15;
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
    const lines = ["config rule 'pause_kids_tablet'", "  option src 'lan'", "  option src_mac 'AA:BB:CC:52:1F:07'", "  option start_time '23:00:00'", "  option stop_time '07:00:00'", "  option target 'REJECT'"];
    body = (
      <>
        <div style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 26, color: C.text, marginBottom: 16 }}>防火墙 · 定时策略</div>
        {row(
          <>
            <span>儿童平板 · 每晚 23:00 自动休眠 → 次日 07:00</span>
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
              <span style={{ marginLeft: 16 }}>备份 #12 · 变更前快照</span>
              <span style={{ marginLeft: 'auto', fontSize: 18, padding: '4px 12px', borderRadius: 8, background: 'rgba(217,119,87,0.25)', color: '#FFD2BF' }}>↺ 一键回滚</span>
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
  const focusR = CMDS.reduce((acc, c) => Math.max(acc, ramp(t, c.toolAt, 0.3, EASE.smooth) * (1 - ramp(t, c.toolAt + 1.6, 0.4, EASE.smooth))), 0) + ramp(t, ROLLBACK_AT, 0.3, EASE.smooth) * (1 - ramp(t, 69.8, 0.4, EASE.smooth));
  const fL = 1 - 0.35 * Math.min(1, focusR);
  const fR = 1 - 0.35 * (1 - Math.min(1, focusR)) * ramp(t, CONSOLE + 0.4, 0.4, EASE.linear);
  const breath = 1 + 0.03 * ramp(t, CONSOLE, END - CONSOLE, EASE.linear);
  const { pw, ph, lx, rx, ly, ry } = layout(W, H, vertical);
  const sway = vertical ? 0 : 2.5 * Math.sin((2 * Math.PI * (t - CONSOLE)) / 9);
  const tilt = vertical ? 0 : 9; // 双屏相向内倾 9°，右屏错落下沉 24px，去正面平铺
  const rim = ramp(t, CONSOLE, 0.12, EASE.out) * (1 - ramp(t, CONSOLE + 0.12, 0.6, EASE.linear));
  const barText = t < 58.55 ? '接入 Claude 自定义连接器 · 双钥匙安全隔离' : '内置 30+ 项路由底层工具 · 中文对话言出法随';
  const barK = ramp(t, t < 58.55 ? 54.55 : 58.55, 0.45, EASE.out);
  // 开幕：一束琥珀金光注入
  const amberIn = ramp(t, A, 1.2, EASE.out);
  return (
    <Abs style={{ inset: 0, overflow: 'hidden' }}>
      <AuroraBG amber={amberIn} intensity={1.1} />
      {t < CONSOLE + 0.4 && <Tunnel t={t} />}
      {/* 开幕标题 */}
      {t < CONVERGE + 0.4 && (
        <Abs style={{ left: 0, right: 0, top: H / 2 - 90, textAlign: 'center', opacity: ramp(t, 54.45, 0.6, EASE.out) * (1 - ramp(t, CONVERGE - 0.2, 0.4, EASE.exit)) }}>
          <div style={{ fontFamily: FONT.mono, fontSize: 20, letterSpacing: '0.4em', color: '#FFD2BF' }}>CUSTOM CONNECTOR</div>
          <div style={{ marginTop: 16, fontFamily: FONT.sans, fontWeight: 800, fontSize: vertical ? 64 : 84, color: C.text, textShadow: '0 0 40px rgba(217,119,87,0.45)' }}>与 AI 对话，言出法随</div>
        </Abs>
      )}
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
      {/* 底部通栏毛玻璃字幕条（屏幕大字） */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: vertical ? 120 : 160, display: 'flex', justifyContent: 'center', opacity: (1 - endOut) * Math.min(1, ramp(t, 54.55, 0.45, EASE.out)) }}>
        <Glass radius={20} fill={0.08} style={{ position: 'relative', padding: '14px 40px' }}>
          <div style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: vertical ? 30 : 34, letterSpacing: '0.06em', color: C.text, opacity: barK, whiteSpace: 'nowrap' }}>{barText}</div>
        </Glass>
      </div>
      <Vignette strength={0.45} />
      <Grain opacity={0.1} />
    </Abs>
  );
};
