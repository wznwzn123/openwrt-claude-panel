import React from 'react';
import { Img, staticFile } from 'remotion';
import { EASE, FONT, mix, ramp } from './core';
import { BrandMark, Tap } from './visual';

/* ── 第三幕手机屏：全部来自仓库 src/www/panel 真实界面（capture/capture.js 用本地演示数据 3× 实机渲染），
   这里只负责按时间轴切换真实状态、叠点击反馈；坐标均为面板 CSS 像素（视口 393×852）── */
const VW = 393;
const VH = 852;
const shot = (n: string) => staticFile(`shots/real/${n}.png`);
const Frame: React.FC<{ w: number; children: React.ReactNode; bg?: string }> = ({ w, children, bg }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: VW, height: VH, transform: `scale(${w / VW})`, transformOrigin: '0 0', overflow: 'hidden', fontFamily: FONT.sans, background: bg }}>{children}</div>
);
const Shot: React.FC<{ n: string; style?: React.CSSProperties }> = ({ n, style }) => <Img src={shot(n)} style={{ position: 'absolute', left: 0, top: 0, width: VW, height: VH, ...style }} />;
// 量自真实 DOM（rects.json → steps）
const R = {
  pxPick: [34, 331.2, 325, 38.9],
  grpTest: [290, 150, 48, 27.6],
  rows: [193.1, 265.1, 337.1, 409.1, 481.1],
  devPause: [98, 687.6, 48, 27.6],
  sheetAdd: [311, 719.1, 58, 34.8],
  lkFp: [53.5, 629.6, 78, 78],
};
const cx = (r: number[]) => r[0] + r[2] / 2;
const cy = (r: number[]) => r[1] + r[3] / 2;
/* 底部弹层出入：真实面板的 sheet 自下而上，背景同时模糊变暗（两张截图交叉：底页 → 带弹层页） */
const sheetMix = (k: number) => ({ clipPath: `inset(${(1 - k) * 100}% 0 0 0)`, opacity: Math.min(1, k * 3) });

/* 系统通知横幅（iOS 样式，片中演示「异常自动切换」的推送提醒） */
const Banner: React.FC<{ k: number; title: string; body: string }> = ({ k, title, body }) => (
  <div style={{ position: 'absolute', left: 10, right: 10, top: 58, padding: '11px 13px', borderRadius: 20, background: 'rgba(250,250,252,0.86)', backdropFilter: 'blur(20px)', boxShadow: '0 10px 30px rgba(0,0,0,0.16)', display: 'flex', gap: 10, alignItems: 'center', opacity: k, transform: `translateY(${(1 - k) * -90}px)` }}>
    <BrandMark size={34} id="bn" />
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111' }}>{title}</div>
      <div style={{ fontSize: 13, color: '#3a3a3c', marginTop: 1, lineHeight: 1.35 }}>{body}</div>
    </div>
    <div style={{ marginLeft: 'auto', alignSelf: 'flex-start', fontSize: 11.5, color: '#8e8e93' }}>现在</div>
  </div>
);

const tapAt = (t: number, at: number, x: number, y: number) =>
  t > at - 0.45 && t < at + 0.6 ? (
    <Tap x={x} y={y} press={ramp(t, at - 0.08, 0.08, EASE.out) * (1 - ramp(t, at + 0.08, 0.15, EASE.out))} ring={ramp(t, at, 0.45, EASE.out)} opacity={ramp(t, at - 0.45, 0.2, EASE.out) * (1 - ramp(t, at + 0.4, 0.2, EASE.out))} />
  ) : null;

