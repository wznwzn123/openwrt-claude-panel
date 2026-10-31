// 生成 Web Push 用的 VAPID 密钥对：node gen-vapid.mjs
// 输出两行，分别设成 Worker 的 VAPID_PRIV 和 VAPID_PUB 密钥
import { generateKeyPairSync } from 'node:crypto';
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = privateKey.export({ format: 'jwk' });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url');
console.log('VAPID_PRIV=' + JSON.stringify(jwk));
console.log('VAPID_PUB=' + pub);
