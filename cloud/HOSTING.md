# 托管服务（给别人开通专属网址）

托管服务让别人装上路由器面板后，**只要输入邀请码**，就自动得到一个专属网址（`https://随机8位.你的域名`），在家在外都能用，推送、云端备份、断电断网判断全都有，他们不用注册 Cloudflare、不用买域名。

## 安全设计

- **登录密钥在用户的路由器上生成，保存在路由器和手机上**；账号、开通中心都不存密钥。
- **云端备份**：备份是路由器全部设置的整包（含面板登录密钥、Wi-Fi 密码、宽带账号、root 密码哈希、SSH 私钥）。v2.0.8 起路由器上有 openssl 就先加密（AES-256-CBC + HMAC-SHA256，密钥 `/etc/claude-mcp/bk.key` 只在路由器上）再上传，Watch 只存密文并标 `enc`；没有 openssl 的跟以前一样原样上传，**不会自动装**，用户在面板「云端备份」页点「开启加密」才装 openssl-util。旧备份不主动删，靠最多 10 份轮换。下载、还原时路由器先校验再解密；没加密的照旧直接用。
- 要向用户说明的风险：一键更新来自 GitHub 发布的安装包，远程访问的流量经过 Cloudflare 加密转发；这两个环节出问题，理论上会影响到路由器。对外不要写「进不了路由器」这类绝对的话。
- 托管服务只发三把「云端钥匙」，只能读写那台路由器自己的云端数据（心跳、推送、备份），每台互相隔离。
- 网址随机分配，用户不能指定；删除只能由那台路由器自己（凭钥匙）或管理员操作。
- Cloudflare API 令牌只存在 Worker 的密钥里，不会发给任何路由器。
- 邀请码控制谁能开通；同一个 IP 每小时最多开通 5 台、全站每小时最多 60 台；名额有上限（部署时用 `MAX_DEVICES` 设，6.0 起管理后台「路由器」页能直接改）。名额满了官网停止注册新账号，新用户留邮箱排队，腾出名额后按排队先后发邮件。
- 90 天没上线的路由器自动回收（删隧道、删子域名、删数据）。

**你要守住的**：托管服务的 Cloudflare 账号（建议单独注册、开两步验证）。账号被盗的话，攻击者能把用户的网址指到假页面骗登录地址。

## 部署

### 1. 准备

- 一个**专门的 Cloudflare 账号**，开好两步验证
- 一个接入这个账号的**域名**（下面用 `example.com` 代替）
- 电脑上装好 Node.js 18+

### 2. 创建 API 令牌

Cloudflare 控制台 → 右上角头像 → **My Profile → API Tokens → Create Token → Create Custom Token**：

| 权限 | 范围 |
|---|---|
| Account · **Cloudflare Tunnel** · Edit | 你的账户 |
| Zone · **DNS** · Edit | 只选 `example.com` |

只给这两项，别的都不要。创建后复制令牌（只显示一次）。

再记下两个 ID：域名概览页右下角的 **Account ID** 和 **Zone ID**。

### 3. 部署

#### 方法 A：在手机上用 GitHub 一键部署（不用电脑）

第 2 步的令牌就是下面的「运行令牌」。再建一个**部署令牌**（同样 Create Custom Token）：

| 权限 | 范围 |
|---|---|
| Account · **Workers Scripts** · Edit | 你的账户 |
| Zone · **Workers Routes** · Edit | 只选 `example.com` |
| Zone · **DNS** · Edit | 只选 `example.com` |
| Zone · **Zone** · Read | 只选 `example.com` |

GitHub 仓库 **Settings → Secrets and variables → Actions**：

| 类型 | 名字 | 值 |
|---|---|---|
| Variables | `HUB_URL` | `https://example.com` |
| Secrets | `CF_DEPLOY_TOKEN` | 部署令牌 |
| Secrets | `HUB_RUNTIME_TOKEN` | 运行令牌（第 2 步那个） |
| Secrets | `HUB_ADMIN_KEY` | 自己编的 32 位以上随机字符，管理用，另外存好 |
| Secrets | `RESEND_API_KEY` | （可选）邮件验证码，见下文 |
| Variables | `ADMIN_EMAIL` | （可选）有人提交续期申请时发邮件提醒你，见下文 |

然后 **Actions → 部署托管服务 → Run workflow**。几分钟后显示绿勾，结果里写着「部署好了」就完成了。推送密钥第一次部署时自动生成。以后改了代码，再运行一次就是更新。

#### 方法 B：在电脑上用 wrangler

把 `cloud/wrangler.hosted.toml` 里的 `example.com`、`CF_ACCOUNT_ID`、`CF_ZONE_ID`、`VAPID_SUB` 换成你的，然后：

```sh
cd cloud
npx wrangler login
npx wrangler deploy -c wrangler.hosted.toml

npx wrangler secret put CF_API_TOKEN -c wrangler.hosted.toml   # 第 2 步的 API 令牌
npx wrangler secret put ADMIN_KEY -c wrangler.hosted.toml      # 自己编一串 32 位以上的随机字符，管理用
node gen-vapid.mjs
npx wrangler secret put VAPID_PRIV -c wrangler.hosted.toml
npx wrangler secret put VAPID_PUB -c wrangler.hosted.toml
```