/* 主机：概览页 → 点「扩展套件」→ 识别到的套件列表 → 进入线路页 → 测速 → 当前线路超时 → 自动切换 + 推送 */
export const PluginScreen: React.FC<{ t: number; w: number }> = ({ t, w }) => {
  const PICK = 31.45;
  const pick = ramp(t, PICK + 0.1, 0.38, EASE.snappy) * (1 - ramp(t, 35.55, 0.3, EASE.smooth));
  const PUSH = 35.95; // 应用内页面推入
  const push = ramp(t, PUSH, 0.42, EASE.smooth);
  const TEST = 37.15;
  const SW = 39.35;
  const switched = ramp(t, SW, 0.3, EASE.out);
  const banner = ramp(t, SW + 0.05, 0.4, EASE.snappy) * (1 - ramp(t, 40.3, 0.3, EASE.smooth));
  return (
    <Frame w={w}>
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-push * VW * 0.3}px)`, filter: push > 0 ? `brightness(${1 - push * 0.15})` : undefined }}>
        <Shot n="home" />
        {pick > 0 && <Shot n="home-pick" style={sheetMix(pick)} />}
        {tapAt(t, PICK, cx(R.pxPick) + 110, cy(R.pxPick))}
      </div>
      {push > 0 && (
        <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(1 - push) * VW}px)`, boxShadow: '-12px 0 30px rgba(0,0,0,0.12)' }}>
          <Shot n="proxy-pending" />
          {/* 逐行出测速结果（真实「测速后」截图按行揭开） */}
          {R.rows.map((y, i) => {
            const k = ramp(t, TEST + 0.25 + i * 0.16, 0.18, EASE.out);
            return k > 0 ? <Shot key={i} n="proxy-tested" style={{ clipPath: `inset(${y}px 0 ${VH - y - 64}px 0)`, opacity: k }} /> : null;
          })}
          {t > TEST + 0.25 && <Shot n="proxy-tested" style={{ clipPath: `inset(80px 0 ${VH - 190}px 0)`, opacity: ramp(t, TEST + 1.1, 0.2, EASE.out) }} />}
          {switched > 0 && <Shot n="proxy-switched" style={{ opacity: switched }} />}
          {tapAt(t, TEST, cx(R.grpTest), cy(R.grpTest))}
          {/* 测速进行中：组标题处细进度条 */}
          {t > TEST && t < TEST + 1.2 && <div style={{ position: 'absolute', left: 31, top: 184, height: 3, borderRadius: 2, width: 331 * ramp(t, TEST, 1.1, EASE.linear), background: '#007aff', opacity: 1 - ramp(t, TEST + 1.05, 0.15, EASE.out) }} />}
        </div>
      )}
      <Banner k={banner} title="路由器面板" body="备用线路 05 超时，已自动切换到低延迟线路 01（38 ms）" />
    </Frame>
  );
};

/* 设备页 → 点「儿童平板」的暂停 → 弹层 → 点「添加」每天 23:00–07:00 定时断网（真实 pause_set 流程） */
export const DEVICES: Array<{ n: string; ip: string; route: string; color: string; dn: number[] }> = [
  { n: '书房台式机', ip: '192.168.1.10', route: '直连', color: '#2f6bff', dn: [12.4, 3.1] },
  { n: '客厅电视', ip: '192.168.1.23', route: '4K 本地影音加速', color: '#7c3aed', dn: [38.6, 0.4] },
  { n: '儿童平板', ip: '192.168.1.36', route: '直连', color: '#f59e0b', dn: [2.3, 0.2] },
];
export const TOGGLE_AT = 44.586; // 116 BPM 拍点

export const DevicesScreen: React.FC<{ t: number; w: number }> = ({ t, w }) => {
  const OPEN = 43.6;
  const sheet = ramp(t, OPEN + 0.08, 0.38, EASE.snappy);
  const added = ramp(t, TOGGLE_AT + 0.05, 0.16, EASE.out);
  return (
    <Frame w={w}>
      <Shot n="dev0" />
      {sheet > 0 && <Shot n="dev-sheet0" style={sheetMix(sheet)} />}
      {added > 0 && <Shot n="dev-sheet1" style={{ opacity: added }} />}
      {tapAt(t, OPEN, cx(R.devPause), cy(R.devPause))}
      {tapAt(t, TOGGLE_AT, cx(R.sheetAdd), cy(R.sheetAdd))}
    </Frame>
  );
};

/* 桌面图标（白色线性图标取自面板 NAV_IC） */
const APP_IC: Array<[string, string]> = [
  ['M4 7h16v10H4z|M4 7l8 6 8-6', '#34c759'],
  ['M12 3v2M12 19v2M3 12h2M19 12h2|M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', '#ff9500'],
  ['M9 18V6l10-2v12|M6 18a3 3 0 1 0 0-.1', '#ff2d55'],
  ['M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z|M12 10h.01', '#0a84ff'],
  ['M4 20h4L19 9l-4-4L4 16z', '#af52de'],
  ['M12 7.5V12l3 2|M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', '#5e5ce6'],
  ['M7 18.5h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.4 9.6 4.5 4.5 0 0 0 7 18.5z', '#30b0c7'],
  ['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3', '#8e8e93'],
  ['', ''],
  ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z', '#34c759'],
  ['M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z', '#ff3b30'],
  ['M4 11l8-7 8 7v9H4z|M10 20v-5h4v5', '#ff9500'],
  ['M3 13l18-8-8 18-2-8z', '#0a84ff'],
  ['M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01', '#5e5ce6'],
  ['M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z|M3 12h18', '#00c7be'],
  ['M8 5v14l11-7z', '#ff2d55'],
];

