// 把中央音效表导出成 JSON，给 audio/score*.py 用
//   node tools/dump-cues.mjs                 → src/cues.ts    → out/cues.json   （v3）
//   node tools/dump-cues.mjs src/v4/cues.ts  → out/cues4.json （v4）
import { build } from 'esbuild';
import fs from 'node:fs';
const src = process.argv[2] || 'src/cues.ts';
const out = src.includes('v4') ? 'out/cues4.json' : 'out/cues.json';
fs.mkdirSync('out', { recursive: true });
await build({ entryPoints: [src], bundle: true, platform: 'node', format: 'esm', outfile: 'out/cues.bundle.mjs', loader: { '.png': 'empty' }, logLevel: 'error' });
const m = await import(new URL('../out/cues.bundle.mjs', import.meta.url).href + '?t=' + Date.now());
fs.writeFileSync(out, JSON.stringify({ fps: 30, music: m.MUSIC, cues: m.CUES }, null, 1));
console.log('cues', m.CUES.length, '→', out);
