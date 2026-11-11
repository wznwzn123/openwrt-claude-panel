// WebGL 极光底 + 液态玻璃透镜。渲染管线照搬 mg-styles-15 demos/12-aurora-glass/main.js：
//   aurora（半分辨率）→ [透镜要用：降采样 + 高斯模糊] → lens（全分辨率，折射 + 色散 + 菲涅尔 + 高光）→ 泛光 → final（颗粒、暗角、抖动）
// 每一帧都是帧号的纯函数（Remotion 逐帧 delayRender，渲完 gl.finish 再放行），可复现。
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { continueRender, delayRender, staticFile, useCurrentFrame } from 'remotion';
import { FS_AURORA, FS_BLUR, FS_DOWN, FS_FINAL, FS_LENS, VS } from './shaders';

export type Lens = {
  on: number; cx: number; cy: number; hx: number; hy: number; r: number; bezel: number; mag: number; lift: number;
  glint: number; ring: number; rimGlow: number; wave: [number, number, number]; disp?: number;
};
export type Ripple = [number, number, number, number]; // x, y, 半径, 强度

const RW = 1920, RH = 1080, AW = 960, AH = 540, QW = 480, QH = 270;
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
// 配色：产品图标的紫 / 蓝 / 青为主，品红只做一小块余光（mg-styles 原片的 7 个色斑结构不变，颜色换成本产品的）
const PAL = { base: '#05060d', violet: '#6a4dff', blue: '#2f6bff', cyan: '#00c2d8', magenta: '#b653f0', indigo: '#2a239e', periwinkle: '#8c8cff' };

function loopBezier(pts: number[][], period: number, phase: number) {
  const n = pts.length;
  return (t: number) => {
    const u = ((((t / period + phase) % 1) + 1) % 1) * n;
    const i = Math.floor(u), s = u - i;
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    const a = 1 - s;
    return [0, 1].map((k) => a * a * a * p1[k] + 3 * a * a * s * c1[k] + 3 * a * s * s * c2[k] + s * s * s * p2[k]);
  };
}
const BLOBS = [
  { col: PAL.violet, rx: 470, ry: 300, ang: 18, i: 1.15, path: loopBezier([[600, 300], [780, 240], [840, 420], [560, 460]], 30, 0.05) },
  { col: PAL.magenta, rx: 400, ry: 230, ang: -28, i: 0.75, path: loopBezier([[1560, 170], [1720, 330], [1380, 360], [1300, 130]], 34, 0.6) },
  { col: PAL.cyan, rx: 360, ry: 260, ang: 32, i: 1.0, path: loopBezier([[1500, 860], [1320, 700], [1160, 660], [1420, 980]], 26, 0.12) },
  { col: PAL.blue, rx: 500, ry: 250, ang: -8, i: 0.95, path: loopBezier([[820, 880], [560, 800], [700, 980], [1060, 920]], 36, 0.5) },
  { col: PAL.indigo, rx: 560, ry: 380, ang: 0, i: 0.32, path: loopBezier([[1020, 540], [1160, 470], [1080, 640], [880, 600]], 40, 0.3) },
  { col: PAL.periwinkle, rx: 240, ry: 170, ang: 10, i: 0.45, path: loopBezier([[1180, 420], [1060, 520], [900, 560], [1120, 360]], 24, 0.1) },
  { col: '#3036D8', rx: 460, ry: 210, ang: -6, i: 0.55, path: loopBezier([[1180, 1090], [1320, 1040], [1060, 1010], [980, 1080]], 32, 0.2) },
];

function gaussTaps(sigma: number) {
  const R = Math.min(29, Math.max(1, Math.ceil(sigma * 3)));
  const w: number[] = []; let sum = 0;
  for (let i = 0; i <= R; i++) { const v = Math.exp(-i * i / (2 * sigma * sigma)); w.push(v); sum += i ? 2 * v : v; }
  for (let i = 0; i <= R; i++) w[i] /= sum;
  const offs = [0], ws = [w[0]];
  for (let i = 1; i <= R; i += 2) { const a = w[i], b = i + 1 <= R ? w[i + 1] : 0, s = a + b; offs.push(s > 0 ? (i * a + (i + 1) * b) / s : i); ws.push(s); }
  while (offs.length < 16) { offs.push(0); ws.push(0); }
  return { offs: new Float32Array(offs.slice(0, 16)), ws: new Float32Array(ws.slice(0, 16)), n: Math.min(16, Math.ceil(R / 2) + 1) };
}
const TAPS_LENS = gaussTaps(22 / 4), TAPS_BLOOM = gaussTaps(40 / 4);

