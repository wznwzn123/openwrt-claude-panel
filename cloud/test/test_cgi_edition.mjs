// 6.0 第 94 项（路由器这边的面板接口）：托管版的版本、换版本（只有主账号）、本地版的 AI 连接器地址、
// 托管服务到期 / 停用时局域网入口和 AI 连接器也挡住（只留看状态、输续期码）
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_edition.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const TMPF = ['/tmp/cmcp_pass.json', '/tmp/cmcp_sudo.json', '/tmp/cmcp_sudo_fail.json', '/tmp/cmcp_devseen.json', '/tmp/cmcp_svc.json', '/tmp/cmcp_fam.json'];
const clean = () => { for (const f of TMPF) try { fs.rmSync(f); } catch (e) {} };
clean();
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcped-'));
const CFG = E + '/uci'; fs.mkdirSync(CFG);
fs.writeFileSync(CFG + '/network', "config interface 'lan'\n\toption ipaddr '192.168.6.1'\n");
const TOKEN = 'tok' + 'e'.repeat(30), CKEY = 'k'.repeat(40);
const conf = (x) => fs.writeFileSync(E + '/config.json', JSON.stringify({ token: TOKEN, ckey: CKEY, uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, ...x }));
conf({});
fs.writeFileSync(E + '/lan_port', '906\n');
const BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpbin-'));
fs.writeFileSync(BIN + '/ubus', `#!/bin/sh
case "$1 $2" in
"list session") echo session ;;
"call session") case "$3" in login) case "$4" in *'"right-pw"'*) echo '{"ubus_rpc_session":"0123456789abcdef0123456789abcdef"}' ;; *) exit 6 ;; esac ;; destroy) exit 0 ;; esac ;;
esac
`, { mode: 0o755 });
fs.writeFileSync(BIN + '/cmcp-notify', '#!/bin/sh\nexit 0\n', { mode: 0o755 });
fs.writeFileSync(BIN + '/cmcp-edition', `#!/bin/sh\necho "$*" >> ${BIN}/ed.calls\n`, { mode: 0o755 });
fs.writeFileSync(E + '/shadow', 'root:$1$ab$cdefghijklmnopqrstuvw:19000:0:99999:7:::\n');
const ST = E + '/ed.json';
const X = { PATH: BIN + ':' + process.env.PATH, CMCP_SHADOW: E + '/shadow', CMCP_LAN_T: E + '/lt', CMCP_SBIN: BIN, CMCP_ED_ST: ST, REMOTE_ADDR: '192.168.6.20', HTTP_HOST: '192.168.6.1:906', CONTENT_TYPE: 'application/json' };
const cgi = (pathInfo, msg) => new Promise((z) => {
	const body = JSON.stringify(msg);
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, ...X, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: pathInfo, REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)) } });
	let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
let rid = 0;
const err = (r) => (r && r.error ? r.error.message : '');
const code = (r) => (r && r.error ? r.error.code : 0);
const lan = (m, params) => cgi('/lan', { jsonrpc: '2.0', id: ++rid, method: 'panel/' + m, params, client: 'panel' });
let PS = '';
const pas = async (dev, m, params) => {
	if (!PS) PS = (await cgi('/pass', { jsonrpc: '2.0', id: ++rid, method: 'panel/pass_new', params: { dev }, client: 'panel' })).result?.pass;
	return cgi('/pass', { jsonrpc: '2.0', id: ++rid, method: 'panel/' + m, params: params || {}, client: 'panel', pass: PS });
};
const ai = (method, params) => cgi('/' + CKEY, { jsonrpc: '2.0', id: ++rid, method, params: params || {} });
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));

// ---------- 自建版：没有换版本 ----------
const D0 = (await lan('lan_pw', { pw: 'right-pw', name: 'PC' })).result?.dev;
let r = await pas(D0, 'edition_get');
ok('自建版：没有版本可换', r.result && r.result.ed === null, JSON.stringify(r));
r = await pas(D0, 'edition_set', { to: 'local' });
ok('自建版：换版本说清楚只有托管版有', /只有托管版/.test(err(r)));
ok('自建版 whoami：ed 是空的', (await pas(D0, 'whoami')).result?.ed === null);

