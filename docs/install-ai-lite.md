# 安装教程：AI 版 · 精简版

> 在 Claude 里用中文对话管理路由器，同时有手机控制面板和本地看门狗。不需要 Cloudflare 账号也能装（用临时隧道）。

安装包：**`openwrt-claude-panel-ai-lite.tar.gz`**（在 [Releases](https://github.com/wznwzn123/openwrt-claude-panel/releases/latest) 页面下载）

其他版本的教程：[AI 版 · 完整版](install-ai-full.md) · [纯面板版 · 精简版](install-noai-lite.md) · [纯面板版 · 完整版](install-noai-full.md)


## 你需要准备

- 一台 **OpenWrt 22.03 或更新**的路由器（Kwrt、ImmortalWrt 等也可以），并且能上网
- 一台电脑，用来登录路由器的命令行（Windows 10/11、macOS 自带 `ssh` 和 `scp`，不用另装软件）
- 路由器闪存剩余空间 **40 MB 以上**（主要是 Cloudflare 隧道程序）。登录路由器后运行 `df -h /overlay` 看 `Available` 一列
- 一个 **Claude 账号**，并且能使用「自定义连接器」功能

下面的命令里，`192.168.1.1` 换成你路由器的地址，`router.example.com` 换成你自己的域名。

## 第 1 步：下载安装包

打开 [Releases](https://github.com/wznwzn123/openwrt-claude-panel/releases/latest)，在 **Assets** 里下载 **`openwrt-claude-panel-ai-lite.tar.gz`**，放到电脑的「下载」文件夹。

## 第 2 步：传到路由器并安装

在电脑上打开终端（Windows：开始菜单搜「PowerShell」；macOS：「终端」），先进入下载文件夹：

```sh
cd ~/Downloads
```

把安装包传到路由器（会让你输入路由器的 root 密码，和登录 LuCI 的密码一样）：

```sh
scp openwrt-claude-panel-ai-lite.tar.gz root@192.168.1.1:/tmp/
```

> 如果提示 `scp: ... sftp-server: not found`，在 scp 后面加 `-O`：`scp -O openwrt-claude-panel-ai-lite.tar.gz root@192.168.1.1:/tmp/`

登录路由器，解压并运行安装脚本：

```sh
ssh root@192.168.1.1
cd /tmp && tar xzf openwrt-claude-panel-ai-lite.tar.gz && cd openwrt-claude-panel
sh install.sh
```

安装脚本会自动补装缺少的软件（ucode、uhttpd、curl、cloudflared），然后问你隧道的设置，见下一步。

## 第 3 步：设置 Cloudflare 隧道（让手机在外面也能打开）

面板只在路由器内部运行，靠 Cloudflare 隧道从外网访问：**不用公网 IP、不用开端口**。安装脚本会问：

```
隧道 token（可留空）：
```

**方式 A：临时隧道（最简单）** —— 直接按回车。会得到一个 `xxx.trycloudflare.com` 的地址。缺点：**路由器每次重启地址都会变**，变了要重新查（见文末常见问题）。

**方式 B：自己的域名（推荐长期使用）** —— 按下面的步骤拿到隧道 token 再填：

1. 登录 https://dash.cloudflare.com ，左侧进入 **Zero Trust**（第一次进要选免费套餐）
2. **Networks → Tunnels → Create a tunnel**，类型选 **Cloudflared**，名字随便填（比如 `router`）
3. 下一页会显示安装命令，复制命令里 `--token` 后面那一长串（以 `eyJ` 开头），这就是隧道 token
4. 继续到 **Public Hostname**：Subdomain 填 `router`，Domain 选你的域名，Service 选 **HTTP**，URL 填 **`127.0.0.1:18765`**，保存
5. 回到路由器，把 token 粘贴进去，再按提示填域名 `router.example.com`


## 第 4 步：记下登录地址

安装完成后会显示：

```
已安装：AI版·精简版

手机面板：https://router.example.com/panel/

登录地址（第一次打开面板时粘贴）：
  https://router.example.com/cgi-bin/mcp/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

这个登录地址同时也是 Claude 连接器地址：……
```

**把登录地址复制保存好**（比如存到密码管理器）。⚠️ 这个地址里带着密钥，拿到它就等于拿到路由器的最高权限：**不要发给别人，也不要截图分享**。

## 第 5 步：在手机上打开面板

1. 手机浏览器打开 `https://router.example.com/panel/`（临时隧道就是 `https://xxx.trycloudflare.com/panel/`）
2. 粘贴上一步的**登录地址**，点登录
3. 添加到主屏幕，以后就像 App 一样打开：
   - **安卓**（Chrome / Edge）：右上角菜单 → 「添加到主屏幕」或「安装应用」
   - **iPhone**（Safari）：底部分享按钮 → 「添加到主屏幕」
4. 建议打开**面板锁**：侧边栏「系统操作」→「面板锁」，设一个密码，支持指纹解锁，离开 5 分钟自动上锁

## 第 6 步：连接 Claude

1. 打开 Claude（网页版 https://claude.ai 或 App）→ **设置 → 连接器 → 添加自定义连接器**
2. 名称填「我的路由器」，URL 填**登录地址**（就是第 4 步那个），不用填 OAuth，保存
3. 新开一个对话，试试：

   - 「看看路由器现在的状态」
   - 「谁在占网速？」
   - 「把节点切到延迟最低的日本节点」
   - 「OpenClash 最近有什么报错？」

会断网的操作（改网络、重启路由器、重启 OpenClash）Claude 会先说明影响，等你确认才执行；改设置前会自动备份，可以让它回滚。

## 第 7 步：完成 🎉 日常使用小贴士

- **看门狗**会每 30 秒检查宽带、DNS、隧道、OpenClash，出问题自动修复，记录在「断线记录」页
- 每天 9:00 自动**体检**一次，结果在「断线记录」页查看
- 「设备」页可以给孩子的设备设**定时断网**（比如每天 23:00–07:00）
- OpenClash 的节点、订阅、规则、覆写都能在面板里改，不用再开电脑

## 升级 / 卸载

**升级**：下载新版的 `openwrt-claude-panel-ai-lite.tar.gz`，按第 2 步重新传上去运行 `sh install.sh`，登录地址和所有设置都会保留。

**卸载**：

```sh
cd /tmp/openwrt-claude-panel
sh uninstall.sh          # 保留设置和记录，以后重装还能接着用
sh uninstall.sh --purge  # 全部删掉
```

（`/tmp` 重启后会清空，到时候重新解压一次安装包即可。）

## 常见问题

**临时隧道的地址变了，怎么查新地址？** 登录路由器运行：

```sh
grep -o "https://[a-z0-9-]*\.trycloudflare\.com" /tmp/claude-mcp-tunnel.log | tail -1
```

登录地址里 `/cgi-bin/mcp/` 后面的密钥不会变，只要把前面的域名换成新的，Claude 里的连接器地址也要一起改。长期使用建议换成自己的域名：重新运行 `sh install.sh --tunnel-token <token> --domain router.example.com`。

**手机打不开面板？** 先确认路由器能上网；登录路由器运行 `/etc/init.d/claude-mcp restart`，再看 `logread | grep -E "uhttpd|cloudflared"` 有没有报错。

**登录地址泄露了怎么办？** 登录路由器运行 `rm /etc/claude-mcp/config.json && cd /tmp/openwrt-claude-panel && sh install.sh`，会生成新的登录地址，旧的立刻失效（Claude 里的连接器也要换成新地址）。

**没装 OpenClash 能用吗？** 能。节点、订阅、规则这些 OpenClash 功能用不了，其他功能都正常。

**以后不想用 AI 了？** 重新运行 `sh install.sh --no-ai`，就变成纯面板版，Claude 连不上了，面板照常用。

**以后想要推送和云端备份？** 下载对应的完整版安装包，按[完整版教程](install-ai-full.md)操作，设置都会保留。