type Target = { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number };
type Prog = { p: WebGLProgram; loc: Record<string, WebGLUniformLocation | null> };
type GLState = { gl: WebGL2RenderingContext; P: Record<string, Prog>; T: Record<string, Target>; grain: WebGLTexture; vao: WebGLVertexArrayObject };

function init(canvas: HTMLCanvasElement, grainImg: HTMLImageElement): GLState {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: false })!;
  if (!gl) throw new Error('webgl2 unavailable');
  const hasFloat = !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  const IFMT = hasFloat ? gl.RGBA16F : gl.RGBA8, TYPE = hasFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  const compile = (fs: string): Prog => {
    const mk = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram()!; gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const loc: Prog['loc'] = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i)!; loc[u.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, u.name); }
    return { p, loc };
  };
  const target = (w: number, h: number): Target => {
    const tex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, IFMT, w, h, 0, gl.RGBA, TYPE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  };
  const grain = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, grain);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, grainImg);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return {
    gl, grain, vao: gl.createVertexArray()!,
    P: { aurora: compile(FS_AURORA), down: compile(FS_DOWN), blur: compile(FS_BLUR), lens: compile(FS_LENS), final: compile(FS_FINAL) },
    T: { scene: target(AW, AH), lens: target(RW, RH), q1: target(QW, QH), q2: target(QW, QH), qL: target(QW, QH), qB: target(QW, QH) },
  };
}

