# 第五轮独立审片 · 背景资料（由用户决定提供）

## 审核对象
- 主片：`promo/out/openwrt-claude-panel-promo-90s.mp4`（1920×1080 · 60fps · 90s）
- 附带交付物（可选抽查）：`promo/out/deliver/` 下的竖屏 60s（30fps）、15s 循环预览、剪映草稿 zip

## 产品真实性核对来源
- 仓库本地副本：`/home/user/openwrt-claude-panel`（= github.com/wznwzn123/openwrt-claude-panel；面板前端 `src/www/panel/index.html`，安卓客户端 `android/`（首页为 `android/app/src/main/assets/home.html`），README）
- 官网：https://yrlove520.com/ （本环境可访问）

## 用户指定的背景说明 1：国内平台合规改写（不是虚构功能）
成片面向 B 站 / 抖音 / 小红书 / 视频号，按用户要求对屏幕与旁白里的敏感词做了统一改写。审片时请把下列改写视为「平台合规措辞」，
重点核查改写后的含义是否与真实功能一一对应、有无借改写夸大，而不要把措辞差异本身判为界面造假：

| 真实产品里的写法 | 片中写法 |
|---|---|
| 代理 | 加速 / 加速通道（看门狗状态胶囊里的「代理」→「套件」） |
| 策略组 | 加速通道 |
| 节点 | 线路 |
| 分流 | 智能调度 |
| 订阅 | 线路源 |
| 机场 | 线路服务商 |
| OpenClash / Nikki / PassWall(2) | 智能调度套件 / 多线路由套件 / 网络加速套件（统称「网络扩展套件」） |
| 界面里的 Cloudflare | 云端（旁白里「Cloudflare 加密隧道」保留原名） |
| 「国内直连，海外走代理」 | 「智能分配直连与加速通道」 |
| 「Meta 运行中」 | 「内核运行中」 |

另外：全片不出现任何地区名、境外平台名。用户要求：画面中如出现任何二维码或类似二维码的图案，一律打模糊，以免被平台判为站外导流。

## 用户指定的背景说明 2：演示数据
- 片中手机界面由仓库真实代码在浏览器里实机渲染后 3× 截图：面板来自 `src/www/panel`（采集脚本 `promo/capture/capture.js`），
  安卓客户端首页来自 `android/app/src/main/assets/home.html`（采集脚本 `promo/capture/android.js`，用桩对象模拟 App 接口）。
- 其中的设备名、流量、延迟、路由器名称与地址、时间（统一为 21:46）等全部是本地模拟数据喂入的**演示数据**；
  路由器地址使用保留的示例域名 `example.net`，登录地址里的密钥已打码。
- 成片约 8.6s–79.7s 右下角有「界面为演示数据」角标。
- 以下画面为自绘示意，非仓库现成界面：第一幕旧式路由后台；第二幕分层拆解图；第三幕流量柱状宽屏、PWA 浏览器分享弹层与桌面；
  第四幕 Claude 对话与双屏指令台；第五幕 HUD、通知卡片与落版。真实性请按功能是否存在来核对。

## 用户指定的背景说明 3：配音
- 旁白为 TTS 合成（zh-CN-YunyangNeural）。为保证品牌名读音，合成时「Claude」按中文习惯读作「克劳德」；字幕与画面仍写 Claude。

## 可用工具
- ffmpeg / ffprobe（抽帧、黑帧/静止/响度/峰值检测）
- Python + PIL；OpenCV（`cv2`，可用 `cv2.QRCodeDetector` 检测二维码）
- 语音转写：`faster_whisper`，模型已下载到 `/tmp/claude-0/-home-user-openwrt-claude-panel/db067ece-88b8-53ae-96d3-c0f8d6a633a4/scratchpad/whisper`
  （`WhisperModel('small', download_root=<该路径>, device='cpu', compute_type='int8')`；本环境的 av 版本与 faster_whisper 不兼容，
  请先用 ffmpeg 解码成 16kHz 单声道 float32 数组再传入 `transcribe`）

## 审片边界
- 只读。唯一允许写入的位置：`promo/review/round5/`（报告与自己的工作文件，例如抽帧放 `promo/review/round5/work/`）。
- 不要阅读之前轮次的任何审片报告、评分或修改记录（包括 `promo/review/` 下除 round5 以外的全部内容、`promo/out/review/`、git 提交说明）；
  不要使用 `promo/out/review/`、`promo/out/keys4/`、`promo/out/listen/`、`promo/out/deliver/keyframes*` 等旧材料，自己从 MP4 取证。

## 用户追加要求：音频分项评分
在任务书第五节「音频与音乐」（满分 15 分）之内，请额外列出四个分项分数：**旁白 / 背景音乐 / 音效 / 混音与母带**，
四项之和等于该维度得分（分值分配由审片员自定并写明）。每个分项须注明依据：哪些结论来自可复现的测量（频谱、响度、峰值、转写等），
哪些属于只能靠人耳判断的主观项——后者请明确标注「待用户试听确认」，不要把推测写成结论。

## 用户追加要求：整体文案单独评价（另计 10 分，不计入 100 分总分）
请在报告中单独加一节「文案评价」（可放在第 6 部分「声音评价」之后），覆盖旁白稿、屏幕大字 / 标题条、落版语。
- 另打一个文案分（满分 10），**不计入**任务书的 100 分总分，任务书原有评分体系保持不变。
- 建议分项：核心主张（有没有一句能被记住、能单独传播的话）、信息清晰度（观众能否听懂产品是什么 / 解决什么）、
  措辞是否属实（有无夸大或与真实功能不符）、口播节奏（四字格与修辞密度、是否顺口）、平台适配（B 站 / 抖音等的表达习惯与合规）。
- 问题请标时间戳并给出可直接替换的改写示例；改写须与真实功能一致，不得为了好听而夸大。
- 旁白原文可对照 `promo/voice/script.json`（`text` 为字幕原文，`speak` 为合成时的读法）。
