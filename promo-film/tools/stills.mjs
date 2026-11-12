// 一次打包，渲多张静帧（检查画面用）：node tools/stills.mjs out/stills 60 160 300 ...
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path'; import fs from 'node:fs';
const [outDir, ...frames] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const browserExecutable = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const chromiumOptions = { gl: 'swangle' };
const composition = await selectComposition({ serveUrl, id: 'Film', browserExecutable, chromiumOptions });
for (const fr of frames.map(Number)) {
  await renderStill({ serveUrl, composition, frame: fr, output: path.join(outDir, `f${String(fr).padStart(4, '0')}.jpg`), imageFormat: 'jpeg', jpegQuality: 85, scale: 0.5, browserExecutable, chromiumOptions });
  process.stdout.write(fr + ' ');
}
console.log('done');
