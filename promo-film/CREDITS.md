# 素材、代码与许可

| 用到的东西 | 来源 | 许可 | 怎么用的 |
|---|---|---|---|
| 制作流程、镜头卡、组件 | [video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) | 仓库 LICENSE | 按 SKILL.md 的「自主自由创作」流程；拷入 `assets/lib/DigitRoll.tsx`、`demos/_fixtures/Polish.tsx` 里的 `bezier/EASE/SpeedBlur`；timeline-travel、changelog-scroll-brake、line-carry-transition、pill-slot-cycle、blur-slide、letterspace-materialize、draw-svg-trace 的参数取自对应 demo 源码 |
| 视觉风格 | [mg-styles-15](https://github.com/Vincentwei1021/mg-styles-15) 的 12 弥散渐变 / 玻璃拟态、02 线条动画 | MIT | 按两份提示词的「Signature features」做；配色按本产品重新蒙皮 |
| 极光与液态玻璃着色器 | mg-styles-15 `demos/12-aurora-glass/shaders.js`、`main.js` | MIT | `src/gl/shaders.ts` 原文照搬 FS_AURORA / FS_DOWN / FS_BLUR / FS_LENS / FS_FINAL；`src/gl/AuroraGL.tsx` 按 main.js 的管线和参数移植（色斑颜色换成本产品） |
| 2.5D 页面相机 | video-shotcraft `assets/lib/PageCam.tsx` | 仓库 LICENSE | `src/lib/PageCam.tsx` 原样拷入 |
| 评审 | mg-styles-15 `rubric.md`、video-shotcraft `references/final-review.md` | — | 成片交给独立的 AI 评委按这两份评审，再按意见修改 |
| 颗粒纹理 | mg-styles-15 `assets/textures/grain/grain_fine_2048.png` | MIT（随仓库） | `public/tex/` |
| 配乐（v4） | video-shotcraft `assets/audio/bgm/bgm-tech-house.mp3`（Mixkit） | Mixkit Stock Music Free License（免署名、可商用）——**注意**：video-shotcraft 的 `assets/audio/ATTRIBUTION.md` 写明这首是「首批沿用，无法逐曲反查」，标注「商用前复核」 | 节拍网格由 `tools/beatgrid.py` 测出（124 BPM），全片切点钉在拍上；最后两小节淡出 |
| 音效（v4，录音） | video-shotcraft `template/public/audio`：impact-cine、whoosh-fast、transition-soft、transition-snap、swoosh-quick、click-camera | Mixkit SFX Free License（ATTRIBUTION.md 里有逐条来源链接） | 大冲击、甩镜、窗口升起、手机进场、图标停靠、描边圈 |
| 音效（v4，合成） | mg-styles-15 `lib/audio`（mgaudio） | 代码 MIT；乐器采样为 VCSL，CC0 | 来源记录不全的 riser / sparkle / keyboard / pop 不用，改为合成；提示音用 VCSL 马林巴、钟琴、卡林巴、木鱼采样（`audio/score4.py`） |
| 配乐与音效（v3，已不用） | mg-styles-15 `lib/audio`（mgaudio） | 代码 MIT；乐器采样为 VCSL，CC0 | `audio/score.py` 原创编曲（v3 成片用；v4 按用户意见换成 Mixkit 配乐） |
| 字体 | Noto Sans SC、Noto Serif SC、Inter、JetBrains Mono（npm @fontsource-variable） | SIL OFL 1.1 | 片中全部文字 |
| 面板界面 | 本仓库 `src/www/panel/index.html`，用 Playwright 加载、后端接口换成演示数据后截图（`tools/capture.cjs`、`tools/capture-v4.cjs`） | 本仓库 MIT | `public/ui/`；截图时没有真实路由器、没有真实 IP / MAC / 域名 / 密钥 |
| 产品图标 | 本仓库 `src/www/panel/icon.svg` | 本仓库 MIT | 收尾的图标 |
| 3D | [three.js](https://github.com/mrdoob/three.js) 0.179、@react-three/fiber 9、@react-three/drei 10、@react-three/postprocessing 3、@remotion/three | MIT | 3D 路由器、设备、界面空间、时间轴；泛光和暗角 |
| 渲染 | [Remotion](https://github.com/remotion-dev/remotion) 4.0.484 | Remotion License（个人和小团队免费，公司可能需要买授权） | 合成与渲染 |

没有用：video-talkcraft（口播流程，许可证 PolyForm Noncommercial 1.0.0，这支片没有旁白）；Freesound 音效（这个环境访问 freesound.org 返回 403）。
