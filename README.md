# openwrt-claude-panel

让 **Claude** 直接管理你家的 OpenWrt 路由器，并附带一个好看的**手机控制面板**（PWA，可添加到主屏幕）。

- 在 Claude 里用中文说一句「把奈飞切到新加坡节点」「看看谁在占网速」「给这台设备晚上 11 点断网」，它就能直接在路由器上操作。
- 手机面板覆盖日常要用的一切：OpenClash 节点和订阅、设备管理、流量统计、测速、断线记录、文件管理、终端……不用再在手机上缩放 LuCI。
- 全部跑在路由器自带的 `ucode` + `uhttpd` 上，**不需要 Python / Node / Docker**，占用很小。
- 通过 Cloudflare 隧道访问：**不用公网 IP、不用开端口**。

> ⚠️ 连接器地址里带着密钥，拿到它就等于拿到路由器的 root 权限。请当作密码保管，不要发给别人、不要截图分享。详见下方「安全说明」。

## 两个版本

| | 精简版 `lite` | 完整版 `full` |
|---|:---:|:---:|
| Claude 连接器（30+ 个路由器工具） | ✅ | ✅ |
| 手机控制面板（OpenClash / 设备 / 流量 / 测速 / 文件 / 终端…） | ✅ | ✅ |
| 本地看门狗：宽带、DNS、隧道、OpenClash 自动修复，断线记录 | ✅ | ✅ |
| 设备暂停上网（定时断网）、节点挂了自动切换、每日体检 | ✅ | ✅ |
| 面板锁（指纹 / 密码） | ✅ | ✅ |
| 手机推送 / 微信推送（PushPlus） | — | ✅ |
| 云端备份（每天自动，保留 10 份，可一键恢复） | — | ✅ |
| 断电 / 断网判断（路由器离线时也能从云端看到原因） | — | ✅ |
| 需要 Cloudflare 账号 | 可选（临时隧道无需账号） | 需要，且需要一个托管在 Cloudflare 的域名 |

不确定就先装精简版，以后在路由器上重新运行安装脚本选完整版即可，设置都会保留。

## 运行要求

