import React from 'react';
import { useVideoConfig } from 'remotion';
import { Abs, C, EASE, FONT, hash, mix, ramp, springAt, useT, useV } from '../lib/core';
import { AuroraBG, BrandMark, Dot, Glass, Grain, HudBG, Phone, Pill, Vignette } from '../lib/visual';
import { Img, staticFile } from 'remotion';

/* 终幕 · 74–90s · 全天候守护与双轨极速启航
 * 配方卡：scanline-annotate-focus（HUD）→ input-morph-assemble（极光终幕） */

const A = 74;
const SCAN0 = 74.4;
const SCAN1 = 77.6;
const HUD_OUT = 81.828;
const FIN = 82.087;
const TYPE0 = 82.35;
const ENTER = 84.414;
const MORPH = 84.614;
const DROP = [85.448, 85.707, 85.966]; // 拍 / 半拍 / 拍
const WORD = 86.224;
const LINKS = 86.741;
const STAR = 87.258;

const CMD = 'cd /tmp && wget -O p.tar.gz https://yrlove520.com/dl/openwrt-claude-panel-hosted-ai.tar.gz && tar xzf p.tar.gz && cd openwrt-claude-panel && sh install.sh';

/* 扫描标注目标（真实断线记录截图坐标，390×780） */
const TARGETS = [
  { x0: 36, y0: 196, x1: 132, y1: 224, label: '宽带拨号', note: '每 30s 巡检 · 正常' },
  { x0: 255, y0: 196, x1: 352, y1: 224, label: '⚠ DNS 解析', note: '异常 → 已自愈 ×2' },
  { x0: 36, y0: 240, x1: 132, y1: 268, label: 'Cloudflare 隧道', note: '4 条连接 · 已自动重连' },
  { x0: 255, y0: 240, x1: 352, y1: 268, label: '扩展套件进程', note: '守护中 · 正常' },
];

const Notice: React.FC<{ t: number; at: number; title: string; body: string; slot: number }> = ({ t, at, title, body, slot }) => {
  const { fps } = useVideoConfig();
  const k = springAt(t, at, fps);
  return (
    <div style={{ position: 'absolute', right: 144 + (1 - k) * -560, top: 150 + slot * 148, width: 520, opacity: Math.min(1, k * 1.5) }}>
      <Glass radius={22} fill={0.1} style={{ position: 'relative', padding: '18px 22px', display: 'flex', gap: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 26, flex: 'none', boxShadow: '0 0 20px rgba(34,197,94,0.45)' }}>✉</div>
        <div>
          <div style={{ fontFamily: FONT.sans, fontSize: 18, color: C.text2 }}>微信 · PushPlus 推送 · 刚刚</div>
          <div style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 26, color: C.text, marginTop: 4 }}>{title}</div>
          <div style={{ fontFamily: FONT.sans, fontSize: 19, color: C.text2, marginTop: 4 }}>{body}</div>
        </div>
      </Glass>
    </div>
  );
};