/* PWA：浏览器 → 分享 → 添加到主屏幕 → 桌面图标 → 真实面板锁（指纹）→ 面板 */
export const PwaFlow: React.FC<{ t: number; w: number; a: number }> = ({ t, w, a }) => {
  const sheet = ramp(t, a + 0.35, 0.4, EASE.snappy);
  const add = a + 1.05;
  const home = t >= a + 1.55;
  const iconPop = ramp(t, a + 1.7, 0.45, EASE.snappy);
  const lock = t >= a + 2.45;
  const fp = ramp(t, a + 3.25, 0.7, EASE.linear);
  const unlocked = t >= a + 4.05;
  const panelIn = ramp(t, a + 4.05, 0.45, EASE.snappy);
  const fx = cx(R.lkFp), fy = cy(R.lkFp);
  return (
    <Frame w={w}>
      {!home && (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, filter: `brightness(${1 - sheet * 0.4})` }}>
            <Shot n="main" />
            {/* Safari 底部地址栏 */}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 96, background: 'rgba(246,246,250,0.94)', backdropFilter: 'blur(20px)', borderTop: '0.5px solid rgba(0,0,0,0.12)' }}>
              <div style={{ position: 'absolute', left: 14, right: 14, top: 8, height: 44, borderRadius: 13, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 15, color: '#111' }}>
                <svg width={12} height={14} viewBox="0 0 12 14"><rect x="1" y="6" width="10" height="7.5" rx="2" fill="#111" /><path d="M3.3 6V4.4a2.7 2.7 0 0 1 5.4 0V6" stroke="#111" strokeWidth="1.5" fill="none" /></svg>
                你的专属域名
              </div>
            </div>
          </div>
          <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 26, background: 'rgba(242,242,247,0.97)', padding: 14, transform: `translateY(${(1 - sheet) * 380}px)`, boxShadow: '0 -8px 30px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <BrandMark size={44} id="pwa-s" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>路由器面板</div>
                <div style={{ fontSize: 12.5, color: '#8e8e93' }}>你的专属域名</div>
              </div>
            </div>
            {['拷贝', '添加到主屏幕', '添加书签'].map((s, i) => (
              <div key={s} style={{ height: 50, borderRadius: 12, background: i === 1 && t > add ? '#d8e7ff' : '#fff', marginBottom: 8, display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 16.5, fontWeight: i === 1 ? 650 : 500, color: '#111' }}>
                {s}
                <svg style={{ marginLeft: 'auto' }} width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                  {i === 0 && <><rect x="8" y="8" width="11" height="12" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>}
                  {i === 1 && <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8.5v7M8.5 12h7" /></>}
                  {i === 2 && <path d="M7 4h10v16l-5-3.5L7 20z" />}
                </svg>
              </div>
            ))}
          </div>
          {tapAt(t, add, 196, 739)}
        </div>
      )}
      {home && !lock && (
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 20% 15%, #4f7cff 0%, rgba(79,124,255,0) 50%), radial-gradient(circle at 85% 80%, #c45cff 0%, rgba(196,92,255,0) 55%), linear-gradient(160deg, #1e3a8a, #5b21b6 60%, #0e7490)' }}>
          {APP_IC.map(([d, col], i) => {
            const isNew = i === 8;
            const x = 27 + (i % 4) * 90;
            const y = 96 + Math.floor(i / 4) * 104;
            return (
              <div key={i} style={{ position: 'absolute', left: x, top: y, width: 68, textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, margin: '0 auto', borderRadius: 15, background: isNew ? 'transparent' : `linear-gradient(180deg, ${col}, ${col}cc)`, transform: isNew ? `scale(${iconPop})` : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: isNew ? undefined : '0 2px 6px rgba(0,0,0,0.18)' }}>
                  {isNew ? (
                    <BrandMark size={64} id="pwa" />
                  ) : (
                    <svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                      {d.split('|').map((p, j) => <path key={j} d={p} />)}
                    </svg>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: '#fff', marginTop: 5, opacity: isNew ? iconPop : 0.85, whiteSpace: 'nowrap' }}>{isNew ? '路由器面板' : ['邮件', '天气', '音乐', '地图', '备忘录', '时钟', '云盘', '设置', '', '电话', '健康', '家庭', '导航', '提醒', '浏览器', '视频'][i]}</div>
              </div>
            );
          })}
          {t > a + 2.0 && <Tap x={27 + 34} y={96 + 2 * 104 + 32} ring={ramp(t, a + 2.3, 0.4, EASE.out)} opacity={ramp(t, a + 2.0, 0.15, EASE.out)} />}
        </div>
      )}
      {lock && (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Shot n="lock" />
          {/* 指纹验证：图标处扫描光 + 识别成功变绿 */}
          <div style={{ position: 'absolute', left: fx - 46, top: fy - 46, width: 92, height: 92, borderRadius: 46, boxShadow: `0 0 0 2px ${unlocked ? 'rgba(52,199,89,0.95)' : `rgba(96,165,250,${0.4 + 0.5 * fp})`}, 0 0 26px ${unlocked ? 'rgba(52,199,89,0.6)' : 'rgba(96,165,250,0.45)'}`, opacity: ramp(t, a + 2.9, 0.25, EASE.out) }} />
          {fp > 0 && fp < 1 && <div style={{ position: 'absolute', left: fx - 34, width: 68, top: fy - 34 + fp * 68, height: 2, background: '#60a5fa', boxShadow: '0 0 12px #60a5fa' }} />}
          {unlocked && (
            <div style={{ position: 'absolute', inset: 0, transform: `translateY(${(1 - panelIn) * VH}px)` }}>
              <Shot n="main" />
            </div>
          )}
        </div>
      )}
    </Frame>
  );
};

