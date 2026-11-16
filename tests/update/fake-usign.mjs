// 测试用的 usign：照着 OpenWrt usign 的 main.c 写的验签（-V -q -m 文件 -p 公钥文件 -x 签名文件）：
// 文件第一行是说明、跳过；后面 base64 解出来长度要正好对；开头要是 Ed；然后 Ed25519 验签。用来测一键更新脚本调用 usign 的那条路
import { readFileSync } from 'node:fs';
import { createPublicKey, verify } from 'node:crypto';
const a = process.argv.slice(2), opt = (k) => a[a.indexOf(k) + 1];
if (!a.includes('-V')) process.exit(1);
const b64file = (f, size) => { const t = readFileSync(f, 'utf8'), i = t.indexOf('\n'); if (i < 0) process.exit(1); const b = Buffer.from(t.slice(i + 1).trim(), 'base64'); if (b.length !== size || b.subarray(0, 2).toString() !== 'Ed') process.exit(1); return b; };
const sig = b64file(opt('-x'), 2 + 8 + 64), pub = b64file(opt('-p'), 2 + 8 + 32);
const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub.subarray(10)]), format: 'der', type: 'spki' });
process.exit(verify(null, readFileSync(opt('-m')), key, sig.subarray(10)) ? 0 : 1);
