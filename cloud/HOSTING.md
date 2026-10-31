# 托管服务（给别人开通专属网址）

托管服务让别人装上路由器面板后，**只要输入邀请码**，就自动得到一个专属网址（`https://随机8位.你的域名`），在家在外都能用，推送、云端备份、断电断网判断全都有，他们不用注册 Cloudflare、不用买域名。

## 安全设计

- **登录密钥只在用户自己的路由器和手机上生成、保存**，托管服务从来拿不到，所以托管服务**进不了**任何人的路由器。
- 托管服务只发三把「云端钥匙」，只能读写那台路由器自己的云端数据（心跳、推送、备份），每台互相隔离。
- 网址随机分配，用户不能指定；删除只能由那台路由器自己（凭钥匙）或管理员操作。
- Cloudflare API 令牌只存在 Worker 的密钥里，不会发给任何路由器。
- 邀请码控制谁能开通；同一个 IP 每小时最多开通 5 台、全站每小时最多 60 台；名额有上限。
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

### 3. 改配置并部署

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

打开 `https://example.com/api/ping`，看到 `{"ok":true,...}` 就部署好了。

### 4. 发邀请码

```sh
curl -X POST https://example.com/api/admin/invites \
  -H "Authorization: Bearer 你的ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"max": 5, "days": 30, "note": "给朋友"}'
```

`max` 是这个码能开通几台，`days` 是几天后过期（0 = 不过期）。

### 5. 让发布的安装包带上托管服务网址

GitHub 仓库 → **Settings → Secrets and variables → Actions → Variables → New repository variable**：名字 `HUB_URL`，值 `https://example.com`。之后运行「发布新版本」就会多出两个托管版安装包：

- `openwrt-claude-panel-hosted-ai.tar.gz`（AI 版 · 托管版）
- `openwrt-claude-panel-hosted-noai.tar.gz`（纯面板版 · 托管版）

## 管理接口

都要带 `Authorization: Bearer 你的ADMIN_KEY`：

| 请求 | 作用 |
|---|---|
| `GET /api/admin/devices` | 所有路由器、已用名额 |
| `POST /api/admin/devices/{子域名}/off` | 封禁（网址立刻打不开） |
| `POST /api/admin/devices/{子域名}/on` | 解封 |
| `POST /api/admin/devices/{子域名}/delete` | 删除（回收隧道和子域名） |
| `GET /api/admin/invites` | 所有邀请码 |
| `POST /api/admin/invites` | 新建邀请码 `{max, days, note}` |
| `DELETE /api/admin/invites/{邀请码}` | 作废邀请码 |
| `POST /api/admin/cleanup` | 立刻清理 90 天没上线的 |

## 费用

- 隧道：每个账号 1000 条以内免费
- Worker 和 Durable Objects：每台路由器每分钟一次心跳和一次探测。免费额度大约够 20–30 台，再多需要 Workers 付费版（每月 5 美元起）
