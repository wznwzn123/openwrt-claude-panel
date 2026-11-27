// 各家机场的节点命名（6.0，用户 11/28 第 6 项「适配：各家机场节点命名测试」）：
// 节点自动换、分流单节点「先同名再同地区」都靠 node_meta（地区、类型、倍率）和 sp_fam（去掉编号后一样就算同名）认节点。
// 这里收集常见机场的写法：国旗、中文、英文、缩写、城市、机场代码、编号在前在后、倍率各种写法、IPLC / IEPL / 中转 / 家宽、订阅里的说明节点（剩余流量、到期时间）。
// 用真的 lib.uc（node_meta）和 42-split.uc 里的 sp_fam 跑，ucode 正则在 OpenWrt（musl）上跟这里一样（\b、多字节字符在 [] 外面）
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_node_names.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
// [名字, 地区, 类型, 倍率]
const META = [
	['🇭🇰 香港 01', 'HK', 'std', 1], ['🇭🇰香港03 专线 3x', 'HK', 'line', 3], ['香港 IEPL 01 [1.5x]', 'HK', 'line', 1.5], ['HK-01', 'HK', 'std', 1], ['HKG 02', 'HK', 'std', 1],
	['Hong Kong 01', 'HK', 'std', 1], ['[SS] 香港 A01', 'HK', 'std', 1], ['港 01', 'HK', 'std', 1], ['香港01 | 0.8x', 'HK', 'std', 0.8], ['V1 香港 01', 'HK', 'std', 1],
	['香港 BGP 中转 01', 'HK', 'relay', 1], ['HK 家宽 x2', 'HK', 'home', 2], ['香港 01 ×3', 'HK', 'std', 3], ['香港 02 倍率:2', 'HK', 'std', 2], ['香港 03 2倍', 'HK', 'std', 2],
	['🇺🇸 美国 洛杉矶 01', 'US', 'std', 1], ['US-LAX-01', 'US', 'std', 1], ['🇺🇸 United States 01', 'US', 'std', 1], ['美国 圣何塞 IPLC 01 2x', 'US', 'line', 2], ['USA 02', 'US', 'std', 1],
	['🇯🇵 日本 东京 01', 'JP', 'std', 1], ['JP Tokyo 2.0x', 'JP', 'std', 2], ['日本大阪 02', 'JP', 'std', 1], ['Japan 03 x1.5', 'JP', 'std', 1.5],
	['🇸🇬 新加坡 01 倍率:0.5', 'SG', 'std', 0.5], ['SG 02', 'SG', 'std', 1], ['狮城 03', 'SG', 'std', 1], ['Singapore 04', 'SG', 'std', 1],
	['🇹🇼 台湾 01 Hinet', 'TW', 'std', 1], ['TW-02', 'TW', 'std', 1], ['台灣 03 家寬', 'TW', 'home', 1], ['Taiwan 04', 'TW', 'std', 1],
	['🇰🇷 韩国 首尔 01', 'KR', 'std', 1], ['KR 02', 'KR', 'std', 1], ['🇬🇧 英国 01', 'GB', 'std', 1], ['UK London 02', 'GB', 'std', 1],
	['🇩🇪 德国 法兰克福 01', 'DE', 'std', 1], ['🇳🇱 荷兰 01', 'NL', 'std', 1], ['🇨🇦 加拿大 01', 'CA', 'std', 1], ['🇦🇺 澳大利亚 悉尼 01', 'AU', 'std', 1],
	['🇷🇺 俄罗斯 01', 'RU', 'std', 1], ['🇮🇳 印度 01', 'IN', 'std', 1], ['🇹🇷 土耳其 01', 'TR', 'std', 1], ['🇲🇾 马来西亚 01', 'MY', 'std', 1], ['🇹🇭 泰国 01', 'TH', 'std', 1],
	['🇻🇳 越南 01', 'VN', 'std', 1], ['🇵🇭 菲律宾 01', 'PH', 'std', 1], ['🇦🇪 迪拜 01', 'AE', 'std', 1], ['🇦🇷 阿根廷 01', 'AR', 'std', 1], ['🇧🇷 巴西 01', 'BR', 'std', 1], ['🇲🇴 澳门 01', 'MO', 'std', 1],
	// 订阅里的说明节点：认不出地区，不能被当成同地区的候选
	['剩余流量：120.5 GB', '?', 'std', 1], ['套餐到期：2026-12-31', '?', 'std', 1], ['距离下次重置剩余：12 天', '?', 'std', 1], ['官网 example.com', '?', 'std', 1],
	// 容易认错的：「港」以外的字里不该认成香港；「Max」「Box」里的 x 不是倍率
	['Proxy 01', '?', 'std', 1], ['Box 3 节点', '?', 'std', 1],
];
// 同名（只差编号）：同一组的 sp_fam 要一样
const SAME = [
	['🇭🇰香港03 专线 3x', '🇭🇰香港01 专线 3x', '🇭🇰香港12 专线 3x'],
	['🇹🇼台湾03 专线 3x', '🇹🇼台湾02 专线 3x'],
	['HK-01', 'HK-02', 'HK-15'],
	['香港 IEPL 01 [1.5x]', '香港 IEPL 02 [1.5x]'],
	['🇺🇸 美国 洛杉矶 01', '🇺🇸 美国 洛杉矶 02'],
	['US-LAX-01', 'US-LAX-09'],
	['JP Tokyo 01 2.0x', 'JP Tokyo 02 2.0x'],
	['🇸🇬 新加坡 01 倍率:0.5', '🇸🇬 新加坡 02 倍率:0.5'],
	['香港 01 ×3', '香港 02 ×3'],
	['V1 香港 01', 'V1 香港 02'],
];
// 不算同名：倍率不同、类型不同、城市不同、地区不同
const DIFF = [
	['🇭🇰香港03 专线 3x', '🇭🇰香港03 专线 1x'], ['🇭🇰香港03 专线 3x', '🇭🇰香港03 3x'], ['香港 IEPL 01 [1.5x]', '香港 IEPL 01 [2x]'],
	['🇺🇸 美国 洛杉矶 01', '🇺🇸 美国 圣何塞 01'], ['HK-01', 'TW-01'], ['JP Tokyo 01 2.0x', 'JP Tokyo 01 1.0x'], ['香港 01 ×3', '香港 01 ×2'],
];
const names = [...new Set([...META.map((x) => x[0]), ...SAME.flat(), ...DIFF.flat()])];
const src = fs.readFileSync(new URL('../../src/mcp/42-split.uc', import.meta.url), 'utf8');
const fam = src.match(/function sp_fam\(n\) \{[\s\S]*?\n\}/)[0];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpnn-'));
fs.writeFileSync(dir + '/names.json', JSON.stringify(names));
fs.writeFileSync(dir + '/t.uc', `'use strict';\nimport * as L from 'cmcp.lib';\nimport { readfile } from 'fs';\n${fam}\nlet out = {};\nfor (let n in json(readfile(${JSON.stringify(dir + '/names.json')}))) out[n] = { ...L.node_meta(n), f: sp_fam(n) };\nprint(sprintf('%J', out));\n`);
const r = spawnSync('sh', ['-c', UC + ' ' + JSON.stringify(dir + '/t.uc')], { encoding: 'utf8' });
let o = {};
try { o = JSON.parse(r.stdout); } catch (e) { console.log(r.stdout, r.stderr); process.exit(1); }
const badMeta = META.filter(([n, reg, kind, mult]) => !o[n] || o[n].reg !== reg || o[n].kind !== kind || o[n].mult !== mult).map(([n, reg, kind, mult]) => `${n}：要 ${reg}/${kind}/${mult}，认成 ${o[n]?.reg}/${o[n]?.kind}/${o[n]?.mult}`);
ok(`地区、类型、倍率：${META.length} 种写法都认对（国旗、中文、英文、缩写、城市、机场代码、倍率 3x / x2 / ×3 / 2倍 / 倍率:2 / [1.5x]）`, !badMeta.length, badMeta.join('；'));
const badSame = SAME.filter((g) => new Set(g.map((n) => o[n]?.f)).size !== 1).map((g) => g.map((n) => n + '→' + o[n]?.f).join(' | '));
ok(`同名（只差编号）：${SAME.length} 组都认成同名`, !badSame.length, badSame.join('；'));
const badDiff = DIFF.filter(([a, b]) => o[a]?.f === o[b]?.f).map(([a, b]) => a + ' = ' + b);
ok(`倍率、类型、城市、地区不同的不算同名：${DIFF.length} 对`, !badDiff.length, badDiff.join('；'));
ok('订阅里的说明节点（剩余流量、到期时间、官网）认不出地区，不会被当成同地区的候选', ['剩余流量：120.5 GB', '套餐到期：2026-12-31', '距离下次重置剩余：12 天'].every((n) => o[n]?.reg === '?'));
fs.rmSync(dir, { recursive: true, force: true });
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[1] || !x[2] ? '' : '（' + x[2] + '）')).join('\n'));
const n = results.filter((x) => x[1]).length;
console.log(`\n通过 ${n}/${results.length}`);
process.exit(n === results.length ? 0 : 1);
