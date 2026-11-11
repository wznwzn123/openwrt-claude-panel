// 把 src/cues.ts（中央音效表）导出成 out/cues.json，给 audio/score.py 用
import { build } from 'esbuild';
import fs from 'node:fs';
await build({ entryPoints: ['src/cues.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'out/cues.bundle.mjs', loader: { '.png': 'empty' }, logLevel: 'error' });
const m = await import(new URL('../out/cues.bundle.mjs', import.meta.url).href + '?t=' + Date.now());
fs.writeFileSync('out/cues.json', JSON.stringify({ fps: 30, music: m.MUSIC, cues: m.CUES }, null, 1));
console.log('cues', m.CUES.length);
