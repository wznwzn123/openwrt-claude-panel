# 安装教程：托管版

> 不用注册 Cloudflare、不用买域名：输入**邀请码**，自动得到一个专属网址，在家在外都能用；手机推送、每天云端备份、断电断网判断全都自带。

| 版本 | 代号 | 安装包 |
|---|---|---|
| 托管版 · AI 版（能在 Claude 里用对话管理路由器） | `hosted-ai` | `openwrt-claude-panel-hosted-ai.tar.gz` |
| 托管版 · 纯面板版（只有手机面板，不接 AI） | `hosted-noai` | `openwrt-claude-panel-hosted-noai.tar.gz` |

## 你需要准备

- 一台 **OpenWrt 22.03 或更新**的路由器（Kwrt、ImmortalWrt 等也可以），并且能上网
- 路由器闪存剩余空间 **40 MB 以上**（登录路由器运行 `df -h /overlay` 看 `Available`）
- 一个**邀请码**（找提供托管服务的人要）
- 一部手机就够了；有电脑也可以用电脑装

## 第 1 步：在路由器上运行安装命令

### 只用手机（推荐）

1. 手机连上家里的 Wi-Fi，浏览器打开路由器后台（比如 `http://192.168.1.1`）→「服务」→「终端」，用 `root` 和后台密码登录。（没有「终端」：用手机 SSH 软件 JuiceSSH / Termius 连 `root@路由器地址`）
2. 粘贴下面的命令，回车：
   ```sh
   # ⚠️ 下面的 hosted-ai 决定装哪个版本：AI 版不用改；纯面板版把 hosted-ai 改成 hosted-noai
   cd /tmp && wget -O p.tar.gz https://yrlove520.com/dl/openwrt-claude-panel-hosted-ai.tar.gz && tar xzf p.tar.gz && cd openwrt-claude-panel && sh install.sh
   ```

每一步的详细说明见 [📱 手机教程](install-phone.md)。

> ⚠️ 从自建版换成托管版、或者升级托管版时，**不要用路由器面板里的「终端」**：安装中面板的连接会被换掉，面板终端会断开。

### 用电脑

在 [Releases](https://github.com/wznwzn123/openwrt-claude-panel/releases/latest) 下载安装包，然后在电脑终端（Windows：PowerShell；macOS：终端）运行（`192.168.1.1` 换成你路由器的地址）：

```sh
cd ~/Downloads
scp openwrt-claude-panel-hosted-noai.tar.gz root@192.168.1.1:/tmp/
ssh root@192.168.1.1
cd /tmp && tar xzf openwrt-claude-panel-hosted-noai.tar.gz && cd openwrt-claude-panel
sh install.sh
```

> 如果 scp 提示 `sftp-server: not found`，在 scp 后面加 `-O`。

## 第 2 步：输入邀请码

屏幕出现「**邀请码（找提供托管服务的人要）**」时，粘贴邀请码，回车。

- 输错了会让你再输一次（最多 3 次）；不小心直接回车会提示「这一项不能空着」。
- 也可以把邀请码直接写在命令里：`sh install.sh --invite 邀请码`

## 第 3 步：保存装完显示的内容

几秒后显示：

```
✓ 开通成功：https://ab3cd4ef.yrlove520.com

手机面板：https://ab3cd4ef.yrlove520.com/panel/

登录地址（第一次打开面板时粘贴）：
  https://ab3cd4ef.yrlove520.com/cgi-bin/mcp/（40 位密钥）

或者在手机上直接打开这个链接，自动登录（同样不要发给别人）：
  https://ab3cd4ef.yrlove520.com/panel/#login=（40 位密钥）

绑定到官网账号（换手机时一眼找到这台路由器，不绑也能正常用）：
  手机直接打开这个链接，登录或注册后自动绑定：
    https://yrlove520.com/app?pair=ABCD2345
  或者在 https://yrlove520.com/app 的「添加路由器」里输入配对码：ABCD2345
```

**把登录地址复制保存好。** ⚠️ 它带着密钥，拿到它就等于拿到路由器的最高权限：不要发给别人，也不要截图分享。这个密钥只在你的路由器上，托管服务也没有。

## 第 4 步：在手机上打开

1. 手机浏览器打开**自动登录链接**，直接进面板；或者打开「手机面板」网址，粘贴**登录地址**登录。
2. 添加到主屏幕：安卓（Chrome / Edge）右上角菜单 →「添加到主屏幕」；iPhone（Safari）分享 →「添加到主屏幕」。也可以装[安卓 App](https://yrlove520.com/app/router-panel.apk)。
3. 打开推送：「断线记录」页 →「手机通知」→「开启通知」
4. 建议打开**面板锁**：「系统操作」→「面板锁」
5. 家里其他手机：在已登录的手机上「系统操作」→「添加新手机」，新手机扫码就能用

**AI 版：** 把**登录地址**填到 Claude 的 **设置 → 连接器 → 添加自定义连接器**，就能在对话里管理路由器。

## 第 5 步（可选）：绑定到官网账号

打开第 3 步里的绑定链接，登录或注册官网账号，**自动绑定**。配对码 10 分钟有效，过期了在路由器终端运行 `cmcp-pair` 再拿一个，或者面板「系统操作 → 绑定到账号」。

## 常见问题

**粘贴命令后，邀请码那一行一闪而过、提示「托管版需要邀请码」？** 旧版安装脚本的问题，新版已修好。遇到了就在终端里接着运行 `sh install.sh --invite 邀请码`。

**邀请码提示不对 / 用完了 / 过期了？** 找提供邀请码的人再要一个。

**提示「名额已满」？** 托管服务的人数到上限了，联系提供服务的人。

**连着家里 Wi-Fi 时面板打不开，换成手机流量就好？** 打开面板的流量经过了 OpenClash 的代理节点，节点卡了就打不开。面板每 3 分钟自动检查，代理打不开会自动改走直连（需要先在面板「拉黑名单」里启用过一次规则集）。

**会不会被别人进我的路由器？** 不会。登录密钥只在你的路由器和你自己的手机上生成和保存；托管服务只负责转发和推送，拿不到密钥，也进不了你的路由器。

**登录地址泄露了？** 面板「系统操作 → 换登录密钥」，旧地址马上作废；其他手机重新添加，Claude 连接器换成新地址。

**升级？** 把第 1 步的命令再运行一次，网址和设置都保留，不用再输邀请码。

**不用了怎么办？** 登录路由器运行 `cd /tmp/openwrt-claude-panel && sh uninstall.sh`（`/tmp` 重启会清空，那就先重新下载解压一次），专属网址会自动交还。超过 90 天没上线的也会自动回收。

**从自建版换成托管版？** 网址会变成 `xxxxxxxx.yrlove520.com`；Claude 连接器要换新地址；推送要重新开一次；以前的云端备份留在旧服务上。登录密钥和面板里的设置都保留。
