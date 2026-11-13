// 第七版：按帧号补渲（单帧故障修复 / 局部文案修改），输出 out/patch/<合成名>/<帧号>.png
// 用法：node scripts/render_frames.mjs Promo90 2822 3553-3589 ...
import { bundle } from '@remotion/bundler';
import { selectComposition, renderFrames } from '@remotion/renderer';
import fs from 'node:fs'; import path from 'node:path';
const [comp, ...specs] = process.argv.slice(2);
const ranges = specs.map((s) => { const [a, b] = s.split('-').map(Number); return [a, b ?? a]; });
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const chromiumOptions = { gl: 'swangle' };
const composition = await selectComposition({ serveUrl, id: comp, chromiumOptions });
const out = path.resolve('out/patch', comp); fs.mkdirSync(out, { recursive: true });
for (const [a, b] of ranges) {
  const tmp = path.join(out, `_tmp_${a}`); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);
  await renderFrames({ serveUrl, composition, frameRange: [a, b], outputDir: tmp, imageFormat: 'png', concurrency: 2, chromiumOptions,
    onStart: () => {}, onFrameUpdate: () => {}, inputProps: {} });
  const files = fs.readdirSync(tmp).filter((f) => f.endsWith('.png')).sort();
  if (files.length !== b - a + 1) throw new Error(`${comp} ${a}-${b}: 期望 ${b - a + 1} 帧，得到 ${files.length}`);
  files.forEach((f, i) => fs.renameSync(path.join(tmp, f), path.join(out, `${a + i}.png`)));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${comp} ${a}-${b} ✓`);
}
process.exit(0);