function render(S: GLState, frame: number, energy: number, ripple: Ripple, lens: Lens | null) {
  const { gl, P, T } = S;
  const t = frame / 30;
  const use = (prog: Prog, target: Target | null) => {
    gl.useProgram(prog.p);
    if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); gl.viewport(0, 0, target.w, target.h); } else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, RW, RH); }
    const w = target ? target.w : RW, h = target ? target.h : RH;
    if (prog.loc.uRes) gl.uniform2f(prog.loc.uRes, w, h);
    if (prog.loc.uDPR) gl.uniform1f(prog.loc.uDPR, target ? target.w / RW : 1);
    return prog.loc as Record<string, WebGLUniformLocation>;
  };
  const bindTex = (unit: number, tex: WebGLTexture, loc: WebGLUniformLocation) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(loc, unit); };
  const draw = () => { gl.bindVertexArray(S.vao); gl.drawArrays(gl.TRIANGLES, 0, 3); };
  const blurInto = (src: Target, dst: Target, taps: ReturnType<typeof gaussTaps>, thresh = 0) => {
    let L = use(P.down, T.q2); bindTex(0, src.tex, L.uSrc); gl.uniform2f(L.uSrcTexel, 1 / src.w, 1 / src.h); gl.uniform1f(L.uThresh, thresh); draw();
    L = use(P.blur, T.q1); bindTex(0, T.q2.tex, L.uSrc); gl.uniform2f(L.uDir, 1, 0); gl.uniform1fv(L.uOff, taps.offs); gl.uniform1fv(L.uW, taps.ws); gl.uniform1i(L.uN, taps.n); draw();
    L = use(P.blur, dst); bindTex(0, T.q1.tex, L.uSrc); gl.uniform2f(L.uDir, 0, 1); gl.uniform1fv(L.uOff, taps.offs); gl.uniform1fv(L.uW, taps.ws); gl.uniform1i(L.uN, taps.n); draw();
  };

  // ---- 极光（半分辨率；它本来就是大面积柔光，半分辨率看不出差别）
  let L = use(P.aurora, T.scene);
  gl.uniform1f(L.uT, t);
  const NB = BLOBS.length;
  const blobs = new Float32Array(4 * NB), blobE = new Float32Array(2 * NB), cols = new Float32Array(3 * NB);
  BLOBS.forEach((b, i) => { const p = b.path(t); blobs.set([p[0], p[1], b.rx, b.i], i * 4); blobE.set([b.ry, (b.ang * Math.PI) / 180 + 0.08 * Math.sin(t * 0.3 + i)], i * 2); cols.set(hex(b.col), i * 3); });
  gl.uniform4fv(L.uBlob, blobs); gl.uniform2fv(L.uBlobE, blobE); gl.uniform3fv(L.uBlobC, cols);
  gl.uniform4fv(L.uRipple, new Float32Array(ripple));
  gl.uniform3fv(L.uBase, new Float32Array(hex(PAL.base)));
  gl.uniform1f(L.uGain, 0.1 + 0.95 * energy); gl.uniform1f(L.uWarp, 150);
  gl.uniform3fv(L.uCamO, new Float32Array([960, 540, -1600])); gl.uniform1f(L.uF, 1600);
  gl.uniform3fv(L.uSC, new Float32Array(9)); gl.uniform3fv(L.uSU, new Float32Array(9)); gl.uniform3fv(L.uSV, new Float32Array(9)); gl.uniform3fv(L.uSN, new Float32Array(9)); gl.uniform4fv(L.uSH, new Float32Array(12));
  gl.uniform1f(L.uMotes, 1);
  draw();

  // ---- 液态玻璃透镜（只在收尾出现；不在时这一步只是把极光放大到全分辨率）
  const on = lens ? lens.on : 0;
  if (on > 0) blurInto(T.scene, T.qL, TAPS_LENS);
  L = use(P.lens, T.lens);
  bindTex(0, T.scene.tex, L.uScene); bindTex(1, (on > 0 ? T.qL : T.scene).tex, L.uBlur);
  gl.uniform1f(L.uOn, on);
  if (lens && on > 0) {
    gl.uniform2f(L.uLC, lens.cx, lens.cy); gl.uniform2f(L.uLH, lens.hx, lens.hy); gl.uniform1f(L.uLR, lens.r);
    gl.uniformMatrix2fv(L.uLM, false, new Float32Array([1, 0, 0, 1]));
    gl.uniform3f(L.uBead, 0, 0, 0); gl.uniform1f(L.uBeadK, 0); gl.uniform1f(L.uBeadA, 1);
    gl.uniform1f(L.uBezel, lens.bezel); gl.uniform1f(L.uDepth, lens.bezel * 0.9);
    gl.uniform1f(L.uIor, 1.5); gl.uniform1f(L.uDisp, lens.disp ?? 0.25); gl.uniform1f(L.uMag, lens.mag);
    gl.uniform1f(L.uRefrSign, -1); gl.uniform1f(L.uMaxDisp, lens.bezel * 0.85); gl.uniform1f(L.uRimGlow, lens.rimGlow); gl.uniform1f(L.uRing, lens.ring);
    if (L.uHide) gl.uniform1f(L.uHide, 0);
    gl.uniform1f(L.uRingW, 0); gl.uniform1f(L.uWarm, 0); gl.uniform1f(L.uCW, 0);
    gl.uniform2f(L.uRGl, 0, 0); gl.uniform3f(L.uWave, lens.wave[0], lens.wave[1], lens.wave[2]); gl.uniform1f(L.uCaustic, 0.22 * lens.lift);
    gl.uniform1f(L.uLift, lens.lift); gl.uniform1f(L.uGlint, lens.glint);
    gl.uniform3f(L.uLight3, -0.5, -0.78, 0.62); gl.uniform1f(L.uFrostRim, 0.1); gl.uniform1f(L.uFres, 0.25); gl.uniform1f(L.uBzExp, 2.5);
  }
  draw();

  // ---- 泛光 + 收尾（颗粒、暗角、抖动防色带）
  blurInto(T.lens, T.qB, TAPS_BLOOM, 0.62);
  L = use(P.final, null);
  bindTex(0, T.lens.tex, L.uSrc); bindTex(1, T.qB.tex, L.uBloom); bindTex(2, S.grain, L.uGrain);
  gl.uniform1f(L.uBloomAmt, 0.22); gl.uniform1f(L.uGrainAmt, 0.12); gl.uniform1f(L.uFrame, frame); gl.uniform1f(L.uVig, 0.22); gl.uniform1f(L.uFade, 1);
  draw();
  gl.finish();
}

export const AuroraGL: React.FC<{ energy: number; ripple: Ripple; lens: Lens | null }> = ({ energy, ripple, lens }) => {
  const frame = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef<GLState | null>(null);
  const [ready, setReady] = useState(false);
  const [h0] = useState(() => delayRender('webgl-init'));
  useEffect(() => {
    const img = new Image();
    img.src = staticFile('tex/grain_fine_2048.png');
    img.decode().then(() => { st.current = init(ref.current!, img); setReady(true); continueRender(h0); });
  }, [h0]);
  useLayoutEffect(() => {
    if (!ready || !st.current) return;
    const h = delayRender('webgl-frame-' + frame);
    render(st.current, frame, energy, ripple, lens);
    continueRender(h);
  }, [ready, frame, energy, ripple, lens]);
  return <canvas ref={ref} width={RW} height={RH} style={{ position: 'absolute', inset: 0, width: 1920, height: 1080 }} />;
};
