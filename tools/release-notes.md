OpenWrt 路由器的手机控制面板，可选接入 Claude 用对话管理路由器。

## 这个版本的更新

- **磨砂玻璃主题**：顶栏、侧边栏、卡片、弹出层、底部菜单都变成半透明磨砂玻璃，默认开启
- **自定义背景**：8 款预设背景，也可以从手机相册选图，能调模糊和明暗；在「系统操作 → 主题与背景」里设置，背景只存在当前手机上
- **顶栏悬浮**：离屏幕边缘留空，四个角都是圆角
- 手机比较卡的话，可以一键关掉玻璃效果，换回简洁样式
- 修复：切换代理模式后，出口 IP 和解锁检测可能连续跑两遍
- 修复：断线记录里「正常」后面多出一块绿色底

## 下载哪个？先选要不要 AI，再选精简还是完整

| 版本 | 下载 | 包含 | 安装教程 |
|---|---|---|---|
| **AI 版 · 精简版** | `openwrt-claude-panel-ai-lite.tar.gz` | 在 Claude 里对话管理路由器 + 手机面板 + 本地看门狗。不需要 Cloudflare 账号也能装 | [📖 教程](https://github.com/wznwzn123/openwrt-claude-panel/blob/main/docs/install-ai-lite.md) |
| **AI 版 · 完整版** | `openwrt-claude-panel-ai-full.tar.gz` | AI 版全部功能 + 手机/微信推送、每天云端备份、断电断网判断。需要 Cloudflare 账号和自己的域名 | [📖 教程](https://github.com/wznwzn123/openwrt-claude-panel/blob/main/docs/install-ai-full.md) |
| **纯面板版 · 精简版** | `openwrt-claude-panel-noai-lite.tar.gz` | 不接 AI，只有手机面板 + 本地看门狗，自己动手管理。不需要 Cloudflare 账号也能装 | [📖 教程](https://github.com/wznwzn123/openwrt-claude-panel/blob/main/docs/install-noai-lite.md) |
| **纯面板版 · 完整版** | `openwrt-claude-panel-noai-full.tar.gz` | 不接 AI，手机面板 + 本地看门狗 + 推送、云端备份、断电断网判断。需要 Cloudflare 账号和自己的域名 | [📖 教程](https://github.com/wznwzn123/openwrt-claude-panel/blob/main/docs/install-noai-full.md) |

拿不准就先装**精简版**。每个安装包里也带着对应版本的教程 `INSTALL.md`。以后换版本，登录地址和设置都会保留。

## 快速安装

```sh
scp openwrt-claude-panel-ai-lite.tar.gz root@192.168.1.1:/tmp/
ssh root@192.168.1.1
cd /tmp && tar xzf openwrt-claude-panel-ai-lite.tar.gz && cd openwrt-claude-panel
sh install.sh
```

（文件名换成你下载的那个版本。）

⚠️ 安装后显示的「登录地址」带着密钥，等于路由器 root 权限，请不要发给别人或截图分享。

`SHA256SUMS` 是四个安装包的校验值。
