// 老浏览器（Chrome 111 以前）不认 color-mix：每一处前面都要先写一个同名属性的普通颜色（11/27 全面检查第 30 条：原来输入框选中时没有高亮框）
const fs = require('fs'), path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'panel', '10-style.css'), 'utf8');
const bad = [];
let n = 0;
for (const m of css.matchAll(/([a-z-]+):([^;{}]*color-mix[^;{}]*)/g)) {
	n++;
	const blk = css.slice(css.lastIndexOf('{', m.index) + 1, m.index).split(';').map((d) => d.trim()).filter(Boolean);
	const prev = blk[blk.length - 1] || '';
	if (!prev.startsWith(m[1] + ':') || /color-mix/.test(prev)) bad.push(m[0].slice(0, 90));
}
console.log((bad.length ? '✗ ' : '✓ ') + `color-mix 共 ${n} 处，前面都有老浏览器认得的颜色` + (bad.length ? '：缺 ' + bad.join(' | ') : ''));
console.log(`通过 ${bad.length ? 0 : 1}/1`);
process.exit(bad.length ? 1 : 0);