const Watchdog: React.FC<{ t: number }> = ({ t }) => {
  const { W, H, vertical } = useV();
  const sw = vertical ? 360 : 400;
  const k = sw / 390;
  const pw = sw * 1.08;
  const ph = sw * 2.08;
  const px = vertical ? W / 2 : W * 0.29;
  const py = vertical ? H * 0.42 : H * 0.53;
  const left = px - pw / 2 + sw * 0.04;
  const top = py - ph / 2 + sw * 0.04 + sw * 0.115; // 状态栏下移
  const scanY = mix(-20, 800, ramp(t, SCAN0, SCAN1 - SCAN0, EASE.linear)); // 机器视线：严格匀速
  const scanO = ramp(t, SCAN0, 0.15, EASE.linear) * (1 - ramp(t, SCAN1, 0.25, EASE.linear));
  const push = 1 + 0.035 * ramp(t, A, HUD_OUT - A, EASE.linear);
  return (
    <Abs style={{ inset: 0 }}>
      <HudBG />
      <Abs style={{ inset: 0, transform: `scale(${push})` }}>
        <div style={{ position: 'absolute', left: px - pw / 2, top: py - ph / 2, perspective: 1600 }}>
          <div style={{ transform: `rotateY(${8 + 1.5 * Math.sin(t)}deg)` }}>
            <Phone w={sw}>
              <Img src={staticFile('shots/offline.png')} style={{ width: sw, height: sw * 2, filter: 'saturate(0.9)' }} />
              {/* 扫描线 + 已读余晖 */}
              <div style={{ position: 'absolute', left: 0, right: 0, top: scanY * k - 140, height: 140, background: 'linear-gradient(180deg, rgba(6,182,212,0), rgba(6,182,212,0.22))', opacity: scanO }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: scanY * k, height: 3, background: C.cyan, boxShadow: `0 0 18px ${C.cyan}, 0 0 4px #fff`, opacity: scanO }} />
            </Phone>
          </div>
        </div>
        {/* 取景角标收拢 + 机器标签 */}
        {TARGETS.map((g, i) => {
          const ft = mix(SCAN0, SCAN1, (g.y1 + 20) / 820) + i * 0.08;
          const c = springAt(t, ft, 60, { damping: 15, stiffness: 240 });
          if (t < ft) return null;
          const x0 = left + g.x0 * k - 6, y0 = top + g.y0 * k - 6, x1 = left + g.x1 * k + 6, y1 = top + g.y1 * k + 6;
          const spread = (1 - c) * 60;
          const arm = 14;
          const alarm = i === 1; // DNS 异常 → 自愈：亮橙告警
          const col = alarm ? '#F97316' : C.cyan;
          const blink = alarm ? 0.55 + 0.45 * Math.sin((t - ft) * 18) * Math.exp(-(t - ft) * 0.6) : 1;
          const grow = ramp(t, ft, 0.32, EASE.out);
          const corner = (cx: number, cy: number, sx: number, sy: number, key: string) => (
            <svg key={key} width={1} height={1} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: blink }}>
              <path d={`M${cx} ${cy + sy * arm} L${cx} ${cy} L${cx + sx * arm} ${cy}`} fill="none" stroke={col} strokeWidth={3} strokeLinecap="square" strokeDasharray={2 * arm} strokeDashoffset={2 * arm * (1 - grow)} style={{ filter: `drop-shadow(0 0 ${alarm ? 8 : 5}px ${col})` }} />
            </svg>
          );
          const lk = ramp(t, ft + 0.12, 0.3, EASE.out);
          const labelX = vertical ? 60 + (i % 2) * (W / 2 - 40) : W * 0.47;
          const labelY = vertical ? py + ph / 2 + 30 + Math.floor(i / 2) * 110 : 470 + i * 112;
          const n = Math.floor(lk * (g.label.length + g.note.length + 3));
          const txt = `${g.label} · ${g.note}`.slice(0, n);
          return (
            <React.Fragment key={i}>
              {corner(x0 - spread, y0 - spread, 1, 1, 'a')}
              {corner(x1 + spread, y0 - spread, -1, 1, 'b')}
              {corner(x0 - spread, y1 + spread, 1, -1, 'c')}
              {corner(x1 + spread, y1 + spread, -1, -1, 'd')}
              {c > 0.95 && t < ft + 0.25 && <div style={{ position: 'absolute', left: x0, top: y0, width: x1 - x0, height: y1 - y0, background: alarm ? 'rgba(249,115,22,0.3)' : 'rgba(6,182,212,0.25)' }} />}
              {alarm && c > 0.9 && (
                <>
                  <svg width={1} height={1} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: blink }}>
                    {/* 告警框：沿边框画线生长一周 */}
                    <rect x={x0 - 4} y={y0 - 4} width={x1 - x0 + 8} height={y1 - y0 + 8} fill="none" stroke="#F97316" strokeWidth={2} strokeDasharray={2 * (x1 - x0 + y1 - y0 + 16)} strokeDashoffset={2 * (x1 - x0 + y1 - y0 + 16) * (1 - ramp(t, ft + 0.15, 0.45, EASE.out))} style={{ filter: 'drop-shadow(0 0 8px rgba(249,115,22,0.9))' }} />
                  </svg>
                  {[[0.5, -1], [0.5, 1], [-1, 0.5], [1, 0.5]].map(([fx, fy], j) => {
                    const cxp = fx === -1 ? x0 - 18 : fx === 1 ? x1 + 4 : (x0 + x1) / 2 - 1;
                    const cyp = fy === -1 ? y0 - 18 : fy === 1 ? y1 + 4 : (y0 + y1) / 2 - 1;
                    return <div key={j} style={{ position: 'absolute', left: cxp, top: cyp, width: fx === 0.5 ? 2 : 14, height: fy === 0.5 ? 2 : 14, background: '#F97316', opacity: blink, boxShadow: '0 0 8px #F97316' }} />;
                  })}
                </>
              )}
              {!vertical && (
                <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1} height={1}>
                  <path d={`M${left + sw + 14} ${(y0 + y1) / 2} L${labelX - 120} ${labelY + 34} L${labelX - 10} ${labelY + 34}`} stroke={col} strokeWidth={1.5} fill="none" strokeDasharray={1200} strokeDashoffset={1200 * (1 - lk)} opacity={0.7} />
                </svg>
              )}
              <div style={{ position: 'absolute', left: labelX, top: labelY, opacity: Math.min(1, lk * 3) }}>
                <div style={{ display: 'inline-block', padding: '10px 18px', background: alarm ? 'rgba(249,115,22,0.18)' : 'rgba(6,182,212,0.16)', boxShadow: `inset 0 0 0 1.5px ${col}${alarm ? `, 0 0 ${16 * blink}px rgba(249,115,22,0.6)` : ''}`, fontFamily: FONT.mono, fontSize: vertical ? 20 : 24, color: alarm ? '#FFEDD5' : '#cffafe', whiteSpace: 'nowrap' }}>
                  <span style={{ color: C.cyan, marginRight: 10 }}>[{String(i + 1).padStart(2, '0')}]</span>
                  {txt}
                  <span style={{ opacity: lk < 1 ? 1 : 0 }}>▍</span>
                </div>
                <div style={{ marginTop: 6, fontFamily: FONT.mono, fontSize: 15, color: 'rgba(6,182,212,0.6)', letterSpacing: '0.14em' }}>AUTO-HEAL · LOG {`19:12:${String(10 + i * 7).padStart(2, '0')}`}</div>
              </div>
            </React.Fragment>
          );
        })}
        {/* 状态行 + 30 秒巡检环 */}
        <div style={{ position: 'absolute', left: vertical ? 60 : W * 0.47, top: vertical ? 300 : 410, fontFamily: FONT.mono, fontSize: 20, letterSpacing: '0.16em', color: t > SCAN1 ? '#86efac' : C.cyan }}>
          {t > SCAN1 ? 'WATCHDOG · 4/4 SIGNALS HEALTHY' : 'WATCHDOG · SCANNING…'} · INTERVAL 30s
        </div>
      </Abs>
      {!vertical && (
        <>
          <Notice t={t} at={77.4} slot={0} title="每日端到端加密云端备份已就绪" body="保留 10 份 · 可一键恢复" />
          <Notice t={t} at={79.8} slot={1} title="离线根因诊断：家里市电断电" body="路由器 23:41 离线 · 来电后已自动恢复" />
        </>
      )}
      {vertical && (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: H * 0.73, transform: 'scale(0.95)' }}>
            <Notice t={t} at={79.8} slot={0} title="离线根因诊断：家里市电断电" body="来电后已自动恢复" />
          </div>
        </>
      )}
      <div style={{ position: 'absolute', left: 0, right: 0, top: vertical ? 170 : 80, textAlign: 'center', opacity: ramp(t, 74.3, 0.5, EASE.out) }}>
        <span style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: vertical ? 40 : 40, letterSpacing: '0.06em', color: C.text }}>
          30秒看门狗自动自愈<span style={{ color: C.cyan, margin: '0 0.5em' }}>·</span>断电断网微信精准推送
        </span>
      </div>
    </Abs>
  );
};

