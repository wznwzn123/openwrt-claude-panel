# OpenWrt Claude Panel · 90 秒宣传片工程

Remotion 工程，按《90 秒电影级商业宣传片导演全案》制作。三支成片：

| 文件 | 规格 | 用途 |
|---|---|---|
| `openwrt-claude-panel-promo-90s.mp4` | 1920×1080 · 60 fps · 5400 帧 · H.264 High · AAC 48 kHz · −14.0 LUFS / ≤ −1 dBTP | B 站、官网首屏、项目发布 |
| `preview-loop-15s.mp4` | 1280×720 · 30 fps · 15 s 无声无缝循环 | GitHub README / 官网预览 |
| `promo-vertical-60s.mp4` | 1080×1920 · 30 fps · 60 s | 抖音 / 小红书 / 视频号 |

成片不进仓库（体积大），渲染方法见下。

## 复现

```bash
cd promo
bash scripts/setup.sh                       # 依赖、字体、配音轨、配乐与音效、母带
node scripts/stills.mjs Promo90 out/qa 1.5,9,15,24,32,41,50,64,77,88 1   # 十帧海报级抽检
# 分段母版渲染（video-talkcraft scripts/render_shots.mjs：按五幕分段并行、帧数断言、无损拼接）
node <video-talkcraft>/scripts/render_shots.mjs --shots shots.json --entry src/index.ts --comp Promo90 \
     --seg-dir out/segments --parallel 4 --all --concat out/assembled.mp4 --crf 16
ffmpeg -i out/assembled.mp4 -i public/audio/final_mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k \
     -shortest -movflags +faststart out/openwrt-claude-panel-promo-90s.mp4
# 单幕微调：改哪幕只重渲哪幕
node <video-talkcraft>/scripts/render_shots.mjs ... --only a3 --concat out/assembled.mp4
```

## 结构

- `src/acts/Act1–5.tsx` 五幕；`src/lib/` 字体断言、缓动与阻尼弹簧（240/26/0.85）、极光/HUD 基底、2.5D 真机、玻璃材质、品牌徽标
- `src/Vertical.tsx` + `src/vcuts.ts` 竖屏 60 s：同一套组件按画幅重排，按句间气口剪辑
- `src/workbench.ts` 动效工作台清单（五幕 / 逐句字幕 / 78 条音效 / 配乐与人声 多轨）
- `voice/` 配音稿（`script.json`）、TTS 脚本、逐词时间戳 → `src/timing.json`
- `audio/synth.py` 配乐与音效离线合成；`audio/master.sh` 两遍 loudnorm + 过采样限幅
- `scripts/jianying_export.py` 剪映多轨草稿导出

## 素材与授权

- 界面画面：yrlove520.com 官网内嵌的真实面板截图（2× 浏览器抓取），以及仓库 `src/www/panel/icon.svg` 品牌徽标；插件识别 / 节点测速 / 中文设备名 / 对话舱等无对应截图的界面按真实功能自绘
- 字体：Noto Sans SC、JetBrains Mono（均为 SIL OFL 1.1）
- 配乐与音效：`audio/synth.py` 程序合成，无第三方采样（Freesound API 需密钥，本次未接入）
- 配音：Microsoft Edge 在线 TTS「云扬」（zh-CN-YunyangNeural）。**商用发布前请自行确认该语音的使用条款**，或用真人录音 / Fish Audio 替换 `public/audio/narration.wav` 后重跑 `audio/synth.py` 与 `master.sh`（时间轴由 `voice/build_timing.py` 重建）
- 渲染引擎 Remotion 有独立许可（个人与小团队免费，公司可能需要付费）
