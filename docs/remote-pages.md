# 在外面打开路由器上的其他页面（自建版）

OpenClash 控制面板、AdGuard Home、网页终端这类页面不在面板的端口上，在外面要另外开一个地址才能打开。

- **托管版**：面板「工具 → 远程页面」点「打开」就行，不用看这篇。
- **本地版**：连着家里 Wi-Fi 时在「远程页面」里直接打开。
- **自建版**：隧道和域名在你自己的 Cloudflare 账号里，面板改不了，按下面的步骤加一次。

> **一定要做第 2 步（加访问限制）。** 不加的话，知道地址的人都能打开这些页面，网页终端就是路由器的最高权限。

## 1. 给隧道加一个地址

1. 打开 Cloudflare 控制台 → **Zero Trust → Networks → Tunnels**，点你装面板时建的那条隧道 → **Edit**。
2. 到 **Public Hostname**，点 **Add a public hostname**：
   - Subdomain：随便起一个，比如 `router-x`（不要跟面板的地址一样）
   - Domain：选你的域名
   - Service：选 **HTTP**，URL 填 `127.0.0.1:端口`（端口在面板「远程页面」里能看到，比如 AdGuard Home 是 `127.0.0.1:3000`）
   - 网页终端开了 https 的，Service 选 **HTTPS**，并在 **Additional application settings → TLS** 里打开 **No TLS Verify**
3. 保存。以后想换成别的页面，改这里的端口就行。

## 2. 加访问限制（必须）

1. Zero Trust → **Access → Applications → Add an application → Self-hosted**。
2. Application domain 填第 1 步的地址（比如 `router-x.你的域名`）。
3. 加一条 Policy：Action 选 **Allow**，Include 选 **Emails**，填你自己的邮箱。
4. 保存。之后打开这个地址，Cloudflare 会先发验证码到你的邮箱，验证过才能进。

Cloudflare Zero Trust 免费版最多 50 个用户，自己家用足够。

## 3. 打开

- OpenClash / Nikki 控制面板：打开 `https://router-x.你的域名/ui/`，控制面板里「后端地址」填 `router-x.你的域名`，端口填 `443`，密钥填 OpenClash 设置里的「管理页面登录密钥」。
- 其他页面：直接打开 `https://router-x.你的域名/`。