/* 终幕：一行命令 → 回车 → 输入框收成徽标底板 → 三块图元落槽拼成品牌徽标 */
const Finale: React.FC<{ t: number }> = ({ t }) => {
  const { W, H, vertical } = useV();
  const { fps } = useVideoConfig();
  const tw = vertical ? W - 100 : 920;
  const th = vertical ? 300 : 200;
  const markS = vertical ? 200 : 170;
  const markCx = W / 2;
  const markCy = vertical ? H * 0.36 : 300;
  const m = 0; // 终端不再变形为徽标，改为折叠坍缩成光核
  const cx = W / 2;
  const cy = vertical ? H * 0.5 : H * 0.53;
  const w = tw;
  const h = th;
  const r = 26;
  const flood = ramp(t, MORPH - 0.1, 0.45, EASE.out);
  const n = Math.floor(ramp(t, TYPE0, 1.25, EASE.linear) * CMD.length);
  const textFly = ramp(t, ENTER + 0.02, 0.4, EASE.exit);
  const caps = ramp(t, 82.5, 0.5, EASE.out) * (1 - ramp(t, ENTER, 0.35, EASE.exit));
  const slots = ramp(t, DROP[0] - 0.3, 0.2, EASE.out) * (1 - ramp(t, DROP[2] + 0.35, 0.3, EASE.linear));
  const drops = DROP.map((d) => springAt(t, d, fps, { damping: 13, stiffness: 260, mass: 0.8 }));
  // 回车 → 终端向内折叠（scaleY 1 → 0.02）→ 横向收成光核 → 光核爆发出徽标并升到落版位
  const collapseY = ramp(t, ENTER + 0.02, 0.22, EASE.exit);
  const collapseX = ramp(t, ENTER + 0.24, 0.1, EASE.exit);
  const coreY = vertical ? H * 0.5 : H * 0.53;
  const burst = springAt(t, ENTER + 0.34, fps, { damping: 12, stiffness: 180, mass: 0.8 });
  const rise = springAt(t, ENTER + 0.5, fps, { damping: 18, stiffness: 120, mass: 1 });
  const logoCy = mix(coreY, markCy, rise);
  const breathe = t > 88.8 ? 1 + 0.006 * Math.sin((t - 88.8) * 3) : 1;
  const enterFlash = t >= ENTER && t < ENTER + 0.15 ? 1 - (t - ENTER) / 0.15 : 0;
  const capData = [
    { k: '托管版 · 零门槛', a: '输入邀请码即得专属域名', b: '官网注册领 7 天免费试用', col: C.blue },
    { k: '自建版 · 全掌控', a: '自有 Cloudflare 域名', b: '端到端加密备份 · MIT 协议开源', col: C.violet },
  ];
  return (
    <Abs style={{ inset: 0 }}>
      <AuroraBG intensity={mix(0.8, 1.25, ramp(t, ENTER, 1.2, EASE.out))} />
      <Abs style={{ inset: 0, transform: `scale(${breathe})` }}>
        {/* 顶部大字 */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: vertical ? H * 0.22 : 150, textAlign: 'center', opacity: ramp(t, FIN + 0.1, 0.5, EASE.out) * (1 - ramp(t, ENTER, 0.3, EASE.exit)) }}>
          <span style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: vertical ? 38 : 46, letterSpacing: '0.05em', color: C.text }}>
            托管版免折腾即刻上手<span style={{ color: C.text3, margin: '0 0.45em' }}>·</span>自建版 MIT 协议全开源
          </span>
        </div>
        {/* 终端窗 → 徽标 */}
        {t < ENTER + 0.36 && (
          <div style={{ position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, borderRadius: r, overflow: 'hidden', transform: `scale(${mix(1, 0.02, collapseX)}, ${mix(1, 0.02, collapseY)})`, filter: collapseY > 0 ? `brightness(${1 + 3 * collapseY})` : undefined, background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(28px) saturate(165%)', boxShadow: `inset 0 1px 0 rgba(255,255,255,0.26), inset 0 0 0 1px rgba(255,255,255,0.1), 0 30px 80px rgba(0,0,0,0.5)` }}>
            <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${C.iconA}, ${C.iconB} 50%, ${C.iconC})`, clipPath: `circle(${flood * 150}% at 92% 80%)` }} />
            <div style={{ position: 'absolute', left: 22, top: 18, display: 'flex', gap: 9, opacity: 1 - m }}>
              {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />)}
              <span style={{ marginLeft: 14, fontFamily: FONT.mono, fontSize: 17, color: C.text3 }}>root@OpenWrt: ~</span>
            </div>
            <div style={{ position: 'absolute', left: 28, right: 28, top: 58, fontFamily: FONT.mono, fontSize: vertical ? 21 : 21, lineHeight: 1.6, color: '#e2e8f0', wordBreak: 'normal', overflowWrap: 'normal', opacity: 1 - textFly, transform: `translate(${textFly * 300}px, ${-textFly * 120}px) rotate(${-textFly * 6}deg)`, filter: textFly > 0 ? `blur(${textFly * 4}px)` : undefined }}>
              <span style={{ color: '#86efac' }}>root@OpenWrt:~# </span>
              {CMD.slice(0, n)}
              {t < ENTER && Math.floor(t * 2.5) % 2 === 0 && <span style={{ display: 'inline-block', width: 12, height: 26, background: '#e2e8f0', verticalAlign: 'middle' }} />}
            </div>
            {enterFlash > 0 && <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: enterFlash * 0.5 }} />}
          </div>
        )}
        {/* 流光粒子：代码化作光粒向中心聚拢 */}
        {t > ENTER && t < DROP[0] + 0.05 && (
          <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
            {Array.from({ length: 120 }, (_, i) => {
              const sx = W / 2 + (hash(i * 3) - 0.5) * tw;
              const sy = (vertical ? H * 0.5 : H * 0.53) + (hash(i * 5) - 0.35) * th * 0.7;
              const st = ENTER + hash(i * 7) * 0.22;
              const bz = (u: number) => {
                // 二次贝塞尔：控制点向外甩出一道弧（螺旋汇聚）
                const ang = hash(i * 11) * Math.PI * 2;
                const cxp = mix(sx, markCx, 0.4) + Math.cos(ang) * 320;
                const cyp = mix(sy, markCy, 0.4) + Math.sin(ang) * 200;
                const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
                return [a * sx + b * cxp + c * markCx, a * sy + b * cyp + c * markCy];
              };
              const u = ramp(t, st, DROP[0] - st, EASE.inQuad);
              const [hx, hy] = bz(u);
              const [tx2, ty2] = bz(Math.max(0, u - 0.14));
              const colr = i % 3 ? '#a5d8ff' : '#FFD2BF';
              return (
                <g key={i} opacity={Math.min(1, u * 6)}>
                  <line x1={tx2} y1={ty2} x2={hx} y2={hy} stroke={colr} strokeWidth={2} strokeLinecap="round" opacity={0.55} />
                  <circle cx={hx} cy={hy} r={7} fill={colr} opacity={0.22} />
                  <circle cx={hx} cy={hy} r={2.6} fill="#fff" />
                </g>
              );
            })}
          </svg>
        )}
        {/* 85.45s 汇聚点闪光 */}
        {t >= DROP[0] && t < DROP[0] + 0.7 && (
          <>
            <div style={{ position: 'absolute', left: markCx - 600, top: markCy - 600, width: 1200, height: 1200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(165,216,255,0.45) 18%, rgba(124,58,237,0.15) 40%, rgba(0,0,0,0) 65%)', opacity: Math.exp(-((t - DROP[0]) / 0.12) * 1.6) }} />
            <div style={{ position: 'absolute', left: markCx, top: markCy, width: 20 + 1400 * ramp(t, DROP[0], 0.6, EASE.out), height: 20 + 1400 * ramp(t, DROP[0], 0.6, EASE.out), transform: 'translate(-50%,-50%)', borderRadius: '50%', border: '2px solid rgba(200,230,255,0.9)', boxShadow: '0 0 30px rgba(124,58,237,0.7)', opacity: 1 - ramp(t, DROP[0], 0.6, EASE.linear) }} />
          </>
        )}
        {/* 落槽拼装徽标 */}
        {/* 光核：坍缩点爆闪 */}
        {t >= ENTER + 0.22 && t < ENTER + 1.0 && (
          <div style={{ position: 'absolute', left: W / 2 - 300, top: coreY - 300, width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(200,225,255,0.7) 10%, rgba(124,58,237,0.25) 30%, rgba(0,0,0,0) 60%)', opacity: t < ENTER + 0.34 ? ramp(t, ENTER + 0.22, 0.12, EASE.out) : Math.exp(-((t - ENTER - 0.34) / 0.16) * 1.4), transform: `scale(${0.3 + 0.9 * ramp(t, ENTER + 0.3, 0.4, EASE.out)})` }} />
        )}
        {t > ENTER + 0.32 && (
          <div style={{ position: 'absolute', left: markCx - markS / 2, top: logoCy - markS / 2, perspective: 900, transform: `scale(${burst})` }}>
            <div style={{ transform: `rotateX(${16 * (1 - ramp(t, DROP[0], 1.0, EASE.snappy)) + 2 * Math.sin(t * 0.9)}deg) rotateY(${-14 * (1 - ramp(t, DROP[0], 1.0, EASE.snappy)) + 3 * Math.sin(t * 0.7)}deg)`, filter: 'drop-shadow(0 2px 0 #3b2fb3) drop-shadow(0 4px 0 #2a2190) drop-shadow(0 6px 0 #1e1870) drop-shadow(0 24px 50px rgba(47,107,255,0.55))', position: 'relative' }}>
              <BrandMark size={markS} id="fin" plate={1} slots={slots} body={drops[0]} arc2={drops[1]} arc1={drops[2]} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: markS * 0.278, overflow: 'hidden', pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', top: -markS * 0.3, left: mix(-markS, markS * 1.4, ramp(t, DROP[2] + 0.2, 0.7, EASE.swift)), width: markS * 0.35, height: markS * 1.6, transform: 'rotate(20deg)', background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.55), rgba(255,255,255,0))' }} />
              </div>
            </div>
          </div>
        )}
        {/* 双版本选择胶囊 */}
        {caps > 0 &&
          capData.map((c, i) => {
            const side = i ? 1 : -1;
            const x = vertical ? 50 + i * (W / 2 - 25) : i ? W / 2 + tw / 2 + 24 : W / 2 - tw / 2 - 24 - 380;
            const y = vertical ? H * 0.64 : H * 0.53 - 90;
            return (
              <div key={i} style={{ position: 'absolute', left: x + side * (1 - caps) * 60, top: y, width: vertical ? W / 2 - 75 : 380, opacity: caps }}>
                <Glass radius={26} fill={0.08} style={{ position: 'relative', padding: '22px 26px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Dot color={c.col} size={12} />
                    <span style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 30, color: C.text }}>{c.k}</span>
                  </div>
                  <div style={{ fontFamily: FONT.sans, fontSize: 21, color: C.text2, marginTop: 12, lineHeight: 1.55 }}>
                    {c.a}
                    <br />
                    {c.b}
                  </div>
                </Glass>
              </div>
            );
          })}
        {/* 金属拉丝边框落版：自中心向两侧拉开，边上一道扫光 */}
        {t > WORD - 0.1 && !vertical && (() => {
          const k = ramp(t, WORD - 0.1, 0.7, EASE.snappy);
          const top = markCy - markS / 2 - 56;
          const hgt = markS + 56 + 34 + 100 + 34 + 70 + 34 + 52 + 40;
          const sheen = ((t - WORD) * 0.35) % 1;
          return (
            <svg width={1520} height={hgt} style={{ position: 'absolute', left: W / 2 - 760, top, overflow: 'visible', clipPath: `inset(-20px ${(1 - k) * 50}% -20px ${(1 - k) * 50}%)` }}>
              <defs>
                <linearGradient id="metal" x1="0" y1="0" x2="1" y2="0.25" gradientTransform={`rotate(${sheen * 40 - 20} 0.5 0.5)`}>
                  {[['#4b5563', 0], ['#e5e7eb', 0.16], ['#9ca3af', 0.3], ['#f8fafc', 0.48], ['#6b7280', 0.62], ['#d1d5db', 0.8], ['#4b5563', 1]].map(([c, o]) => (
                    <stop key={o as number} offset={o as number} stopColor={c as string} />
                  ))}
                </linearGradient>
              </defs>
              {/* 金属拉丝描边（只描边、不填充）+ 内侧一圈发丝高光 */}
              <rect x={1} y={1} width={1518} height={hgt - 2} rx={40} fill="rgba(255,255,255,0.015)" stroke="url(#metal)" strokeWidth={2.5} />
              <rect x={7} y={7} width={1506} height={hgt - 14} rx={34} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
            </svg>
          );
        })()}
        {/* 品牌字标 + 落版 */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: markCy + markS / 2 + 34, textAlign: 'center' }}>
          <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: vertical ? 72 : 86, color: C.text, letterSpacing: '-0.005em', opacity: ramp(t, WORD, 0.6, EASE.out), transform: `translateY(${(1 - ramp(t, WORD, 0.6, EASE.out)) * 16}px)` }}>
            OpenWrt <span style={{ background: `linear-gradient(90deg, ${C.iconA}, ${C.iconB} 50%, ${C.iconC})`, WebkitBackgroundClip: 'text', color: 'transparent' }}>Claude</span> Panel
          </div>
          <div style={{ marginTop: 34, display: 'flex', justifyContent: 'center', opacity: ramp(t, LINKS, 0.6, EASE.out), transform: `translateY(${(1 - ramp(t, LINKS, 0.6, EASE.out)) * 12}px)` }}>
            <Glass radius={999} fill={0.07} style={{ position: 'relative', padding: '16px 36px', display: 'flex', gap: 26, alignItems: 'center', flexDirection: vertical ? 'column' : 'row' }}>
              <span style={{ fontFamily: FONT.sans, fontSize: 30, color: C.text2 }}>
                官网 <b style={{ fontFamily: FONT.mono, color: C.text, fontWeight: 700 }}>yrlove520.com</b>
              </span>
              {!vertical && <span style={{ width: 1.5, height: 30, background: 'rgba(255,255,255,0.25)' }} />}
              <span style={{ fontFamily: FONT.sans, fontSize: 30, color: C.text2 }}>
                GitHub <b style={{ fontFamily: FONT.mono, color: C.text, fontWeight: 700 }}>wznwzn123/openwrt-claude-panel</b>
              </span>
            </Glass>
          </div>
          <div style={{ marginTop: 34, opacity: ramp(t, STAR, 0.6, EASE.out) * 0.88 }}>
            <Pill bg="rgba(255,255,255,0.06)" style={{ fontSize: 24, padding: '10px 24px', fontWeight: 500 }}>
              <span style={{ color: '#FFD27A' }}>★</span> 点赞支持 · GitHub 点亮 Star
            </Pill>
          </div>
        </div>
      </Abs>
    </Abs>
  );
};

export const Act5: React.FC = () => {
  const t = useT();
  const { W, H } = useV();
  const x = ramp(t, HUD_OUT, FIN - HUD_OUT + 0.15, EASE.smooth);
  return (
    <Abs style={{ inset: 0, overflow: 'hidden', background: C.hud }}>
      {t < FIN + 0.15 && (
        <Abs style={{ inset: 0, transform: `scale(${1 + 0.08 * x})` }}>
          <Watchdog t={t} />
        </Abs>
      )}
      {t >= HUD_OUT && (
        <>
          <Abs style={{ inset: 0, clipPath: `circle(${x * Math.hypot(W, H) * 0.6}px at 50% 53%)` }}>
            <Finale t={t} />
          </Abs>
          {x > 0 && x < 1 && <div style={{ position: 'absolute', left: W / 2, top: H * 0.53, width: 2 * x * Math.hypot(W, H) * 0.6, height: 2 * x * Math.hypot(W, H) * 0.6, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: '3px solid rgba(165,243,252,0.95)', boxShadow: '0 0 30px rgba(6,182,212,0.9)' }} />}
        </>
      )}
      <Vignette strength={0.4} />
      <Grain opacity={0.1} />
    </Abs>
  );
};