- OpenWrt 22.03 或更新（需要 `ucode`；Kwrt、ImmortalWrt 等衍生版本同样可用）
- 约 2 MB 闪存空间；`cloudflared` 本身约 30 MB，空间不够请先扩容 overlay
- [OpenClash](https://github.com/vernesong/OpenClash)：可选，但节点、订阅、规则、测速分流等功能依赖它
- 「设备暂停上网」目前使用 `iptables`（fw3 或装了 `iptables-nft` 的 fw4）

安装脚本会自动补装缺少的依赖：`ucode ucode-mod-fs ucode-mod-uci uhttpd curl cloudflared`。

## 安装

1. 到 [Releases](../../releases) 下载 `openwrt-claude-panel-lite.tar.gz` 或 `openwrt-claude-panel-full.tar.gz`。
2. 传到路由器并安装：

   ```sh
   scp openwrt-claude-panel-lite.tar.gz root@192.168.1.1:/tmp/
   ssh root@192.168.1.1
   cd /tmp && tar xzf openwrt-claude-panel-lite.tar.gz && cd openwrt-claude-panel
   sh install.sh
   ```

3. 按提示选择版本、填写隧道信息。装完会打印：

   ```
   Claude 连接器地址：https://router.example.com/cgi-bin/mcp/<密钥>
   手机面板：https://router.example.com/panel/
   ```

也可以用参数免交互安装：

```sh
sh install.sh --lite --tunnel-token <隧道token> --domain router.example.com
sh install.sh --full --tunnel-token <隧道token> --domain router.example.com --cloud-url https://router.example.com/cloud
```

### 隧道：两种方式

| | 临时隧道 | 命名隧道（推荐） |
|---|---|---|
| 需要什么 | 什么都不用 | Cloudflare 账号 + 一个托管在 Cloudflare 的域名 |
| 地址 | `xxx.trycloudflare.com`，**每次重启都会变** | 你自己的固定域名 |
| 适合 | 先试试看 | 长期使用、完整版 |

**命名隧道设置：** Cloudflare 控制台 → Zero Trust → Networks → Tunnels → 新建隧道（类型 Cloudflared）→ 复制安装命令里 `--token` 后面那串 → 在「Public Hostname」里添加 `router.example.com`，服务填 `HTTP` / `127.0.0.1:18765`。把 token 和域名填进安装脚本即可。

## 连接 Claude

Claude 网页版或 App：**设置 → 连接器 → 添加自定义连接器**，URL 填安装时打印的连接器地址，不需要填 OAuth。之后在对话里就能直接让 Claude 管理路由器。

Claude 能用的工具包括：路由器状态、设备列表、实时网速、连接列表、OpenClash 节点切换 / 延迟测试 / 模式切换 / 自定义规则、系统日志、服务控制、软件包、uci 读写与回滚、OAF 应用过滤，以及在其他工具做不到时执行 shell 命令。

会断网的操作（改网络/防火墙、重启路由器、重启 OpenClash）在工具说明里都要求 Claude **先说明影响、等你确认**再执行；修改 uci 前会自动备份，可以一键回滚。

## 手机面板

用手机浏览器打开 `https://<你的域名>/panel/`，第一次粘贴连接器地址登录，然后「添加到主屏幕」，就和 App 一样用。

- 首页：在线状态、实时网速、CPU / 内存、快捷操作
- OpenClash：节点切换与测速、订阅管理、配置文件、覆写、自定义规则、插件设置
- 设备：在线设备、改名、拉黑、暂停上网（到点恢复 / 每天定时断网）
- 流量统计、网速测试（代理 / 直连）、连接列表
- 文件管理、终端、系统日志、进程、LuCI 原版页面（自动登录）
- 断线记录与看门狗、每日体检、云端备份（完整版）、手机通知（完整版）
- 面板锁：指纹或 6 位密码，离开 5 分钟自动上锁

## 完整版：部署 Cloudflare Worker

完整版的推送、云端备份、断电断网判断由一个 Cloudflare Worker 提供，部署步骤见 [cloud/README.md](cloud/README.md)。大致是：

1. 在路由器上运行 `sh install.sh --full`，它会生成 3 个密钥并打印出来；
2. 在电脑上用 `wrangler` 部署 `cloud/` 目录，把这 3 个密钥和 VAPID 密钥设成 Worker 的 secret；
3. 打开面板「断线记录」页，「云端监测」显示正常就好了。

## 安全说明

请务必读一下：

- **连接器地址 = 路由器 root 权限。** 地址里的密钥（40 位随机字符）是唯一的访问凭证，它能执行任意命令。泄露后请立即换一个：删除 `/etc/claude-mcp/config.json` 后重新运行 `sh install.sh`，然后在 Claude 和面板里换成新地址（完整版还要更新 Worker 的 `PANEL_TOKEN`）。
- **面板锁只防「拿到你手机的人」**，不防拿到连接器地址的人。它是浏览器端的保护：清除网站数据会让锁失效（同时也会退出登录，需要重新粘贴地址）。
- 面板里打开的 LuCI 原版页面使用一个专用的 rpcd 账号 `cmcp`（随机密码，保存在 `/etc/claude-mcp/luci_pass`），只有带着面板 Cookie 的请求才能使用。
- 服务只监听 `127.0.0.1:18765`，局域网和公网都无法直接访问，只能经过 Cloudflare 隧道。
- 想多一层保护，可以在 Cloudflare Zero Trust 里给 `/panel/*` 加 Access 登录（注意不要拦住 `/cgi-bin/mcp/*`，否则 Claude 连不上）。

## 升级 / 卸载

```sh
# 升级：下载新版解压后再运行一次，密钥和设置保留
sh install.sh

# 卸载：保留 /etc/claude-mcp 里的设置和记录
sh uninstall.sh
# 连设置一起删掉
sh uninstall.sh --purge
```

## 文件位置

| 路径 | 内容 |
|---|---|
| `/www-claude-mcp/cgi-bin/mcp` | 连接器主程序（ucode CGI） |
| `/www-claude-mcp/panel/` | 手机面板 |
| `/usr/sbin/cmcp-*` | 看门狗、节点自动切换、设备暂停、流量统计、每日体检、通知、云端备份 |
| `/usr/share/ucode/cmcp/lib.uc` | 共用函数 |
| `/etc/init.d/claude-mcp` | 面板服务（uhttpd）+ Cloudflare 隧道 |
| `/etc/init.d/cmcp-watchdog` | 看门狗 |
| `/etc/claude-mcp/` | 密钥、设置、断线记录、流量数据 |

## 常见问题

**Claude 提示连接器连不上？** 先在手机浏览器打开面板地址确认隧道是通的；临时隧道重启后地址会变，需要到 Claude 里更新地址（运行 `grep trycloudflare /tmp/claude-mcp-tunnel.log` 查看新地址）。

**面板显示「连不上路由器」？** 看看 `/etc/init.d/claude-mcp status`，以及 `logread | grep -E 'uhttpd|cloudflared'`。看门狗也会自动重启没响应的面板服务和隧道。

**没装 OpenClash 能用吗？** 能。系统、设备、流量、文件、终端、看门狗等功能不依赖 OpenClash；节点、订阅、规则、分流测速这些 OpenClash 相关功能就用不了。

**侧边栏里有的原版页面打不开？** 侧边栏里「在面板中打开的 LuCI 原版页面」是按 Kwrt / ImmortalWrt 的菜单整理的，其他固件上个别页面可能不存在；新装的插件会自动出现在「服务」里。

**会不会和 LuCI 冲突？** 不会。面板用的是独立的 uhttpd 实例（只监听 127.0.0.1:18765），不改动原有的 LuCI 和 Web 服务。

## 许可证

[MIT](LICENSE)
