# 完整版云端（Cloudflare Worker）

这个 Worker 给完整版提供：

- **断电 / 断网判断**：路由器每分钟发一次心跳，Cloudflare 每分钟探测一次隧道；路由器离线时，面板仍然能从云端读到「什么时候、因为什么」断的。
- **手机推送 / 微信推送**：断电、断网、隧道断开、OpenClash 停止、DNS 故障、节点自动切换、每日体检……都会推送到手机（浏览器 Web Push）或微信（[PushPlus](https://www.pushplus.plus/)）。
- **云端备份**：每天 4:07 自动备份路由器配置（和 LuCI「备份/升级」导出的格式相同），保留最近 10 份，面板里可下载、可一键恢复。

全部在 Cloudflare 免费额度内即可运行（Workers + Durable Objects，SQLite 存储）。

## 前提

- Cloudflare 账号，以及一个**托管在 Cloudflare 上的域名**（例如 `example.com`）
- 面板已经通过**命名隧道**挂在这个域名下（例如 `router.example.com`），见主 README
- 电脑上装好 Node.js 18+

## 步骤

### 1. 在路由器上装完整版

```sh
sh install.sh --full
```

结束时会打印三个值，记下来：

```
PANEL_TOKEN = ...
RKEY        = ...
TKEY        = ...
```

（以后想再看：`PANEL_TOKEN` 在 `/etc/claude-mcp/config.json` 的 `token`，`RKEY` / `TKEY` 在 `/etc/claude-mcp/cloud.conf`。）

### 2. 改配置

编辑 `cloud/wrangler.toml`，把 `router.example.com`、`example.com` 换成你自己的面板域名和主域名，`VAPID_SUB` 填你的邮箱。

### 3. 部署

```sh
cd cloud
npx wrangler login
npx wrangler deploy

# 设置密钥（每条命令会提示你粘贴值）
npx wrangler secret put PANEL_TOKEN
npx wrangler secret put RKEY
npx wrangler secret put TKEY

# 生成 Web Push 密钥，再把输出的两个值分别设进去
node gen-vapid.mjs
npx wrangler secret put VAPID_PRIV     # 粘贴 {"kty":"EC",...} 那一整段
npx wrangler secret put VAPID_PUB      # 粘贴 B 开头的那一串
```

### 4. 检查

- 浏览器打开 `https://router.example.com/cloud/push/key`，能看到 `{"key":"B..."}` 就说明路由挂对了。
- 打开面板 →「断线记录」页：「云端监测」里「路由器报告」变成几秒前、「隧道探测」显示正常。
- 「手机通知」卡片里点「开启通知」，再点「发一条测试」。
- 「云端备份」页点「立即备份」。

## 平板（证人）—— 可选

在家里放一台**不连这台路由器**的旧手机/平板（连光猫或另一台路由器），每分钟访问一次面板「断线记录 → 平板设置方法」里给出的网址。这样路由器失联时，云端就能分清：

- 路由器没报告、平板还在报告 → **路由器断电或死机**
- 两个都没报告 → **家里宽带断了**

## 接口一览

| 路径 | 用途 | 鉴权 |
|---|---|---|
| `POST /cloud/beat/r/{RKEY}` | 路由器心跳 | RKEY |
| `GET /cloud/beat/t/{TKEY}` | 平板心跳 | TKEY |
| `POST /cloud/n/{RKEY}` | 路由器发通知 | RKEY |
| `/cloud/bk/{RKEY}[/{id}]` | 云端备份：上传 / 列表 / 下载 / 删除 | RKEY |
| `POST /cloud/s` | 面板读取云端状态 | PANEL_TOKEN |
| `POST /cloud/push` | 面板管理推送订阅、微信推送 | PANEL_TOKEN |
| `GET /cloud/push/key` | VAPID 公钥 | 公开 |

## 测试

```sh
node test/test_push.mjs
node test/test_bk.mjs
```
