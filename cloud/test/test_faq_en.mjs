// 官网英文常见问题（#102）：每条默认中文问答都有英文，英文对应的就是现在这版中文（中文改了要跟着改英文）
import crypto from 'crypto';
import { FAQ_DEFAULT, FAQ_CATS } from '../faq-default.js';
import { FAQ_EN, FAQ_CATS_EN } from '../faq-en.js';
let bad = 0;
const fail = (m) => { bad++; console.log('✗ ' + m); };
const h = (x) => crypto.createHash('sha1').update(x.q + '\n' + x.a).digest('hex').slice(0, 10);
for (const x of FAQ_DEFAULT) {
	const e = FAQ_EN[x.id];
	if (!e) { fail('没有英文：' + x.id); continue; }
	if (e.zh !== h(x)) fail('中文改过、英文没跟着改：' + x.id + '（改完英文把 zh 换成 ' + h(x) + '）');
	for (const k of ['q', 'a']) if (/[㐀-鿿]/.test(e[k].replace(/[（(][^（）()]*[㐀-鿿][^（）()]*[）)]/g, '').replace(/[“「][^”」]*[”」]/g, '').replace(/[“"][^”"]*[㐀-鿿][^”"]*[”"]/g, ''))) fail('英文里有括号外的中文：' + x.id + '.' + k);
	if (/\]\(\/(help|compat|status|privacy|terms|security|changelog|notice)\b/.test(e.a)) fail('站内链接没换成 /en/：' + x.id);
}
for (const id of Object.keys(FAQ_EN)) if (!FAQ_DEFAULT.some((x) => x.id === id)) fail('英文多了一条：' + id);
for (const c of FAQ_CATS) if (!FAQ_CATS_EN[c.k]) fail('分类没有英文：' + c.k);
console.log(bad ? '\n通过 0/' + bad + '（' + bad + ' 项不对）' : '✓ 英文常见问题 ' + FAQ_DEFAULT.length + ' 条都对得上\n\n通过 1/1');
process.exit(bad ? 1 : 0);