官网页面在 `cloud/site/` 里，改完运行 `node tools/build-site.mjs` 再部署。

打开 `https://example.com/api/ping`，看到 `{"ok":true,...}` 就部署好了。（6.0 起这个公开地址只说在线、开没开邮件验证码、名额满没满；名额、文件存储这些在管理后台「设置」里看，或者带管理员密钥访问 `/api/admin/health`。）

### 4. 发邀请码

```sh
curl -X POST https://example.com/api/admin/invites \
  -H "Authorization: Bearer 你的ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"max": 20, "days": 7, "svc": 7, "note": "酷安第一帖"}'
```

`max` 是这个码能开通几台，`days` 是这个码几天内能拿来开通（0 = 一直能用），`svc` 是开通后能用几天（**试用期**，0 = 不限期）。

手机上更方便：仓库的 **Actions →「生成邀请码」→ Run workflow**，填好点运行，邀请码显示在运行结果里。也可以在管理页 `/admin` 里生成。

### 试用期和续期码

- 用带试用期（`svc`）的邀请码开通的路由器有**到期时间**。官网账号页会显示「到期时间、还剩几天」；到期前 3 天推送提醒一次。
- **到期后自动暂停**：专属网址打不开，推送、云端备份、断电断网判断都停；家里上网和路由器上的设置不受影响。暂停超过 30 天还没续，就删掉，腾出名额。
- **续期**：用户找你要续期码，在官网账号页这台路由器下面点「续期」输入。续期码只能用一次；没到期就在原到期时间上加，已到期就从输入那天算，**暂停的马上恢复**（管理员封禁的不会自动解封）。
- 生成续期码：**Actions →「生成续期码」**（3 个月填 90 天，可以一次生成好几个），或者管理页 `/admin` 的「续期码」。作废：**Actions →「作废邀请码或续期码」**。

### 5. 让发布的安装包带上托管服务网址

GitHub 仓库 → **Settings → Secrets and variables → Actions → Variables → New repository variable**：名字 `HUB_URL`，值 `https://example.com`。之后运行「发布新版本」就会多出两个托管版安装包：

- `openwrt-claude-panel-hosted-ai.tar.gz`（AI 版 · 托管版）
- `openwrt-claude-panel-hosted-noai.tar.gz`（纯面板版 · 托管版）

## 官网和账号

部署后，主域名就是官网：

| 网址 | 内容 |
|---|---|
| `https://example.com/` | 官网首页（介绍、下载、教程） |
| `https://example.com/app` | 用户账号：邮箱 + 密码登录，「我的路由器」列表，输入配对码绑定 |
| `https://example.com/admin` | 你的管理后台（4.0 新版，用 ADMIN_KEY 登录），按区分类：工作台统计、实时对话、问题反馈、公告、路由器、账号、续期申请、邀请码、续期码、访问统计、登录记录、操作记录、邮件记录、出错记录、设置。手机和电脑都能用 |
| `https://example.com/admin/old` | 4.0 以前的单页管理页（功能一样，留着备用） |

- **账号只记录「谁有哪几台路由器」**，不保存任何路由器的登录密钥（云端备份另算，见上面）。账号里点「打开面板」会跳到那台路由器的专属网址；第一次在新手机上打开，要用已经能用的手机在面板里「添加新手机」扫码授权。
- 路由器面板「系统操作 → 绑定到账号」会显示 8 位配对码（10 分钟有效），在官网账号里输入就绑定了。面板里也能看到、移除绑定了这台路由器的账号。
- 密码用 PBKDF2（10 万轮）加盐保存；同一账号 15 分钟内输错 10 次锁定；改密码会让其他设备上的登录全部退出。
- 只接受本站页面发来的请求（防跨站），登录 Cookie 是 HttpOnly + Secure + SameSite=Lax，并且只属于主域名，路由器的子域名读不到。

### 邮件（注册验证码、找回密码，可选）

不设置邮件的话，注册不需要验证码，忘记密码只能找你重置。要开启：

