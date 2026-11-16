#!/usr/bin/env node
// 发布时给 SHA256SUMS 签名（usign / signify 格式，Ed25519）。路由器一键更新时用写死在 src/bin/cmcp-update 里的公钥验签：
// 官网（下载中转）被人控制了，也没法让路由器装上改过的安装包。私钥只放在 GitHub 的仓库密钥 RELEASE_SIGN_KEY 里（32 字节种子的 base64）
// 用法：node tools/sign.mjs dist/SHA256SUMS   → 写 dist/SHA256SUMS.sig（私钥跟一键更新脚本里的公钥对不上就报错，不签）
//       node tools/sign.mjs --consts          → 打印一键更新脚本里要写死的三个值（换密钥时用；只打印公钥和测试签名，不打印私钥）
// 测试用：CMCP_SIGN_ANY=1 不检查公钥是否跟脚本里的一样（测试用自己临时生成的密钥）
import { createPrivateKey, createPublicKey, createHash, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const die = (m) => { console.error('签名失败：' + m); process.exit(1); };
const seed = Buffer.from(String(process.env.RELEASE_SIGN_KEY || '').trim(), 'base64');
if (seed.length !== 32) die('没有设置 RELEASE_SIGN_KEY（GitHub 仓库密钥），或者格式不对');
const priv = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
const spki = createPublicKey(priv).export({ format: 'der', type: 'spki' }), pk = spki.subarray(-32);
const keynum = createHash('sha512').update(pk).digest().subarray(0, 8);
const b64 = (...a) => Buffer.concat(a).toString('base64');
const ED = Buffer.from('Ed');
const upub = b64(ED, keynum, pk), pem = spki.toString('base64');
const sigOf = (msg) => b64(ED, keynum, sign(null, msg, priv));
// 自检用的固定内容：一键更新先拿它试一下验签工具（对的能过、改一个字就过不了，才用这个工具）
const SELFTEST = Buffer.from('cmcp release key selftest\n');

if (process.argv[2] === '--consts') {
	console.log('UPUB=' + upub + '\nPPUB=' + pem + '\nSTSIG=' + sigOf(SELFTEST));
	process.exit(0);
}
const file = process.argv[2];
if (!file) die('用法：node tools/sign.mjs dist/SHA256SUMS');
if (process.env.CMCP_SIGN_ANY !== '1') {
	const sh = readFileSync(new URL('../src/bin/cmcp-update', import.meta.url), 'utf8');
	const want = (/^UPUB=\$\{CMCP_UPUB:-([A-Za-z0-9+/=]+)\}/m.exec(sh) || [])[1];
	if (want !== upub) die('RELEASE_SIGN_KEY 跟 src/bin/cmcp-update 里写死的公钥对不上（换了密钥要先用 --consts 更新脚本）');
}
const msg = readFileSync(file);
writeFileSync(file + '.sig', 'untrusted comment: signed by key ' + keynum.toString('hex') + '\n' + sigOf(msg) + '\n');
console.log('已签名：' + file + '.sig（公钥 ' + keynum.toString('hex') + '）');
