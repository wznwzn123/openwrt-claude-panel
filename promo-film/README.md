# 「一根线」—— OpenWrt Claude Panel 的版本与理念史动画

16:9 · 1920×1080 · 30fps · 81.6 秒，带原创配乐和音效。
设计说明和分镜见 [docs/spec.md](docs/spec.md)，素材和许可见 [CREDITS.md](CREDITS.md)。

## 目录

| 路径 | 内容 |
|---|---|
| `src/timeline.ts` | 全片唯一的时间表（100 BPM，一小节 72 帧） |
| `src/scenes/` | 八段：开场、为什么做、时间轴、停更五天、密集更新、提交长卷、四条原则、收尾 |
| `src/lib/` | 线（`thread.tsx`）、极光底和玻璃卡（`look.tsx`）、时间轴卡片（`axis.tsx`）、按坐标取截图（`shot.tsx`）、缓动、运动模糊、数字滚动 |
| `src/cues.ts` | 中央音效表：每条音效都写成「镜头起点 + 偏移」 |
| `audio/score.py` | 配乐 + 音效合成（mgaudio） |
| `tools/capture.cjs` | 真实面板截图：加载仓库里的面板，接口换成演示数据，输出 `public/ui/*.png` 和 `layout.json` |
| `tools/commits.py` | 从 git 历史生成提交长卷数据 |
| `public/ui/` | 面板截图（演示数据） |

## 重新渲染

```sh
cd promo-film
npm install
# 配乐要用 mg-styles-15 的 mgaudio 和乐器采样（MIT / CC0），放在仓库旁边或用 MGAUDIO 指过去
git clone --depth 1 https://github.com/Vincentwei1021/mg-styles-15 ../../vincentwei1021/mg-styles-15
pip install numpy scipy soundfile numba pedalboard pyloudnorm matplotlib

python3 tools/commits.py            # 提交长卷数据（可选，已生成）
DESK=1 node tools/capture.cjs       # 面板截图（可选，已生成；需要 Playwright + Chromium）
node tools/glyphs.mjs               # 收集片中用到的字，开头预加载
node tools/dump-cues.mjs            # 导出音效表
python3 audio/score.py              # → public/audio/film.wav、film-nomusic.wav
npx remotion render src/index.ts Film out/film.mp4 --crf=18
# 不带配乐、只留音效的一版：
echo '{"music":false}' > out/props-nomusic.json
npx remotion render src/index.ts Film out/film-nomusic.mp4 --crf=18 --props=out/props-nomusic.json
```

`remotion.config.ts` 里指定了本机的 Chromium headless shell 路径，换机器时改成自己的，或者删掉那一行让 Remotion 自己下载。
