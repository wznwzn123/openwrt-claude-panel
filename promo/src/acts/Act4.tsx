import React from 'react';
import { useVideoConfig } from 'remotion';
import { Abs, C, EASE, FONT, hash, mix, ramp, springAt, useT, useV } from '../lib/core';
import { AuroraBG, Dot, Glass, Grain, Pill, Vignette } from '../lib/visual';

/* 第四幕 · 54–74s · 与 AI 对话，言出法随（琥珀金 × 克莱因蓝双色极光）
 * 配方卡：flying-words → glass-pill-dictation-typing */

const A = 54;
const CONVERGE = 57.7;
const CONSOLE = 58.15;
const END = 74;

/* 30+ 项底层能力（来自仓库 cgi-bin/mcp 的真实工具清单，中文化） */
const TOOLS: Array<[string, string]> = [
  ['节点智能调度', 'switch_proxy'], ['UCI 配置读写与回滚', 'uci_set'], ['系统日志智能诊断', 'system_log'], ['OAF 应用过滤', 'oaf_uci'],
  ['实时网速排行', 'net_speed'], ['系统服务控制', 'service_control'], ['设备列表', 'device_list'], ['连接追踪', 'list_connections'],
  ['防火墙总览', 'firewall_overview'], ['代理规则管理', 'list_rules'], ['节点延迟测试', 'test_delay'], ['自定义规则', 'set_custom_rules'],
  ['规则一键还原', 'restore_custom_rules'], ['网络信息', 'network_info'], ['软件包查询', 'packages'], ['插件日志', 'openclash_log'],
  ['代理模式切换', 'set_mode'], ['路由器状态', 'router_status'], ['UCI 备份清单', 'uci_backups'], ['配置回滚', 'uci_revert'],
  ['应用识别', 'oaf_find_app'], ['关闭异常连接', 'close_connections'], ['策略组总览', 'list_proxy_groups'], ['系统信息', 'system_info'],
  ['服务清单', 'list_services'], ['日志检索', 'get_logs'], ['读取自定义规则', 'get_custom_rules'], ['插件重启', 'restart_openclash'],
  ['UCI 配置查看', 'uci_show'], ['应用过滤详情', 'oaf_show'], ['安全命令执行', 'run_command'], ['计划重启', 'reboot_router'],
];

/* flying-words：词语纵深隧道（手算透视 s = P/(P−z)） */
const Tunnel: React.FC<{ t: number }> = ({ t }) => {
  const { W, H } = useV();
  const P = 4400;
  const conv = ramp(t, CONVERGE, 0.55, EASE.swift);
  const items = TOOLS.map(([zh, en], i) => {
    const golden = i * 2.39996;
    const rad = 260 + (i % 5) * 120 + hash(i) * 80;
    const u = ((t - A) * 0.42 + i / TOOLS.length) % 1.0;
    const z = mix(-7000, 3000, u);
    const s = P / (P - z);
    const x = W / 2 + Math.cos(golden) * rad * s;
    const y = H / 2 + Math.sin(golden) * rad * 0.62 * s;
    const life = u < 0.25 ? u / 0.25 : u < 0.6 ? mix(1, 0.6, (u - 0.25) / 0.35) : mix(0.6, 0, (u - 0.6) / 0.4);
    const fog = Math.min(1, s * 1.4);
    // 汇聚：飞向左右双屏
    const side = Math.cos(golden) < 0 ? -1 : 1;
    const tx = mix(x, W / 2 + side * W * 0.24, conv);
    const ty = mix(y, H * 0.5 + (hash(i * 9) - 0.5) * H * 0.5, conv);
    const accent = i % 6 === 0;
    const dc = Math.hypot((x - W / 2) / 520, (y - H / 2) / 170);
    const titleDim = t < CONVERGE ? mix(0.18, 1, Math.min(1, Math.max(0, dc - 0.6))) : 1;
    return { zh, en, x: tx, y: ty, s: mix(s, 0.5, conv), o: life * fog * titleDim * (1 - conv) * ramp(t, A, 0.3, EASE.linear), accent, z };
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
        <div key={i} style={{ position: 'absolute', left: w.x, top: w.y, transform: `translate(-50%,-50%) scale(${w.s})`, opacity: w.o, whiteSpace: 'nowrap', textAlign: 'center' }}>
          <div style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 40, color: w.accent ? '#FFD2BF' : C.text, textShadow: w.accent ? '0 0 24px rgba(217,119,87,0.9)' : '0 0 12px rgba(120,160,255,0.35)' }}>{w.zh}</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 18, color: 'rgba(160,190,255,0.55)', marginTop: 2 }}>{w.en}</div>
        </div>
      ))}
    </Abs>
  );
};

