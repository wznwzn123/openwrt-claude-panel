# 安装教程：托管版

> 不用注册 Cloudflare、不用买域名：输入**邀请码**，自动得到一个专属网址，在家在外都能用；手机推送、每天云端备份、断电断网判断全都自带。

安装包（在 [Releases](https://github.com/wznwzn123/openwrt-claude-panel/releases/latest) 下载）：

| 版本 | 安装包 |
|---|---|
| AI 版 · 托管版（能在 Claude 里用对话管理路由器） | `openwrt-claude-panel-hosted-ai.tar.gz` |
| 纯面板版 · 托管版（只有手机面板，不接 AI） | `openwrt-claude-panel-hosted-noai.tar.gz` |

## 你需要准备

- 一台 **OpenWrt 22.03 或更新**的路由器（Kwrt、ImmortalWrt 等也可以），并且能上网
- 一台电脑（Windows 10/11、macOS 自带 `ssh` 和 `scp`）
- 路由器闪存剩余空间 **40 MB 以上**（登录路由器运行 `df -h /overlay` 看 `Available`）
- 一个**邀请码**（找提供托管服务的人要）

下面的命令里，`192.168.1.1` 换成你路由器的地址；安装包名换成你下载的那个。

## 第 1 步：传到路由器并安装

在电脑上打开终端（Windows：开始菜单搜「PowerShell」；macOS：「终端」）：

```sh
cd ~/Downloads
scp openwrt-claude-panel-hosted-noai.tar.gz root@192.168.1.1:/tmp/
ssh root@192.168.1.1
cd /tmp && tar xzf openwrt-claude-panel-hosted-noai.tar.gz && cd openwrt-claude-panel
sh install.sh
```

> 如果 scp 提示 `sftp-server: not found`，在 scp 后面加 `-O`。

脚本会问「邀请码」，粘贴进去回车。几秒后显示：

```
✓ 开通成功：https://ab3cd4ef.你的托管域名

手机面板：https://ab3cd4ef.你的托管域名/panel/

登录地址（第一次打开面板时粘贴）：
  https://ab3cd4ef.你的托管域名/cgi-bin/mcp/xxxxxxxxxxxxxxxx
```

**把登录地址复制保存好。** ⚠️ 它带着密钥，拿到它就等于拿到路由器的最高权限：不要发给别人，也不要截图分享。这个密钥只在你的路由器上，托管服务也没有。

## 第 2 步：在手机上打开

1. 手机浏览器打开「手机面板」那个网址，粘贴**登录地址**登录（或者直接打开安装完成时显示的 `…/panel/#login=…` 链接，自动登录）
2. 添加到主屏幕：安卓（Chrome / Edge）右上角菜单 → 「添加到主屏幕」；iPhone（Safari）分享 → 「添加到主屏幕」
3. 建议打开**面板锁**：「系统操作」→「面板锁」
4. 打开推送：「断线记录」页 → 「手机通知」→ 「开启通知」
5. 家里其他手机：在已登录的手机上「系统操作」→「添加新手机」，新手机扫码就能用
6. 绑定到官网账号（换手机时好找）：「系统操作」→「绑定到账号」，在官网 `/app` 登录后输入配对码

AI 版：把**登录地址**填到 Claude 的 **设置 → 连接器 → 添加自定义连接器**，就能在对话里管理路由器。

## 常见问题

**邀请码提示不对 / 用完了 / 过期了？** 找提供邀请码的人再要一个。

**提示「名额已满」？** 托管服务的人数到上限了，联系提供服务的人。

**会不会被别人进我的路由器？** 不会。登录密钥只在你的路由器和你自己的手机上生成和保存；托管服务只负责转发和推送，拿不到密钥，也进不了你的路由器。

**不用了怎么办？** 登录路由器运行 `cd /tmp/openwrt-claude-panel && sh uninstall.sh`（`/tmp` 重启会清空，那就重新解压一次安装包），专属网址会自动交还。超过 90 天没上线的也会自动回收。

**升级？** 下载新版的同一个安装包，重新传上去运行 `sh install.sh`，网址和设置都保留，不用再输邀请码。
