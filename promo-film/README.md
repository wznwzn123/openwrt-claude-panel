# OpenWrt Claude Panel 宣传动画（v4）

16:9 · 1920×1080 · 30fps · 78 秒。配乐是 Mixkit tech-house（124 BPM），全片切点都钉在它的节拍上。
- 讲四件事：插件能干什么、用中文对话管路由器、装起来简单占用小、更新快。
- 画面上的字只留关键词，主要靠真实界面说话。

设计说明见 [docs/spec-v4.md](docs/spec-v4.md)，修改记录见 [docs/revision-log.md](docs/revision-log.md)，素材和许可见 [CREDITS.md](CREDITS.md)。

## 目录

| 路径 | 内容 |
|---|---|
| `src/v4/beat.ts` | 时间线：所有帧号都从配乐的节拍网格换算（`analysis/bgm-grid.json`） |
| `src/v4/` | 六段：前奏、功能、对话、安装、更新、定版；`cues.ts` 是中央音效表 |
| `src/gl/` | mg-styles-15 的极光和液态玻璃着色器（原文照搬）及渲染管线 |
| `src/lib/` | PageCam（video-shotcraft 原样拷入）、线、玻璃卡、缓动、运动模糊 |
| `audio/score4.py` | 配乐 + 音效（Mixkit 录音音效 + mgaudio 合成） |
| `tools/beatgrid.py` | 测配乐的节拍网格和能量结构 |
| `tools/capture.cjs`、`tools/capture-v4.cjs` | 真实面板截图：加载仓库里的面板，接口换成演示数据 |
| `tools/sfx_audible.py` | 逐条测音效在配乐里听不听得见 |
| `tools/qa.py` | 成片检查：规格、黑帧、亮度跳变、响度、冲击点音画同步 |
| `src/scenes/`、`src/timeline.ts`、`src/cues.ts`、`audio/score.py` | v3（「一根线」版）的源码，v4 只复用其中的指示灯组件 |

## 重新渲染

```sh
cd promo-film
npm install
# 配乐和音效素材来自两个参考仓库，放在仓库旁边，或用 SHOTCRAFT / MGAUDIO 环境变量指过去
git clone --depth 1 https://github.com/Vincentwei1021/video-shotcraft ../../vincentwei1021/video-shotcraft
git clone --depth 1 https://github.com/Vincentwei1021/mg-styles-15 ../../vincentwei1021/mg-styles-15
pip install numpy scipy soundfile numba pedalboard pyloudnorm matplotlib librosa

node tools/capture-v4.cjs     # 功能页截图（可选，已生成；需要 Playwright + Chromium）
sh tools/render-all.sh v4     # → out/v4/master*.mp4 和压好的 *-delivery.mp4
```

`remotion.config.ts` 里指定了本机的 Chromium headless shell 路径。换机器时改成自己的，或者删掉那一行让 Remotion 自己下载。
