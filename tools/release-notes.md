OpenWrt 路由器的手机控制面板，可选接入 Claude 用对话管理路由器。

## 这个版本的更新

- **OpenClash 重启、节点卡住时，面板和 Claude 不再跟着断**：路由器连 Cloudflare 的隧道改成直连，不经过 OpenClash（不用重启 OpenClash，家里其他设备不受影响）。万一你那里直连连不上，15 分钟后会自动改回原来的方式
- **内存保护，减少死机重启**：内存快用完时先自动清理缓存；还不够就重启一次 OpenClash 释放内存（断网十几秒，会推送告诉你），不会等到内存耗尽整台路由器重启
- **面板线路不再来回切**：以前两条路都能打开时，会因为一点点快慢差别反复切换、刷满断线记录。现在只有打不开才马上换；只是快慢不同的，要连续几次明显更快才换，一小时最多一次
- 隧道连不上时，重启间隔逐渐拉长（马上、3、10、30 分钟……之后每小时一次），断线记录不再刷屏
- 托管版：专属网址被删除时，看门狗会直接告诉你怎么恢复，不再一直白白重启；用新邀请码重新安装时会自动重新开通，设置都保留
- 教程新增「托管网址被停用、到期、删除了怎么办」

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
