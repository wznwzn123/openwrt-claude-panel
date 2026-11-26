#!/usr/bin/env node
// 发布时给 SHA256SUMS 签名（usign / signify 格式，Ed25519）。路由器一键更新时用写死在 src/bin/cmcp-update 里的公钥验签：
// 官网（下载中转）被人控制了，也没法让路由器装上改过的安装包。
//
// 6.0 第 52 项：换了一把新的签名密钥。私钥只在 GitHub 的仓库密钥 RELEASE_SIGN_KEY_V6 里（不在对话、代码、日志里）：
//   - 新密钥签 SHA256SUMS.sig2，6.0 起的路由器只认它（公钥写死在 src/bin/cmcp-update）
//   - 旧密钥（仓库密钥 RELEASE_SIGN_KEY）签 SHA256SUMS.sig，只给还没升到 6.0 的老路由器用（它们只认旧公钥），
//     等大家都升到 6.0 以后在仓库设置里删掉 RELEASE_SIGN_KEY，就不再签旧的
// 私钥写法：32 字节种子的 base64；或者 32 个字符以上的随机字符串（用它的 SHA-256 当种子，方便在手机上用密码生成器生成）
// 用法：node tools/sign.mjs dist/SHA256SUMS          → 用新密钥写 dist/SHA256SUMS.sig2（跟一键更新脚本里的公钥对不上就报错，不签）
//       node tools/sign.mjs --old dist/SHA256SUMS    → 用旧密钥写 dist/SHA256SUMS.sig（跟下面写死的旧公钥对不上就报错）
//       node tools/sign.mjs --consts                 → 打印新密钥对应的三个值（写进一键更新脚本用；只打印公钥和测试签名，不打印私钥）
// 测试用：CMCP_SIGN_ANY=1 不检查公钥（测试用自己临时生成的密钥）
import { createPrivateKey, createPublicKey, createHash, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// 6.0 以前的发布公钥（老路由器里写死的就是它）：用来确认 RELEASE_SIGN_KEY 还是原来那把
const OLD_UPUB = 'RWTjaBd8Y8ESbCUksln6ozZ4pQfXiYVRTp/c+hEJr+rhh1iHxhShNPQc';
// 6.0 的发布公钥（6.0 的 src/bin/cmcp-update 里写死的）。5.3.x 的 cmcp-update 还用旧公钥（要能验 6.0 尝鲜版上的旧签名），
// 所以 5.3.x 发布时新密钥对着这里核对；签出来的 SHA256SUMS.sig2 让 6.0 尝鲜版能「退回正式版」到 5.3.x
const NEW_UPUB = 'RWQntnhab0CCxMKwdhGL1UPRuIJU9Md8fdLGumVFAQ/Bm2yiuZD7EDld';

const die = (m) => { console.error('签名失败：' + m); process.exit(1); };
const args = process.argv.slice(2), old = args[0] === '--old';
if (old) args.shift();
const envName = old ? 'RELEASE_SIGN_KEY' : 'RELEASE_SIGN_KEY_V6';
const raw = String(process.env[envName] || '').trim();
let seed = Buffer.from(raw, 'base64');
if (seed.length !== 32 || seed.toString('base64') !== raw) seed = raw.length >= 32 ? createHash('sha256').update(raw, 'utf8').digest() : null;
if (!seed) die('没有设置 ' + envName + '（GitHub 仓库密钥），或者太短（要 32 个字符以上的随机字符串）');
const priv = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
const spki = createPublicKey(priv).export({ format: 'der', type: 'spki' }), pk = spki.subarray(-32);
const keynum = createHash('sha512').update(pk).digest().subarray(0, 8);
const b64 = (...a) => Buffer.concat(a).toString('base64');
const ED = Buffer.from('Ed');
const upub = b64(ED, keynum, pk), pem = spki.toString('base64');
const sigOf = (msg) => b64(ED, keynum, sign(null, msg, priv));
// 自检用的固定内容：一键更新先拿它试一下验签工具（对的能过、改一个字就过不了，才用这个工具）
const SELFTEST = Buffer.from('cmcp release key selftest\n');

if (args[0] === '--consts') {
	console.log('UPUB=' + upub + '\nPPUB=' + pem + '\nSTSIG=' + sigOf(SELFTEST));
	process.exit(0);
}
const file = args[0];
if (!file) die('用法：node tools/sign.mjs [--old] dist/SHA256SUMS');
if (process.env.CMCP_SIGN_ANY !== '1') {
	let want = OLD_UPUB;
	if (!old) want = NEW_UPUB;
	if (want !== upub) die(envName + ' 跟' + (old ? '旧的发布公钥' : ' 6.0 的发布公钥') + '对不上');
}
const msg = readFileSync(file), out = file + (old ? '.sig' : '.sig2');
writeFileSync(out, 'untrusted comment: signed by key ' + keynum.toString('hex') + '\n' + sigOf(msg) + '\n');
console.log('已签名：' + out + '（公钥 ' + keynum.toString('hex') + '）');