/* 原生安卓客户端：仓库 android/ 的真实首页（capture/android.js 实机截图）——
   粘贴登录地址 → 添加即打开该路由器面板 → 返回列表多了一台 →「打开」切到另一台 */
const AR = { paste: [263.3, 152.2, 113.7, 92.4], add: [299, 328.1, 62, 45.3], card0: [16, 449.2, 361, 111.1], open2: [308, 716, 53, 34.9] };
export const AndroidFlow: React.FC<{ t: number; w: number; a: number }> = ({ t, w, a }) => {
  const PASTE = a + 0.35;
  const ADD = a + 1.0;
  const BACK = a + 2.1;
  const switchAt = 51.25;
  const pasted = ramp(t, PASTE + 0.1, 0.18, EASE.out);
  const open1 = ramp(t, ADD + 0.12, 0.38, EASE.snappy) * (1 - ramp(t, BACK, 0.38, EASE.smooth));
  const back = t >= BACK;
  const glow = ramp(t, BACK + 0.25, 0.3, EASE.out) * (1 - ramp(t, BACK + 1.6, 0.5, EASE.smooth));
  const open2 = ramp(t, switchAt + 0.12, 0.38, EASE.snappy);
  const slide = (k: number) => ({ transform: `translateX(${(1 - k) * VW}px)`, boxShadow: '-12px 0 30px rgba(0,0,0,0.35)' });
  return (
    <Frame w={w} bg="#0b1024">
      {!back ? (
        <>
          <Shot n="and-home2" />
          {pasted > 0 && <Shot n="and-home2-paste" style={{ opacity: pasted }} />}
          {tapAt(t, PASTE, cx(AR.paste), cy(AR.paste))}
          {tapAt(t, ADD, cx(AR.add), cy(AR.add))}
        </>
      ) : (
        <>
          <Shot n="and-home3" />
          {/* 新加入的路由器：卡片描边轻亮一下 */}
          <div style={{ position: 'absolute', left: AR.card0[0], top: AR.card0[1], width: AR.card0[2], height: AR.card0[3], borderRadius: 22, boxShadow: `0 0 0 2px rgba(10,132,255,${0.9 * glow}), 0 0 24px rgba(10,132,255,${0.45 * glow})` }} />
          {tapAt(t, switchAt, cx(AR.open2), cy(AR.open2))}
        </>
      )}
      {open1 > 0 && <div style={{ position: 'absolute', inset: 0, ...slide(open1) }}><Shot n="main-dark" /></div>}
      {open2 > 0 && <div style={{ position: 'absolute', inset: 0, ...slide(open2) }}><Shot n="main-dark" /></div>}
    </Frame>
  );
};
