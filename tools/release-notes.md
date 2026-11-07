OpenWrt 路由器的手机控制面板，可选接入 Claude 用对话管理路由器。

## 这个版本的更新

- **云端备份可以加密了**：备份里有 Wi-Fi 密码、登录密钥这些设置，以前是原样存到云端的。现在路由器上有 openssl 的会先加密再上传，密钥只在你的路由器上，云端只存看不懂的密文；没有的在面板「云端备份」页点「开启加密」装一下就行（不点就跟以前一样，不会自己装东西）
- 下载、还原跟以前一样用：路由器先校验再解密，下载到手机的还是普通备份；以前没加密的备份照常能下载、还原，随着新备份慢慢轮换掉
- 官网加了「隐私政策」和「安全说明」页，写清楚存了哪些数据、存多久、怎么删，还有没覆盖的风险；可以在官网直接提交安全问题、隐私问题和滥用举报

v2.0.7 的更新：
- **新注册送 7 天试用**：在官网注册账号后，账号页点「领取 7 天试用」就拿到试用码和安装命令；装好后路由器自动加到你的账号里，不用再绑定。每个账号只能领一次
- **问题反馈能附截图**：最多 3 张，手机、电脑浏览器和 App 里都能选图片（大图自动压缩）
- **换代理插件**：装了两个及以上代理插件时，概览里点「代理插件 · 切换」，选一个就会关掉正在用的、打开选的那个（没设节点的会先提醒）
- **官网加了「常见问题」**：网址被删了怎么恢复、试用到期怎么办、换手机怎么登录等，账号页的提示也直接链过去
- 修好：老版 PassWall 装着时，「隧道直连」打开了却一直显示没开（其实已经生效）；开关现在按你有没有打开来显示，有插件还没生效会另外写明
- 「自动任务」页每组一张卡片，侧边栏换成跟其他项一样的图标
- 「问题反馈」放到更显眼的地方：侧边栏最下面（跟「退出登录」并排）和首页最下面

v2.0.6 的更新：
- **认得别的代理插件了**：OpenClash、Nikki、PassWall、PassWall2、HomeProxy、SSR Plus+ 自动认出来。概览页按你用的插件显示：PassWall 这类能开关、看当前节点、换节点、测延迟；Nikki 能用节点切换、测速、连接、代理模式；侧边栏只显示用得上的页面。没装代理插件也照常能用，不再报错
- **代理插件没在跑，不再说成「连不上路由器」**：右上角照常显示在线，概览里写清楚是插件没在运行
- 内存保护、隧道直连也认这些插件：内存不够时重启的是你正在用的插件；隧道直连写进各插件自己的直连名单
- **所有自动任务都能自己开关**：侧边栏新加「自动任务」页，分三组列出来——出问题时自动修（隧道重启、面板重启、清缓存、内存不够时重启代理插件、节点挂了自动换）、网络（隧道直连、面板线路自动选择）、提醒和备份（每日体检、新设备提醒、云端自动备份），每一项都写着关掉以后会怎样
- **问题反馈 / 建议**：面板「系统操作」里新加的，遇到问题、想要什么功能直接写给开发者，可以附上路由器信息方便查问题
- **托管版装完只给一个链接**：手机打开后点「绑定官网账号」，登录或注册后自动绑定、自动拿到登录码，点「打开面板」就进去了；其他地址都放进「备用信息」

v2.0.5 的更新：面板「断线记录」页加「自动处理」开关（内存不够时自动重启 OpenClash、隧道直连 Cloudflare，可以自己开关）；检查更新不再跟 App 的版本号混在一起。

v2.0.4 的更新：OpenClash 重启、节点卡住时面板和 Claude 不再跟着断（隧道直连）；内存保护，减少死机重启；面板线路不再来回切；隧道重启间隔逐渐拉长；托管网址被删除时提示怎么恢复。

**怎么升级：**v2.0.2 及以后的，面板首页点「一键更新」。v1.3.1–2.0.1 的一键更新用不了，要在路由器后台「服务 → 终端」里把安装命令再运行一次（命令在下面「快速安装」，网址、密钥、设置、登录码都保留，不用重新绑定），以后就都能一键更新了。

## 下载哪个？

有邀请码就装**托管版**（最省事）；想用自己的 Cloudflare 和域名就装**自建版**（先选要不要 AI，再选精简还是完整）。

### 托管版

| 版本 | 下载 | 安装教程 |
|---|---|---|
| **托管版 · AI 版** | `openwrt-claude-panel-hosted-ai.tar.gz` | [📖 教程](https://github.com/wznwzn123/openwrt-claude-panel/blob/main/docs/install-hosted.md) |
| **托管版 · 纯面板版** | `openwrt-claude-panel-hosted-noai.tar.gz` | [📖 教程](https://github.com/wznwzn123/openwrt-claude-panel/blob/main/docs/install-hosted.md) |

### 自建版

| 版本 | 下载 | 包含 | 安装教程 |
|---|---|---|---|
| **AI 版 · 精简版** | `openwrt-claude-panel-ai-lite.tar.gz` | 在 Claude 里对话管理路由器 + 手机面板 + 本地看门狗。不需要 Cloudflare 账号也能装 | [📖 教程](https://github.com/wznwzn123/openwrt-claude-panel/blob/main/docs/install-ai-lite.md) |
| **AI 版 · 完整版** | `openwrt-claude-panel-ai-full.tar.gz` | AI 版全部功能 + 手机/微信推送、每天云端备份、断电断网判断。需要 Cloudflare 账号和自己的域名 | [📖 教程](https://github.com/wznwzn123/openwrt-claude-panel/blob/main/docs/install-ai-full.md) |
| **纯面板版 · 精简版** | `openwrt-claude-panel-noai-lite.tar.gz` | 不接 AI，只有手机面板 + 本地看门狗，自己动手管理。不需要 Cloudflare 账号也能装 | [📖 教程](https://github.com/wznwzn123/openwrt-claude-panel/blob/main/docs/install-noai-lite.md) |
| **纯面板版 · 完整版** | `openwrt-claude-panel-noai-full.tar.gz` | 不接 AI，手机面板 + 本地看门狗 + 推送、云端备份、断电断网判断。需要 Cloudflare 账号和自己的域名 | [📖 教程](https://github.com/wznwzn123/openwrt-claude-panel/blob/main/docs/install-noai-full.md) |

拿不准就先装**精简版**。每个安装包里也带着对应版本的教程 `INSTALL.md`。以后换版本，登录地址和设置都会保留。

## 快速安装（只用手机）

手机连家里 Wi-Fi → 路由器后台「服务 → 终端」→ 粘贴（把 `hosted-ai` 换成你要的版本代号：`hosted-noai`、`ai-lite`、`ai-full`、`noai-lite`、`noai-full`）：

```sh
cd /tmp && wget -O p.tar.gz https://yrlove520.com/dl/openwrt-claude-panel-hosted-ai.tar.gz && tar xzf p.tar.gz && cd openwrt-claude-panel && sh install.sh
```

用电脑装：下载安装包后 `scp` 到路由器 `/tmp`，解压后运行 `sh install.sh`，见各版本教程。

⚠️ 安装后显示的「登录地址」和「Claude 连接器地址」都带着密钥，能控制你的路由器，请不要发给别人或截图分享。

`SHA256SUMS` 是各个安装包的校验值。
