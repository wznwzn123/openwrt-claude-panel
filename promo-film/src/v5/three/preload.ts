// 预加载：@remotion/three 的画布只在帧变化时重画，异步加载完的纹理赶不上当前帧。
// 所以在 3D 画布挂载之前，把全片要用的图片纹理和文字纹理一次性准备好，组件里同步取用。
import * as THREE from 'three';
import { staticFile } from 'remotion';

export const TEX = new Map<string, THREE.Texture>();
export const LABEL = new Map<string, THREE.CanvasTexture>();

const IMAGES = ['ui/desk-home.png', 'ui/desk-dev.png', 'ui/desk-pause.png', 'ui/desk-wd.png', 'ui/desk-speed.png', 'ui/desk-term.png', 'ui/desk-files.png', 'ui/home-dark-full.png'];

const loadTex = (src: string) => new Promise<void>((res) => {
  new THREE.TextureLoader().load(staticFile(src), (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    TEX.set(src, t); res();
  }, undefined, () => res());
});

export const labelKey = (title: string, sub: string) => title + '|' + sub;
const drawLabel = (title: string, sub: string) => {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.font = '800 150px "JetBrains Mono Variable"'; g.textBaseline = 'alphabetic'; g.fillText(title, 18, 170);
  g.fillStyle = 'rgba(200,214,255,0.85)'; g.font = '500 58px "JetBrains Mono Variable"'; g.fillText(sub, 24, 270);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  LABEL.set(labelKey(title, sub), t);
};

let started: Promise<void> | null = null;
export const preloadAll = (labels: [string, string][]) => {
  if (!started) started = (async () => {
    await Promise.all(IMAGES.map(loadTex));
    await Promise.all([document.fonts.load('800 150px "JetBrains Mono Variable"'), document.fonts.load('500 58px "JetBrains Mono Variable"')]);
    labels.forEach(([a, b]) => drawLabel(a, b));
  })();
  return started;
};
