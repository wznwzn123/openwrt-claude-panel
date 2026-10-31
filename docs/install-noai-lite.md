# 安装教程：纯面板版 · 精简版

> 不接 AI，只有手机控制面板和本地看门狗，全部自己动手点。不需要 Cloudflare 账号也能装（用临时隧道）。

安装包：**`openwrt-claude-panel-noai-lite.tar.gz`**（在 [Releases](https://github.com/wznwzn123/openwrt-claude-panel/releases/latest) 页面下载）

其他版本的教程：[AI 版 · 精简版](install-ai-lite.md) · [AI 版 · 完整版](install-ai-full.md) · [纯面板版 · 完整版](install-noai-full.md)


## 你需要准备

- 一台 **OpenWrt 22.03 或更新**的路由器（Kwrt、ImmortalWrt 等也可以），并且能上网
- 一台电脑，用来登录路由器的命令行（Windows 10/11、macOS 自带 `ssh` 和 `scp`，不用另装软件）。**只有手机也行**，见下面「只用手机装」
- 路由器闪存剩余空间 **40 MB 以上**（主要是 Cloudflare 隧道程序）。登录路由器后运行 `df -h /overlay` 看 `Available` 一列

> **只用手机装：** 手机连上家里 Wi-Fi，打开路由器后台「服务 → 终端」（或手机 SSH 软件），粘贴下面这条命令，然后从第 3 步接着看。详细步骤见 [📱 手机教程](install-phone.md)。
>
> ```sh
> # 下载并安装「纯面板版 · 精简版」（代号 noai-lite）
> cd /tmp && wget -O p.tar.gz https://yrlove520.com/dl/openwrt-claude-panel-noai-lite.tar.gz && tar xzf p.tar.gz && cd openwrt-claude-panel && sh install.sh
> ```

下面的命令里，`192.168.1.1` 换成你路由器的地址，`router.example.com` 换成你自己的域名。

## 第 1 步：下载安装包

打开 [Releases](https://github.com/wznwzn123/openwrt-claude-panel/releases/latest)，在 **Assets** 里下载 **`openwrt-claude-panel-noai-lite.tar.gz`**，放到电脑的「下载」文件夹。

## 第 2 步：传到路由器并安装

在电脑上打开终端（Windows：开始菜单搜「PowerShell」；macOS：「终端」），先进入下载文件夹：

```sh
cd ~/Downloads
```

把安装包传到路由器（会让你输入路由器的 root 密码，和登录 LuCI 的密码一样）：

```sh
scp openwrt-claude-panel-noai-lite.tar.gz root@192.168.1.1:/tmp/
```

> 如果提示 `scp: ... sftp-server: not found`，在 scp 后面加 `-O`：`scp -O openwrt-claude-panel-noai-lite.tar.gz root@192.168.1.1:/tmp/`

登录路由器，解压并运行安装脚本：

```sh
ssh root@192.168.1.1
cd /tmp && tar xzf openwrt-claude-panel-noai-lite.tar.gz && cd openwrt-claude-panel
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
已安装：纯面板版·精简版

手机面板：https://router.example.com/panel/

登录地址（第一次打开面板时粘贴）：
  https://router.example.com/cgi-bin/mcp/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**把登录地址复制保存好**（比如存到密码管理器）。⚠️ 地址里带着密钥，拿到它就等于拿到路由器的最高权限：**不要发给别人，也不要截图分享**。

## 第 5 步：在手机上打开面板

1. 手机浏览器打开 `https://router.example.com/panel/`（临时隧道就是 `https://xxx.trycloudflare.com/panel/`）
2. 粘贴上一步的**登录地址**，点登录
3. 添加到主屏幕，以后就像 App 一样打开：
   - **安卓**（Chrome / Edge）：右上角菜单 → 「添加到主屏幕」或「安装应用」
   - **iPhone**（Safari）：底部分享按钮 → 「添加到主屏幕」
4. 建议打开**面板锁**：侧边栏「系统操作」→「面板锁」，设一个密码，支持指纹解锁，离开 5 分钟自动上锁
5. 家里其他手机：在已经登录的手机上打开「系统操作」→「添加新手机」，用新手机扫码就直接登录，不用再粘贴地址

> 也可以直接在手机上打开安装完成时显示的 `https://…/panel/#login=…` 链接，自动登录。

## 第 6 步：完成 🎉 日常使用小贴士

- **看门狗**会每 30 秒检查宽带、DNS、隧道、OpenClash，出问题自动修复，记录在「断线记录」页
- 每天 9:00 自动**体检**一次，结果在「断线记录」页查看
- 「设备」页可以给孩子的设备设**定时断网**（比如每天 23:00–07:00）
- OpenClash 的节点、订阅、规则、覆写都能在面板里改，不用再开电脑
- 想换个样子：「系统操作」→「主题与背景」，可以选预设背景或手机相册里的图片，调模糊和明暗；手机比较卡的话可以关掉玻璃效果
- 有新版本时面板首页会提示，点「**一键更新**」，设置都保留、不会断网，装不好会自动退回
- 手机不用了：侧边栏最下面「**退出登录**」

## 升级 / 卸载

**升级**：面板首页提示有新版时点「一键更新」（v1.3.1 起）；或者下载新版的 `openwrt-claude-panel-noai-lite.tar.gz`，按第 2 步重新传上去运行 `sh install.sh`，登录地址和所有设置都会保留。

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

登录地址里 `/cgi-bin/mcp/` 后面的密钥不会变，只要把前面的域名换成新的。长期使用建议换成自己的域名：重新运行 `sh install.sh --tunnel-token <token> --domain router.example.com`。

**手机打不开面板？** 先确认路由器能上网；登录路由器运行 `/etc/init.d/claude-mcp restart`，再看 `logread | grep -E "uhttpd|cloudflared"` 有没有报错。

**登录地址泄露了怎么办？** 面板「系统操作 → 换登录密钥」，旧的登录地址立刻失效，这台手机自动换成新的；其他手机重新添加。

**「终端」是哪个？** 安装、升级都在**路由器后台的终端**（LuCI「服务 → 终端」或 SSH，用户名 `root`、密码是后台密码）里做。手机面板里也有个终端，它已经是 root，不用登录（输 `password` 会提示 command not found，因为那不是命令）。

**连着家里的 Wi-Fi 时面板打不开，换成手机流量就好？** 打开面板的流量经过了 OpenClash 的代理节点，节点卡了就打不开。面板每 3 分钟自动检查，代理打不开会自动改走直连（需要先在面板「拉黑名单」里启用过一次规则集）。

**没装 OpenClash 能用吗？** 能。节点、订阅、规则这些 OpenClash 功能用不了，其他功能都正常。

**以后想用 Claude 管理路由器？** 重新运行 `sh install.sh --ai`，就变成 AI 版，装完会显示「Claude 连接器地址」，把它填到 Claude 的自定义连接器里即可。

**以后想要推送和云端备份？** 下载对应的完整版安装包，按[完整版教程](install-noai-full.md)操作，设置都会保留。

