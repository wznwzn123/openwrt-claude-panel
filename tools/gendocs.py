# 生成 4 份自建版安装教程（docs/install-{ai,noai}-{lite,full}.md）：改教程改这里，然后运行 python3 tools/gendocs.py
import os
REL = 'https://github.com/wznwzn123/openwrt-claude-panel/releases/latest'
ED = {
 ('ai','lite'):   ('AI 版 · 精简版',   'openwrt-claude-panel-ai-lite.tar.gz',   '在 Claude 里用中文对话管理路由器，同时有手机控制面板和本地看门狗。不需要 Cloudflare 账号也能装（用临时隧道）。'),
 ('ai','full'):   ('AI 版 · 完整版',   'openwrt-claude-panel-ai-full.tar.gz',   'AI 版的全部功能，再加 Cloudflare 云端：手机 / 微信推送、每天自动云端备份、路由器断电断网时也能知道原因。需要 Cloudflare 账号和一个自己的域名。'),
 ('noai','lite'): ('纯面板版 · 精简版', 'openwrt-claude-panel-noai-lite.tar.gz', '不接 AI，只有手机控制面板和本地看门狗，全部自己动手点。不需要 Cloudflare 账号也能装（用临时隧道）。'),
 ('noai','full'): ('纯面板版 · 完整版', 'openwrt-claude-panel-noai-full.tar.gz', '不接 AI，手机控制面板 + 本地看门狗，再加 Cloudflare 云端：手机 / 微信推送、每天自动云端备份、断电断网判断。需要 Cloudflare 账号和一个自己的域名。'),
}
def doc(ai, ed):
    title, pkg, intro = ED[(ai, ed)]
    full = ed == 'full'; A = ai == 'ai'
    n = [0]
    def h(t):
        n[0] += 1; return f'\n## 第 {n[0]} 步：{t}\n'
    o = [f'# 安装教程：{title}\n', f'> {intro}\n',
         f'安装包：**`{pkg}`**（在 [Releases]({REL}) 页面下载）\n',
         '其他版本的教程：' + ' · '.join(f'[{ED[k][0]}](install-{k[0]}-{k[1]}.md)' for k in ED if k != (ai, ed)) + '\n',
         '\n## 你需要准备\n',
         '- 一台 **OpenWrt 22.03 或更新**的路由器（Kwrt、ImmortalWrt 等也可以），并且能上网',
         '- 一台电脑，用来登录路由器的命令行（Windows 10/11、macOS 自带 `ssh` 和 `scp`，不用另装软件）。**只有手机也行**，见下面「只用手机装」',
         '- 路由器闪存剩余空间 **40 MB 以上**（主要是 Cloudflare 隧道程序）。登录路由器后运行 `df -h /overlay` 看 `Available` 一列',
    ]
    if full:
        o += ['- 一个 **Cloudflare 账号**（免费）和一个**托管在 Cloudflare 上的域名**（例如 `example.com`；完整版必须用自己的域名）',
              '- 电脑上装好 **Node.js 18 或更新**（https://nodejs.org 下载 LTS 版安装），用来部署云端']
    if A:
        o += ['- 一个 **Claude 账号**，并且能使用「自定义连接器」功能']
    code = f'{ai}-{ed}'
    o += ['\n> **只用手机装：** 手机连上家里 Wi-Fi，打开路由器后台「服务 → 终端」（或手机 SSH 软件），粘贴下面这条命令，然后从第 3 步接着看。详细步骤见 [📱 手机教程](install-phone.md)。',
          '>', '> ```sh', f'> # 下载并安装「{title}」（代号 {code}）', f'> cd /tmp && wget -O p.tar.gz https://yrlove520.com/dl/openwrt-claude-panel-{code}.tar.gz && tar xzf p.tar.gz && cd openwrt-claude-panel && sh install.sh', '> ```']
    o += ['\n下面的命令里，`192.168.1.1` 换成你路由器的地址，`router.example.com` 换成你自己的域名。']

    o.append(h('下载安装包'))
    o += [f'打开 [Releases]({REL})，在 **Assets** 里下载 **`{pkg}`**，放到电脑的「下载」文件夹。']

    o.append(h('传到路由器并安装'))
    o += ['在电脑上打开终端（Windows：开始菜单搜「PowerShell」；macOS：「终端」），先进入下载文件夹：', '',
          '```sh', 'cd ~/Downloads', '```', '',
          '把安装包传到路由器（会让你输入路由器的 root 密码，和登录 LuCI 的密码一样）：', '',
          '```sh', f'scp {pkg} root@192.168.1.1:/tmp/', '```', '',
          '> 如果提示 `scp: ... sftp-server: not found`，在 scp 后面加 `-O`：`scp -O ' + pkg + ' root@192.168.1.1:/tmp/`', '',
          '登录路由器，解压并运行安装脚本：', '',
          '```sh', 'ssh root@192.168.1.1', f'cd /tmp && tar xzf {pkg} && cd openwrt-claude-panel', 'sh install.sh', '```', '',
          '安装脚本会自动补装缺少的软件（ucode、uhttpd、curl、cloudflared），然后问你隧道的设置，见下一步。']

    o.append(h('设置 Cloudflare 隧道（让手机在外面也能打开）'))
    o += ['面板只在路由器内部运行，靠 Cloudflare 隧道从外网访问：**不用公网 IP、不用开端口**。安装脚本会问：', '',
          '```', '隧道 token（可留空）：', '```', '']
    if not full:
        o += ['**方式 A：临时隧道（最简单）** —— 直接按回车。会得到一个 `xxx.trycloudflare.com` 的地址。缺点：**路由器每次重启地址都会变**，变了要重新查（见文末常见问题）。', '',
              '**方式 B：自己的域名（推荐长期使用）** —— 按下面的步骤拿到隧道 token 再填：', '']
    else:
        o += ['完整版必须用**自己的域名**，按下面的步骤拿到隧道 token：', '']
    o += ['1. 登录 https://dash.cloudflare.com ，左侧进入 **Zero Trust**（第一次进要选免费套餐）',
          '2. **Networks → Tunnels → Create a tunnel**，类型选 **Cloudflared**，名字随便填（比如 `router`）',
          '3. 下一页会显示安装命令，复制命令里 `--token` 后面那一长串（以 `eyJ` 开头），这就是隧道 token',
          '4. 继续到 **Public Hostname**：Subdomain 填 `router`，Domain 选你的域名，Service 选 **HTTP**，URL 填 **`127.0.0.1:18765`**，保存',
          '5. 回到路由器，把 token 粘贴进去，再按提示填域名 `router.example.com`', '']
    if full:
        o += ['接着脚本会问「云端地址」，直接回车用默认的 `https://router.example.com/cloud`。']

    o.append(h('记下登录地址'))
    o += ['安装完成后会显示：', '', '```', f'已安装：{title.replace(" ", "")}', '', '手机面板：https://router.example.com/panel/', '',
          '登录地址（第一次打开面板时粘贴）：', '  https://router.example.com/cgi-bin/mcp/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx']
    if A: o += ['', 'Claude 连接器地址（在 Claude「设置 → 连接器 → 添加自定义连接器」里填它；只给 Claude 用，打不开面板）：', '  https://router.example.com/cgi-bin/mcp/yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy']
    if full: o += ['', '---------- 完整版：把下面 3 个值设成 Worker 的密钥 ----------', '  PANEL_TOKEN = ……', '  RKEY        = ……', '  TKEY        = ……']
    o += ['```', '',
          ('**把登录地址和 Claude 连接器地址复制保存好**' if A else '**把登录地址复制保存好**') + '（比如存到密码管理器）。⚠️ 地址里带着密钥，拿到它就等于拿到路由器的最高权限：**不要发给别人，也不要截图分享**。']
    if full: o += ['', '完整版还要记下最后那 3 个值（PANEL_TOKEN、RKEY、TKEY），后面「部署 Cloudflare 云端」那一步要用。忘了也没关系，以后在路由器上运行 `cat /etc/claude-mcp/config.json /etc/claude-mcp/cloud.conf` 就能看到。']

    o.append(h('在手机上打开面板'))
    o += ['1. 手机浏览器打开 `https://router.example.com/panel/`（临时隧道就是 `https://xxx.trycloudflare.com/panel/`）',
          '2. 粘贴上一步的**登录地址**，点登录',
          '3. 添加到主屏幕，以后就像 App 一样打开：',
          '   - **安卓**（Chrome / Edge）：右上角菜单 → 「添加到主屏幕」或「安装应用」',
          '   - **iPhone**（Safari）：底部分享按钮 → 「添加到主屏幕」',
          '4. 建议打开**面板锁**：侧边栏「系统操作」→「面板锁」，设一个密码，支持指纹解锁，离开 5 分钟自动上锁',
          '5. 家里其他手机：在已经登录的手机上打开「系统操作」→「添加新手机」，用新手机扫码就直接登录，不用再粘贴地址', '',
          '> 也可以直接在手机上打开安装完成时显示的 `https://…/panel/#login=…` 链接，自动登录。']

    if A:
        o.append(h('连接 Claude'))
        o += ['1. 打开 Claude（网页版 https://claude.ai 或 App）→ **设置 → 连接器 → 添加自定义连接器**',
              '2. 名称填「我的路由器」，URL 填 **Claude 连接器地址**（第 4 步显示的，不是登录地址；忘了在面板「系统操作 → Claude 连接器地址」里复制），不用填 OAuth，保存',
              '3. 新开一个对话，试试：', '',
              '   - 「看看路由器现在的状态」', '   - 「谁在占网速？」', '   - 「把节点切到延迟最低的日本节点」', '   - 「OpenClash 最近有什么报错？」', '',
              '会断网的操作（改网络、重启路由器、重启 OpenClash）Claude 会先说明影响，等你确认才执行；改设置前会自动备份，可以让它回滚。']

    if full:
        o.append(h('部署 Cloudflare 云端'))
        o += ['在**电脑**上操作。完整版安装包里带着云端的代码（`cloud` 文件夹），在电脑的终端里把第 1 步下载的安装包解压，进入 `cloud` 文件夹（Windows 10/11 的 PowerShell 也自带 `tar`）：', '',
              '```sh', 'cd ~/Downloads', f'tar xzf {pkg}', 'cd openwrt-claude-panel/cloud', '```', '',
              '**① 改配置**：用记事本打开 `wrangler.toml`，把 `router.example.com` 和 `example.com` 换成你的面板域名和主域名，`VAPID_SUB` 改成你的邮箱，保存。', '',
              '**② 登录并部署**：', '', '```sh', 'npx wrangler login', 'npx wrangler deploy', '```', '',
              '`wrangler login` 会打开浏览器让你授权 Cloudflare 账号。', '',
              '**③ 设置密钥**：每条命令会提示你粘贴一个值，依次粘贴第 4 步记下的 PANEL_TOKEN、RKEY、TKEY：', '',
              '```sh', 'npx wrangler secret put PANEL_TOKEN', 'npx wrangler secret put RKEY', 'npx wrangler secret put TKEY', '```', '',
              '**④ 生成推送密钥**并设置：', '', '```sh', 'node gen-vapid.mjs', 'npx wrangler secret put VAPID_PRIV', 'npx wrangler secret put VAPID_PUB', '```', '',
              '`gen-vapid.mjs` 会输出两行：`VAPID_PRIV=` 后面那一整段（`{"kty":"EC",...}`）粘给 VAPID_PRIV，`VAPID_PUB=` 后面那一串（`B` 开头）粘给 VAPID_PUB。', '',
              '**⑤ 检查**：手机浏览器打开 `https://router.example.com/cloud/push/key`，看到 `{"key":"B…"}` 就成功了。']

        o.append(h('打开推送和云端备份'))
        o += ['打开面板的 **断线记录** 页：', '',
              '- **云端监测**：「路由器报告」显示几秒前、「隧道探测」显示正常，说明云端连上了（最多等 1 分钟）',
              '- **手机通知**：点「开启通知」并允许通知，再点「发一条测试」，手机收到就好了',
              '- **微信推送**（可选）：到 https://www.pushplus.plus 微信扫码登录，复制你的 token，粘贴到「手机通知」卡片里的微信推送',
              '- **云端备份**：侧边栏打开「云端备份」，点「立即备份」。之后每天 4:07 自动备份，最多留 10 份',
              '- **平板证人**（可选）：家里有闲置的安卓手机 / 平板的话，点「平板设置方法」照着做，断线时就能分清是断电还是断网']

    o.append(h('完成 🎉 日常使用小贴士'))
    o += ['- **看门狗**会每 30 秒检查宽带、DNS、隧道、OpenClash，出问题自动修复，记录在「断线记录」页',
          '- 每天 9:00 自动**体检**一次' + ('，结果推送到手机' if full else '，结果在「断线记录」页查看'),
          '- 「设备」页可以给孩子的设备设**定时断网**（比如每天 23:00–07:00）',
          '- OpenClash 的节点、订阅、规则、覆写都能在面板里改，不用再开电脑',
          '- 想换个样子：「系统操作」→「主题与背景」，可以选预设背景或手机相册里的图片，调模糊和明暗；手机比较卡的话可以关掉玻璃效果',
          '- 有新版本时面板首页会提示，点「**一键更新**」，设置都保留、不会断网，装不好会自动退回',
          '- 手机不用了：侧边栏最下面「**退出登录**」']

    o += ['\n## 升级 / 卸载\n',
          f'**升级**：面板首页提示有新版时点「一键更新」（v1.3.1 起）；或者下载新版的 `{pkg}`，按第 2 步重新传上去运行 `sh install.sh`，登录地址和所有设置都会保留。', '',
          '**卸载**：', '', '```sh', 'cd /tmp/openwrt-claude-panel', 'sh uninstall.sh          # 保留设置和记录，以后重装还能接着用', 'sh uninstall.sh --purge  # 全部删掉', '```', '',
          '（`/tmp` 重启后会清空，到时候重新解压一次安装包即可。）']

    o += ['\n## 常见问题\n']
    if not full:
        o += ['**临时隧道的地址变了，怎么查新地址？** 登录路由器运行：', '', '```sh', 'grep -o "https://[a-z0-9-]*\\.trycloudflare\\.com" /tmp/claude-mcp-tunnel.log | tail -1', '```', '',
              '登录地址里 `/cgi-bin/mcp/` 后面的密钥不会变，只要把前面的域名换成新的' + ('，Claude 里的连接器地址也要一起改域名' if A else '') + '。长期使用建议换成自己的域名：重新运行 `sh install.sh --tunnel-token <token> --domain router.example.com`。', '']
    o += ['**手机打不开面板？** 先确认路由器能上网；登录路由器运行 `/etc/init.d/claude-mcp restart`，再看 `logread | grep -E "uhttpd|cloudflared"` 有没有报错。', '',
          '**登录地址泄露了怎么办？** 面板「系统操作 → 换登录密钥」，旧的登录地址立刻失效，这台手机自动换成新的；其他手机重新添加' + ('（Worker 的 PANEL_TOKEN 也要更新）' if full else '') + '。' + ('Claude 连接器地址是另一把钥匙，不受影响；它泄露了在「系统操作 → Claude 连接器地址」里换一个。' if A else ''), '',
          '**「终端」是哪个？** 安装、升级都在**路由器后台的终端**（LuCI「服务 → 终端」或 SSH，用户名 `root`、密码是后台密码）里做。手机面板里也有个终端，它已经是 root，不用登录（输 `password` 会提示 command not found，因为那不是命令）。', '',
          '**连着家里的 Wi-Fi 时面板打不开，换成手机流量就好？** 打开面板的流量经过了 OpenClash 的代理节点，节点卡了就打不开。面板每 3 分钟自动检查，代理打不开会自动改走直连（需要先在面板「拉黑名单」里启用过一次规则集）。', '',
          '**没装 OpenClash 能用吗？** 能。节点、订阅、规则这些 OpenClash 功能用不了，其他功能都正常。', '']
    if A:
        o += ['**以后不想用 AI 了？** 重新运行 `sh install.sh --no-ai`，就变成纯面板版，Claude 连不上了，面板照常用。', '']
    else:
        o += ['**以后想用 Claude 管理路由器？** 重新运行 `sh install.sh --ai`，就变成 AI 版，装完会显示「Claude 连接器地址」，把它填到 Claude 的自定义连接器里即可。', '']
    if not full:
        o += ['**以后想要推送和云端备份？** 下载对应的完整版安装包，按[完整版教程](install-' + ai + '-full.md)操作，设置都会保留。', '']
    return '\n'.join(o) + '\n'

for (ai, ed) in ED:
    open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', f'install-{ai}-{ed}.md'), 'w', encoding='utf-8').write(doc(ai, ed))
print('ok')
