// 把 src 里出现的所有非 ASCII 字符收集起来，FontGate 在开头一次性预加载（fontsource 按子集懒加载）
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src');
const set = new Set('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,:;!?·—–-+/()[]{}<>「」『』（）：，。、？！%#@&*_=|'.split(''));
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(tsx?|json)$/.test(f) && !f.includes('glyphs')) for (const ch of fs.readFileSync(p, 'utf8')) if (ch.charCodeAt(0) > 127) set.add(ch); } };
walk(root);
fs.writeFileSync(path.join(root, 'data/glyphs.json'), JSON.stringify({ text: [...set].join('') }));
console.log('glyphs', set.size);
