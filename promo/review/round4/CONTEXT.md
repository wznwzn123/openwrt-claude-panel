# 第四轮独立审片 · 背景资料（由用户决定提供）

## 审核对象
- 主片：`promo/out/openwrt-claude-panel-promo-90s.mp4`（1920×1080 · 60fps · 90s）
- 附带交付物（可选抽查）：`promo/out/deliver/` 下的竖屏 60s、15s 循环预览、剪映草稿 zip

## 产品真实性核对来源
- 仓库本地副本：`/home/user/openwrt-claude-panel`（= github.com/wznwzn123/openwrt-claude-panel；面板前端 `src/www/panel/index.html`，安卓客户端 `android/`，README）
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

另外：全片不出现任何地区名、境外平台名；原产品的付款/导流二维码在片中替换为「局域网自动发现」卡片。

## 用户指定的背景说明 2：演示数据
- 片中手机界面由仓库真实面板代码（`src/www/panel`）在浏览器里实机渲染后 3× 截图，采集脚本 `promo/capture/capture.js`；
  其中的设备名、流量、延迟、时间（统一为 21:46）等全部是本地模拟接口喂入的**演示数据**。
- 成片 8.6s–81.8s 右下角有「界面为演示数据」角标。
- 以下画面为自绘示意，非仓库现成界面：第一幕旧式路由后台；第二幕分层拆解图；第三幕流量柱状宽屏、PWA 浏览器分享弹层与桌面、安卓客户端界面；
  第四幕 Claude 对话与双屏指令台；第五幕 HUD、通知卡片与落版。真实性请按功能是否存在来核对（如安卓客户端可对照 `android/`）。

## 可用工具
- ffmpeg / ffprobe（抽帧、黑帧/静止/响度/峰值检测）
- Python + PIL
- 语音转写：`faster_whisper`，模型已下载到 `/tmp/claude-0/-home-user-openwrt-claude-panel/db067ece-88b8-53ae-96d3-c0f8d6a633a4/scratchpad/whisper`（`WhisperModel('small', download_root=<该路径>, device='cpu', compute_type='int8')`）

## 审片边界
- 只读。唯一允许写入的位置：`promo/review/round4/`（报告与自己的工作文件，例如抽帧放 `promo/review/round4/work/`）。
- 不要阅读之前轮次的任何审片报告、评分或修改记录；不要使用 `promo/out/review/` 等旧材料包，自己从 MP4 取证。
