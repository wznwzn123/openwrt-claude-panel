// 批量静帧：一次 bundle，多帧 renderStill。用法：node scripts/stills.mjs <Comp> <outDir> t1,t2,...（秒）[scale]
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';
const [comp = 'Promo90', outDir = 'out/stills', times = '1', scale = '0.5'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts'), publicDir: path.resolve('public') });
const composition = await selectComposition({ serveUrl, id: comp, chromiumOptions: { gl: 'swangle' } });
for (const s of times.split(',').map(Number)) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(s * composition.fps));
  const output = path.join(outDir, `${comp}_${s.toFixed(2)}s.png`);
  const t0 = Date.now();
  await renderStill({ serveUrl, composition, frame, output, scale: Number(scale), chromiumOptions: { gl: 'swangle' } });
  console.log(output, Date.now() - t0, 'ms');
}