// ---------- 托管版 ----------
fs.writeFileSync(E + '/hub.conf', 'HUB=http://127.0.0.1:9\nSUB=abcdefgh\n');
fs.writeFileSync(E + '/cloud.conf', 'URL=http://127.0.0.1:9/cloud\nRKEY=' + 'r'.repeat(32) + '\n');
fs.writeFileSync('/tmp/cmcp_svc.json', JSON.stringify({ at: Math.floor(Date.now() / 1000), exp: 0, off: false }));
r = await pas(D0, 'whoami');
ok('托管版 AI 版：whoami 报 ai', r.result?.ed === 'ai', JSON.stringify(r).slice(0, 200));
fs.writeFileSync(E + '/local', '');
ok('有本地版记号：报 local', (await pas(D0, 'whoami')).result?.ed === 'local');
r = await pas(D0, 'edition_get');
ok('edition_get：版本、局域网地址、能不能换', r.result?.ed === 'local' && r.result?.lan?.url === 'http://192.168.6.1:906/panel/' && r.result?.owner === true, JSON.stringify(r.result));
r = await pas(D0, 'edition_set', { to: 'local' });
ok('已经是本地版：说清楚', /已经是本地版/.test(err(r)));
r = await pas(D0, 'edition_set', { to: 'xx' });
ok('乱写的版本：不认', /哪个版本/.test(err(r)));
r = await pas(D0, 'edition_set', { to: 'ai' });
ok('主账号换成 AI 版：马上回复（后台去换），给编号', r.result?.ok === true && /^[a-z2-9]{10}$/.test(r.result?.id || ''), JSON.stringify(r));
const id = r.result?.id;
ok('先写好进度（准备中）', JSON.parse(fs.readFileSync(ST, 'utf8')).state === 'run');
await sleep(1600);
ok('在后台运行 cmcp-edition to-ai 编号', (fs.readFileSync(BIN + '/ed.calls', 'utf8') || '').trim() === 'to-ai ' + id, fs.existsSync(BIN + '/ed.calls') ? fs.readFileSync(BIN + '/ed.calls', 'utf8') : '没调用');
r = await pas(D0, 'edition_set', { to: 'ai' });
ok('正在换的时候不能再换', /正在换版本/.test(err(r)));
r = await pas(D0, 'edition_state');
ok('edition_state：看得到进度', r.result?.job?.id === id && r.result?.ed === 'local');
fs.writeFileSync(ST, JSON.stringify({ id, to: 'ai', state: 'fail', step: 'tunnel', msg: 'x', at: 1 }));

// 本地版的 AI 连接器地址：家里的地址
const su = (await pas(D0, 'sudo_local', { pw: 'right-pw' })).result?.sudo;
r = await pas(D0, 'ckey_info', { sudo: su });
ok('本地版：AI 连接器地址是家里局域网的地址', r.result?.url === 'http://192.168.6.1:906/cgi-bin/mcp/' + CKEY, JSON.stringify(r).slice(0, 200));
fs.rmSync(E + '/local');
fs.writeFileSync(E + '/hostname', 'abcdefgh.panel.example\n');
r = await pas(D0, 'ckey_info', { sudo: su });
ok('AI 版：还是专属网址', r.result?.url === 'https://abcdefgh.panel.example/cgi-bin/mcp/' + CKEY);
conf({ ai: false });
ok('旧的托管纯面板版：报 noai', (await pas(D0, 'whoami')).result?.ed === 'noai');
conf({});

// ---------- 托管服务到期 ----------
fs.writeFileSync('/tmp/cmcp_svc.json', JSON.stringify({ at: Math.floor(Date.now() / 1000), exp: 1, off: true, why: 'exp' }));
r = await pas(D0, 'overview');
ok('到期了：局域网入口也不能用（-32016），说清楚怎么续期', code(r) === -32016 && /到期了/.test(err(r)) && /续期码/.test(err(r)), JSON.stringify(r).slice(0, 200));
r = await pas(D0, 'whoami');
ok('到期了：whoami 照常回答，带 svc_off', r.result && r.result.svc_off === 'exp');
r = await pas(D0, 'svc_info');
ok('到期了：能看服务状态', r.result && r.result.off === true && r.result.why === 'exp', JSON.stringify(r).slice(0, 200));
r = await pas(D0, 'svc_renew', { code: 'x' });
ok('到期了：能输续期码（码不对照常报错，不是被挡）', code(r) !== -32016);
r = await ai('tools/call', { name: 'router_status', arguments: {} });
ok('到期了：AI 连接器调工具也挡住', code(r) === -32016, JSON.stringify(r).slice(0, 200));
r = await ai('tools/list', {});
ok('到期了：AI 连接器握手照常（调工具时才说）', !r.error, JSON.stringify(r).slice(0, 120));
r = await pas(D0, 'edition_set', { to: 'local' });
ok('到期了：不能换版本', code(r) === -32016);
fs.writeFileSync('/tmp/cmcp_svc.json', JSON.stringify({ at: Math.floor(Date.now() / 1000), exp: 1, off: true, why: 'admin' }));
r = await pas(D0, 'overview');
ok('被停用（不是到期）：说联系提供服务的人', code(r) === -32016 && /停用/.test(err(r)));
fs.writeFileSync('/tmp/cmcp_svc.json', JSON.stringify({ at: Math.floor(Date.now() / 1000), exp: 0, off: false }));
r = await pas(D0, 'overview');
ok('续上以后：恢复正常', code(r) !== -32016);
fs.writeFileSync('/tmp/cmcp_svc.json', JSON.stringify({ at: Math.floor(Date.now() / 1000), exp: 1, off: true, why: 'exp' }));
fs.rmSync(E + '/hub.conf');
r = await pas(D0, 'overview');
ok('自建版不受官网到期影响', code(r) !== -32016);

clean();
fs.rmSync(E, { recursive: true, force: true }); fs.rmSync(BIN, { recursive: true, force: true });
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + note)); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);
