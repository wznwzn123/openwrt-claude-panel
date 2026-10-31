OpenWrt 路由器的手机控制面板，可选接入 Claude 用对话管理路由器。

## 这个版本的更新

- **一键更新**：以后有新版本，面板首页会提示，点「一键更新」就行。路由器自己下载、校验、安装，设置都保留，不会断网；装不好自动退回原来的版本
- **托管版更安全：每台手机第一次要输登录码**。登录码在官网账号页拿（路由器下面点「获取登录码」），10 分钟有效、用一次就作废；就算登录地址泄露，没有登录码也打不开面板。官网打不开时在路由器后台终端运行 `cmcp-logincode`
- **已登录的手机**：「系统操作 → 已登录的手机」，不认识的一键移除；有新手机登录会推送提醒
- **Claude 连接器单独一把钥匙**：AI 版装完会单独显示「Claude 连接器地址」，只给 Claude 用、打不开面板，泄露了可以单独换（「系统操作 → Claude 连接器地址」）
- **退出登录**：侧边栏最下面、「系统操作」里都有
- 托管版安装完成时，配对码用大字单独显示，下面写清楚接下来 3 步
- 官网账号页显示每台路由器的版本，有新版标「可更新」
- 修复：官网顶栏遮挡、卡片粘在一起；面板「打开官网」按钮文字不居中

**升级前请注意（托管版）：**
1. 先把路由器**绑定到官网账号**（面板「系统操作 → 绑定到账号」），不然升级后拿不到登录码（也可以用 `cmcp-logincode`）
2. v1.3.0 还没有一键更新，这次要在路由器后台终端里把安装命令再运行一次；以后就能一键更新了
3. AI 版：升级后在 Claude 里删掉旧连接器，用新的「Claude 连接器地址」重新添加

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