/* —— 对话脚本 —— */
type Cmd = { text: string; t0: number; send: number; tool: string; toolAt: number; reply: string; replyAt: number };
const CMDS: Cmd[] = [
  { text: '把超清影音专线切到新加坡低延迟节点', t0: 58.75, send: 60.05, tool: 'switch_proxy · test_delay', toolAt: 60.3, reply: '已将「超清影音专线」切换至 新加坡 01 · 28 ms', replyAt: 60.75 },
  { text: '看看现在哪台设备在占满网速', t0: 62.35, send: 63.3, tool: 'net_speed · device_list', toolAt: 63.55, reply: '书房台式机正以 86.4 MB/s 下载，占用约 92% 带宽', replyAt: 63.95 },
  { text: '给儿童平板设置每晚11点自动断网', t0: 65.55, send: 66.8, tool: 'uci_set · firewall', toolAt: 67.05, reply: '已写入定时规则：儿童平板 每晚 23:00 断网，次日 07:00 恢复', replyAt: 67.45 },
];
const CHAR = 0.072;

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
    at: 68.15,
    h: 130,
    node: (k) => (
      <Bubble k={k}>
        变更前已自动备份 UCI 配置，可随时 <span style={{ fontFamily: FONT.mono, color: '#FFD2BF' }}>uci_revert</span> 一键回滚
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
    <Glass radius={34} fill={0.06} style={{ left: 0, top: 0, width: w, height: h, overflow: 'hidden' }}>
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
    const nodes: Array<[string, string]> = [['日本 05', '超时'], ['香港 02', '35 ms'], ['日本 03', '42 ms'], ['新加坡 01', '28 ms']];
    body = (
      <>
        <div style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 26, color: C.text, marginBottom: 16 }}>策略组 · 超清影音专线</div>
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
        {state === 1 && <div style={{ marginTop: 10, opacity: sel }}><Pill bg="rgba(52,199,89,0.2)" color="#bbf7d0">✓ 已切换至新加坡 01 · 28 ms</Pill></div>}
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
              <div key={n} style={{ position: 'absolute', left: 0, right: 0, top: y }}>
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
                {top && sortK > 0.9 && <div style={{ position: 'absolute', left: -6, right: -6, top: -6, height: 76, borderRadius: 20, boxShadow: '0 0 0 2px #f59e0b, 0 0 30px rgba(245,158,11,0.4)' }} />}
              </div>
            );
          })}
        </div>
      </>
    );
  } else {
    const wk = ramp(t, s3 + 0.1, 0.4, EASE.out);
    const bk = ramp(t, 68.3, 0.4, EASE.out);
    const lines = ["config rule 'pause_kids_tablet'", "  option src 'lan'", "  option src_mac 'AA:BB:CC:52:1F:07'", "  option start_time '23:00:00'", "  option stop_time '07:00:00'", "  option target 'REJECT'"];
    body = (
      <>
        <div style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 26, color: C.text, marginBottom: 16 }}>防火墙 · 定时策略</div>
        {row(
          <>
            <span>儿童平板 · 每晚 23:00 → 次日 07:00</span>
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
              <span style={{ fontFamily: FONT.mono, fontSize: 20, color: C.text2 }}>uci_backups</span>
              <span style={{ marginLeft: 16 }}>备份 #12 · 变更前快照</span>
              <span style={{ marginLeft: 'auto', fontSize: 18, padding: '4px 12px', borderRadius: 8, background: 'rgba(217,119,87,0.25)', color: '#FFD2BF' }}>↺ 一键回滚</span>
            </>,
          )}
        </div>
      </>
    );
  }
  return (
    <Glass radius={34} fill={0.05} style={{ left: 0, top: 0, width: w, height: h, overflow: 'hidden' }}>
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
  const endOut = ramp(t, END - 0.5, 0.5, EASE.exit);
  const breath = 1 + 0.03 * ramp(t, CONSOLE, END - CONSOLE, EASE.linear);
  const pw = vertical ? W - 80 : 860;
  const ph = vertical ? 760 : 740;
  const lx = vertical ? 40 : W / 2 - pw - 22;
  const rx = vertical ? 40 : W / 2 + 22;
  const ly = vertical ? 170 : 110;
  const ry = vertical ? 170 + ph + 30 : 110;
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
          <div style={{ position: 'absolute', left: lx + (vertical ? 0 : (1 - panelK) * -200), top: ly, width: pw, height: ph, opacity: Math.min(1, panelK * 1.5), transform: `perspective(1800px) rotateY(${vertical ? 0 : 3 * (1 - panelK) + 1.5}deg)` }}>
            <ChatCabin t={t} w={pw} h={ph} />
          </div>
          <div style={{ position: 'absolute', left: rx + (vertical ? 0 : (1 - panelK) * 200), top: ry, width: pw, height: ph, opacity: Math.min(1, panelK * 1.5), transform: `perspective(1800px) rotateY(${vertical ? 0 : -3 * (1 - panelK) - 1.5}deg)` }}>
            <StatePanel t={t} w={pw} h={ph} />
          </div>
        </Abs>
      )}
      {/* 底部通栏毛玻璃字幕条（屏幕大字） */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: vertical ? 120 : 98, display: 'flex', justifyContent: 'center', opacity: (1 - endOut) * Math.min(1, ramp(t, 54.55, 0.45, EASE.out)) }}>
        <Glass radius={20} fill={0.08} style={{ position: 'relative', padding: '14px 40px' }}>
          <div style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: vertical ? 30 : 34, letterSpacing: '0.06em', color: C.text, opacity: barK, whiteSpace: 'nowrap' }}>{barText}</div>
        </Glass>
      </div>
      <Vignette strength={0.45} />
      <Grain opacity={0.1} />
    </Abs>
  );
};