1. 注册 [Resend](https://resend.com)（免费每月 3000 封），在 **Domains** 里添加 `example.com`，按提示在 Cloudflare 加几条 DNS 记录完成验证
2. 在 Resend 创建 API Key
3. 设置：

```sh
npx wrangler secret put RESEND_API_KEY -c wrangler.hosted.toml
```

发件地址默认是 `noreply@example.com`，想换的话在 `wrangler.hosted.toml` 的 `[vars]` 里加 `MAIL_FROM = "你想要的地址"`。

**每天的邮件上限（6.0）：**Resend 免费版每天最多 100 封。快用到八成时、用满时，管理后台会推送提醒你，「邮件记录」页最上面能看到今天发了多少。用满以后（以 Resend 的回复为准），注册、找回密码、新设备登录、确认本人这些要收验证码的操作当天先停，用户看到「明天再试」（提示里不说具体额度，也不会跳过验证）；报告问题、面板反馈、续期申请照常收，只是不发确认邮件。第二天自动恢复。升级了 Resend 套餐的话，在 `[vars]` 里加 `MAIL_DAILY = "每天的封数"`，提前提醒就按这个数算。

**新申请提醒：**在 GitHub 仓库 **Settings → Secrets and variables → Actions → Variables** 加 `ADMIN_EMAIL` = 你的邮箱，再部署一次。以后有人提交续期申请就会发邮件给你。设好后在管理后台「设置与工具」里点「**发测试邮件**」（或者 **Actions → 发测试邮件**），确认能收到；发不出去的话会显示邮件服务给的原因。

## 人机验证（可选，6.0）

在 Cloudflare 控制台 **Turnstile** 里给你的主域名建一个验证组件，GitHub 仓库 Variables 加 `TURNSTILE_SITE`（站点密钥）、Secrets 加 `TURNSTILE_SECRET`（私密密钥），再部署一次。之后同一来源短时间试太多次时，注册、登录、发验证码、找回密码、报告问题会先要求人机验证；管理后台「设置 → 防攻击」里能一键开「受攻击模式」（24 小时自动关，路由器接口不受影响）。不设置也能用，只是没有人机验证。

## 安卓 App

- 官网首页有「下载安卓 App」，地址是 `https://example.com/app/router-panel.apk`：托管服务从 GitHub 最新 Release 转过来，**大陆用户走你的域名下载，不用访问 GitHub**（仓库公开后才能下载）。
- App 打开时会问 `https://example.com/api/app/version` 有没有新版本。**只有 App 自己的代码改了才提示，而且必须更新**；只是路由器那边更新时 App 不弹窗。发布时会自动比较：App 的代码（`android/app` 和 gradle 设置）从上次发布到现在没改，Release 里的 `app-version.json` 就沿用 App 上次改动时的版本号。
- 发布新版本时，「发布新版本」会顺便打包 App 并签名，传到 Release 里，文件名 `router-panel.apk`。

### 签名密码（只需设置一次）

App 的签名密钥已经加密放在仓库里（`android/signing/router-panel.jks.enc`），解开它需要一个密码。在 GitHub 仓库 **Settings → Secrets and variables → Actions → Secrets → New repository secret**：名字 `ANDROID_SIGNING_PASS`，值是那串密码。

⚠️ 这个密码和密钥文件要另外备份好。安卓只允许同一个签名的新版本覆盖旧版，丢了以后发布的新版本，大家只能卸载重装。

## 管理接口

都要带 `Authorization: Bearer 你的ADMIN_KEY`：

| 请求 | 作用 |
|---|---|
| `GET /api/admin/overview` | 工作台：路由器、账号、反馈、对话、登录、近 30 天统计 |
| `GET /api/admin/stats?days=30` / `GET /api/admin/visitors?day=YYYY-MM-DD` | 每天的访问次数、访客数、各项计数；某一天的访客 IP |
| `GET /api/admin/logins` / `log` / `mails` / `errors` | 登录记录（带 IP）、操作记录、邮件记录、出错记录 |
| `GET /api/admin/chat` / `GET /api/admin/chat/{对话}?read=1` / `POST /api/admin/chat/{对话}` | 实时对话：列表、看消息、回复（`{"text","img"}`） |
| `GET/POST/DELETE /api/admin/ann[/{编号}]` | 公告：列表、发布 / 修改、删除 |
| `GET /api/admin/devices` | 所有路由器、已用名额、排队人数 |
| `POST /api/admin/max` | 改名额上限（`{"max": 1–1000}`），改大后马上给排队的人发邮件 |
| `GET /api/admin/wait` | 排队的邮箱 |
| `POST /api/admin/devices/{子域名}/off` | 封禁（网址立刻打不开） |
| `POST /api/admin/devices/{子域名}/on` | 解封 |
| `POST /api/admin/devices/{子域名}/delete` | 删除（回收隧道和子域名） |
| `GET /api/admin/invites` | 所有邀请码 |
| `POST /api/admin/invites` | 新建邀请码 `{max, days, svc, note}`（`svc`：开通后试用几天，0 = 不限期） |
| `DELETE /api/admin/invites/{邀请码}` | 作废邀请码 |
| `GET /api/admin/renewals` | 所有续期码（用过的会写给哪台用了） |
| `POST /api/admin/renewals` | 新建续期码 `{days, count, note}` |
| `DELETE /api/admin/renewals/{续期码}` | 作废续期码 |
| `POST /api/admin/cleanup` | 立刻清理 90 天没上线的 |

## 费用

- 隧道：每个账号 1000 条以内免费
- Worker 和 Durable Objects：路由器每分钟发一次心跳；一切正常时，心跳最多每 3 分钟交给 Durable Object 一次（每叫醒一次大约按 10 秒计费），状态一变马上交。免费额度大约够 20 台，再多需要 Workers 付费版（每月 5 美元起）。在 Cloudflare 后台「Workers 和 Pages」「Durable Objects」里能看到用量
