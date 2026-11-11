# 素材、代码与许可

| 用到的东西 | 来源 | 许可 | 怎么用的 |
|---|---|---|---|
| 制作流程、镜头卡、组件 | [video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) | 仓库 LICENSE | 按 SKILL.md 的「自主自由创作」流程；拷入 `assets/lib/DigitRoll.tsx`、`demos/_fixtures/Polish.tsx` 里的 `bezier/EASE/SpeedBlur`；timeline-travel、changelog-scroll-brake、line-carry-transition、pill-slot-cycle、blur-slide、letterspace-materialize、draw-svg-trace 的参数取自对应 demo 源码 |
| 视觉风格 | [mg-styles-15](https://github.com/Vincentwei1021/mg-styles-15) 的 12 弥散渐变 / 玻璃拟态、02 线条动画 | MIT | 按两份提示词的「Signature features」做；配色按本产品重新蒙皮 |
| 颗粒纹理 | mg-styles-15 `assets/textures/grain/grain_fine_2048.png` | MIT（随仓库） | `public/tex/` |
| 配乐与音效合成 | mg-styles-15 `lib/audio`（mgaudio） | 代码 MIT；乐器采样为 VCSL，CC0 | `audio/score.py` 原创编曲，所有音效由代码合成，没有使用任何录音音效或现成曲目 |
| 字体 | Noto Sans SC、Noto Serif SC、Inter、JetBrains Mono（npm @fontsource-variable） | SIL OFL 1.1 | 片中全部文字 |
| 面板界面 | 本仓库 `src/www/panel/index.html`，用 Playwright 加载、后端接口换成演示数据后截图（`tools/capture.cjs`） | 本仓库 MIT | `public/ui/`；截图时没有真实路由器、没有真实 IP / MAC / 域名 / 密钥 |
| 产品图标 | 本仓库 `src/www/panel/icon.svg` | 本仓库 MIT | 收尾的图标 |
| 渲染 | [Remotion](https://github.com/remotion-dev/remotion) 4.0.484 | Remotion License（个人和小团队免费，公司可能需要买授权） | 合成与渲染 |

没有用：video-talkcraft（口播流程，许可证 PolyForm Noncommercial 1.0.0，这支片没有旁白）；Freesound 音效（这个环境访问 freesound.org 返回 403，所以音效全部由 mgaudio 合成，不涉及第三方录音许可）；video-shotcraft 自带的 5 首 BGM（改为原创配乐，拍点和画面一一对应）。
