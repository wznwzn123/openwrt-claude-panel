OpenWrt 路由器的手机控制面板，可选接入 Claude 用对话管理路由器。

## 这个版本的更新

- **只用手机就能装**：路由器后台「终端」里粘贴一条命令就行，安装包可以从官网下载（大陆不用连 GitHub）。教程：[📱 手机教程](https://github.com/wznwzn123/openwrt-claude-panel/blob/main/docs/install-phone.md)
- **托管版装完直接给配对码**：终端里显示绑定链接，打开就绑定到官网账号；过期了运行 `cmcp-pair` 再拿
- **连家里 Wi-Fi 打不开面板**：面板会自动选「直连」还是「走代理节点」，节点卡了自动改走直连，不用重启 OpenClash
- **换登录密钥**：「系统操作 → 换登录密钥」，旧地址马上作废
- **侧边栏按路由器真实菜单显示**：没装的插件不显示，新装的插件自动出现；「服务」里也有 OpenClash、PassWall、终端
- **自建版也能加到官网账号**（只记网址，不记密钥）
- **安卓 App**：修复点了没反应（粘贴、改名、移除）；新增手动添加、相册识别二维码；新图标；有新版本打开就弹窗
- 修复：粘贴安装命令后，邀请码提问被跳过
- 路由器意外重启后，断线记录里会写出重启前的内存情况，方便查原因

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

⚠️ 安装后显示的「登录地址」带着密钥，等于路由器 root 权限，请不要发给别人或截图分享。

`SHA256SUMS` 是各个安装包的校验值。
