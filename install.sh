#!/bin/sh
# openwrt-claude-panel 安装脚本（在路由器上以 root 运行）
#
#   sh install.sh            按安装包的版本安装（从源码目录运行时会问你装哪个版本）
#
# 一共四个版本 = 「AI 版 / 纯面板版」 ×「精简版 / 完整版」：
#   --ai         AI 版：可以在 Claude 里用对话管理路由器，也带手机面板
#   --no-ai      纯面板版：只有手机面板，自己动手管理，不接 AI
#   --lite       精简版：手机面板 + 本地看门狗（不需要 Cloudflare 账号）
#   --full       完整版：再加 Cloudflare 云端（手机/微信推送、云端备份、断电断网判断）
#
# 托管版（用别人提供的托管服务，自动拿到专属网址，不用自己弄 Cloudflare）：
#   --hub https://托管服务网址   托管安装包里已经写好，一般不用填
#   --invite 邀请码              找提供托管服务的人要
#
# 其他可选参数（不填就交互询问）：
#   --domain router.example.com    面板域名（用 Cloudflare 命名隧道时填）
#   --tunnel-token <token>         Cloudflare 隧道 token（留空 = 临时隧道，地址每次重启都会变）
#   --cloud-url https://router.example.com/cloud   完整版：云端地址
#   --yes                          不询问，全部用默认值 / 参数
#
# 重复运行 = 升级：代码会覆盖，已有的密钥和设置会保留。
set -e

SRC=$(cd "$(dirname "$0")" && pwd)/src
WWW=/www-claude-mcp
D=/etc/claude-mcp
ED=""; AI=""; DOMAIN=""; TTOK=""; CURL_=""; YES=0; HUB=""; INV=""

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m ✗ %s\033[0m\n' "$*"; exit 1; }
ask()  { # ask 变量名 提示 默认值 [必填]
	local v n=0
	if [ "$YES" = 1 ]; then eval "$1=\"\$3\""; return; fi
	# 粘贴安装命令时，末尾多出来的回车会留在输入里，被当成「直接按了回车」：提问前先清掉
	while IFS= read -r -t 0.2 v 2>/dev/null </dev/tty; do :; done
	while :; do
		printf '%s' "$2"; [ -n "$3" ] && printf ' [%s]' "$3"; printf '：'
		v=""; read -r v </dev/tty || v=""
		[ -z "$v" ] && v="$3"
		{ [ -n "$v" ] || [ -z "$4" ]; } && break
		n=$((n+1)); [ $n -ge 3 ] && break
		warn "这一项不能空着，请再输入一次"
	done
	eval "$1=\"\$v\""
}
rnd() { tr -dc 'a-z0-9' </dev/urandom 2>/dev/null | head -c "${1:-40}"; }

while [ $# -gt 0 ]; do
	case "$1" in
		--lite) ED=lite ;;
		--full) ED=full ;;
		--ai) AI=1 ;;
		--no-ai|--panel-only) AI=0 ;;
		--domain) DOMAIN=$2; shift ;;
		--tunnel-token) TTOK=$2; shift ;;
		--cloud-url) CURL_=$2; shift ;;
		--hub) HUB=$2; shift ;;
		--invite) INV=$2; shift ;;
		--yes|-y) YES=1 ;;
		-h|--help) sed -n '2,25p' "$0"; exit 0 ;;
		*) die "不认识的参数：$1" ;;
	esac
	shift
done

[ "$(id -u)" = 0 ] || die "请用 root 运行"
[ -f /etc/openwrt_release ] || die "这不是 OpenWrt 系统"
[ -f "$SRC/www/cgi-bin/mcp" ] || die "找不到 $SRC，请在解压后的目录里运行 install.sh"

UPGRADE=0
[ -s "$D/config.json" ] && UPGRADE=1

# ---------- 选版本 ----------
# 发布的安装包里有 EDITION 文件，写着这个包是哪个版本；参数可以覆盖它
PKG_AI=""; PKG_ED=""; PKG_HUB=""
[ -f "$SRC/../EDITION" ] && . "$SRC/../EDITION"
[ -n "$AI" ] || AI=$PKG_AI
[ -n "$ED" ] || ED=$PKG_ED
[ -n "$HUB" ] || HUB=$PKG_HUB
[ -z "$HUB" ] && [ -s "$D/hub.conf" ] && HUB=$(sed -n 's/^HUB=//p' "$D/hub.conf")
HUB=${HUB%/}
if [ -n "$HUB" ]; then
	case "$HUB" in https://*) ;; *) die "托管服务网址应该是 https:// 开头" ;; esac
	ED=full   # 托管版自带云端（推送、云端备份、断电断网判断）
fi
if [ -z "$AI" ]; then
	def=1; [ $UPGRADE = 1 ] && grep -q '"ai": *false' "$D/config.json" && def=2
	echo
	echo "  1) AI 版：可以在 Claude 里用对话管理路由器，也带手机面板"
	echo "  2) 纯面板版：只有手机面板，自己动手管理，不接 AI"
	ask n "选择 1 或 2" "$def"
	case "$n" in 2) AI=0 ;; *) AI=1 ;; esac
fi
if [ -z "$ED" ]; then
	if [ -s "$D/cloud.conf" ]; then def=2; else def=1; fi
	echo
	echo "  1) 精简版：手机面板 + 本地看门狗（不需要 Cloudflare 账号）"
	echo "  2) 完整版：再加 Cloudflare 云端（手机/微信推送、云端备份、断电断网判断，需要先部署 Worker）"
	ask n "选择版本 1 或 2" "$def"
	case "$n" in 2) ED=full ;; *) ED=lite ;; esac
fi
[ "$ED" = full ] && [ ! -f "$SRC/bin/cmcp-backup" ] && die "这个安装包是精简版，装完整版请下载 full 包"
NAME="$( [ "$AI" = 1 ] && echo AI版 || echo 纯面板版 )·$( [ -n "$HUB" ] && echo 托管版 || { [ "$ED" = full ] && echo 完整版 || echo 精简版; } )"
say "安装 $NAME$( [ $UPGRADE = 1 ] && echo '（升级，保留现有设置）' )"

# ---------- 依赖 ----------
need=""
have_pkg() { [ -n "$(command -v "$1")" ]; }
[ -x /usr/bin/ucode ] || need="$need ucode"
[ -f /usr/lib/ucode/fs.so ] || need="$need ucode-mod-fs"
[ -f /usr/lib/ucode/uci.so ] || need="$need ucode-mod-uci"
[ -x /usr/sbin/uhttpd ] || need="$need uhttpd"
have_pkg curl || need="$need curl"
have_pkg cloudflared || need="$need cloudflared"
if [ -n "$need" ]; then
	say "安装依赖：$need"
	if have_pkg apk; then apk update >/dev/null && apk add $need || die "依赖安装失败：$need"
	elif have_pkg opkg; then opkg update >/dev/null && opkg install $need || die "依赖安装失败：$need（cloudflared 不在软件源里的话，请先手动安装）"
	else die "没有找到 opkg / apk，请手动安装：$need"; fi
fi
ok "依赖齐全"

# ---------- 复制文件 ----------
say "复制文件"
mkdir -p $WWW/cgi-bin $WWW/panel/sc2 $D /usr/share/ucode/cmcp /etc/hotplug.d/ntp
cp -f "$SRC/www/cgi-bin/mcp" $WWW/cgi-bin/mcp.new && chmod 755 $WWW/cgi-bin/mcp.new && mv -f $WWW/cgi-bin/mcp.new $WWW/cgi-bin/mcp
cp -f "$SRC"/www/panel/*.* $WWW/panel/
cp -f "$SRC"/www/panel/sc2/* $WWW/panel/sc2/
cp -f "$SRC/lib/lib.uc" /usr/share/ucode/cmcp/lib.uc
for f in "$SRC"/bin/cmcp-*; do cp -f "$f" /usr/sbin/; chmod 755 "/usr/sbin/${f##*/}"; done
cp -f "$SRC/init.d/claude-mcp" "$SRC/init.d/cmcp-watchdog" /etc/init.d/
chmod 755 /etc/init.d/claude-mcp /etc/init.d/cmcp-watchdog
cp -f "$SRC/hotplug/90-cmcp-synced" /etc/hotplug.d/ntp/
cp -f "$SRC/etc/luci-gate" "$SRC/etc/oc_cbi.lua" "$SRC/etc/oc_line.lua" $D/
chmod 755 $D/luci-gate
for n in cgi-backup cgi-download cgi-exec cgi-upload luci; do ln -sf $D/luci-gate $WWW/cgi-bin/$n; done
[ -e $WWW/luci-static ] || [ -L $WWW/luci-static ] || ln -s /www/luci-static $WWW/luci-static
ok "文件已就位"

# ---------- 密钥（已有的保留） ----------
say "生成密钥"
umask 077
if [ ! -s $D/config.json ]; then
	TOKEN=$(rnd 40)
	printf '{ "token": "%s" }\n' "$TOKEN" > $D/config.json
else
	TOKEN=$(jsonfilter -i $D/config.json -e '@.token')
fi
[ ${#TOKEN} -ge 16 ] || die "config.json 里的 token 不对"
# AI 开关：纯面板版在 config.json 里写 "ai": false，连接器只接受手机面板的请求
ucode -e 'let fs = require("fs"), f = ARGV[0], c = json(fs.readfile(f)); if (ARGV[1] == "0") c.ai = false; else delete c.ai; fs.writefile(f, sprintf("%.J\n", c));' $D/config.json "$AI" \
	|| die "写入 config.json 失败"
[ -s $D/luci_key ] || rnd 32 > $D/luci_key
if [ ! -s $D/luci_pass ]; then rnd 32 > $D/luci_pass; NEWPASS=1; fi
# 面板打开 LuCI 原版页面用的专用账号（只给面板内部自动登录用）
if ! uci -q show rpcd | grep -q "username='cmcp'" || [ "$NEWPASS" = 1 ]; then
	sec=$(uci -q show rpcd | sed -n "s/^rpcd\.\(@login\[[0-9]*\]\)\.username='cmcp'$/\1/p" | head -n1)
	[ -n "$sec" ] || sec=$(uci add rpcd login)
	uci set rpcd.$sec.username=cmcp
	uci set rpcd.$sec.password="$(uhttpd -m "$(cat $D/luci_pass)")"
	uci -q delete rpcd.$sec.read || true; uci -q delete rpcd.$sec.write || true
	uci add_list rpcd.$sec.read='*'; uci add_list rpcd.$sec.write='*'
	uci commit rpcd
	/etc/init.d/rpcd reload >/dev/null 2>&1 || true
fi
umask 022
ok "密钥已就绪"

# ---------- 托管版：用邀请码开通专属网址（隧道、子域名、云端钥匙都由托管服务自动分配） ----------
if [ -n "$HUB" ]; then
	if [ -s $D/hub.conf ] && grep -q '^PKEY=' $D/cloud.conf 2>/dev/null; then
		ok "已经开通过托管服务，保留现在的网址"
	else
		nm=$(uci -q get system.@system[0].hostname 2>/dev/null | tr -cd 'A-Za-z0-9._-' | cut -c1-40 || true)
		md=$(cat /tmp/sysinfo/model 2>/dev/null | tr -cd 'A-Za-z0-9 ._()-' | cut -c1-60 || true)
		jf() { jsonfilter -s "$R" -e "@.$1" 2>/dev/null || true; }
		SUB=""; try=0
		while [ -z "$SUB" ]; do
			try=$((try+1))
			[ -n "$INV" ] || ask INV "邀请码（找提供托管服务的人要）" "" 1
			inv=$(printf '%s' "$INV" | tr -cd 'A-Za-z0-9')
			[ -n "$inv" ] || die "托管版需要邀请码。拿到邀请码后，在这个目录重新运行：sh install.sh --invite 邀请码"
			say "向托管服务申请专属网址"
			R=$(curl -s -m 90 -X POST -H 'Content-Type: application/json' -d "{\"invite\":\"$inv\",\"name\":\"$nm\",\"model\":\"$md\"}" "$HUB/api/register" || true)
			SUB=$(jf sub)
			[ -n "$SUB" ] && break
			e=$(jf error)
			# 邀请码输错了（或者过期、用完）：一共给三次机会
			case "$e" in 邀请码*) if [ "$YES" != 1 ] && [ $try -lt 3 ]; then warn "$e，请检查后再输入一次"; INV=""; continue; fi ;; esac
			die "开通失败：${e:-连不上托管服务 $HUB}"
		done
		HOST=$(jf host)
		(umask 077
		 printf '%s' "$(jf token)" > $D/tunnel_token
		 printf 'URL=%s\nRKEY=%s\nTKEY=%s\nPKEY=%s\n' "$(jf url)" "$(jf rkey)" "$(jf tkey)" "$(jf pkey)" > $D/cloud.conf
		 printf 'HUB=%s\nSUB=%s\n' "$HUB" "$SUB" > $D/hub.conf)
		printf '%s\n' "$HOST" > $D/hostname
		ok "开通成功：https://$HOST"
	fi
fi

# ---------- 隧道 ----------
if [ -z "$HUB" ] && { [ $UPGRADE = 0 ] || [ -n "$DOMAIN$TTOK" ]; }; then
	echo
	echo "  Claude 要通过公网 HTTPS 访问路由器，这里用 Cloudflare 隧道（不用开端口、不用公网 IP）。"
	echo "  · 有自己的域名：在 Cloudflare Zero Trust 建一条隧道，把 域名 → http://127.0.0.1:18765，然后把隧道 token 填进来"
	echo "  · 没有域名：直接回车，用临时隧道（xxx.trycloudflare.com，地址每次重启都会变）"
	[ -n "$TTOK" ] || ask TTOK "隧道 token（可留空）" "$(cat $D/tunnel_token 2>/dev/null)"
	if [ -n "$TTOK" ]; then
		[ -n "$DOMAIN" ] || ask DOMAIN "这条隧道对应的域名（例如 router.example.com）" "$(cat $D/hostname 2>/dev/null)"
		[ -n "$DOMAIN" ] || die "用命名隧道时必须填域名"
		(umask 077; printf '%s' "$TTOK" > $D/tunnel_token)
		printf '%s\n' "$DOMAIN" > $D/hostname
	else
		rm -f $D/tunnel_token $D/hostname
	fi
fi
DOMAIN=$(cat $D/hostname 2>/dev/null || true)

# ---------- 完整版：云端 ----------
if [ "$ED" = full ] && [ -z "$HUB" ]; then
	[ ! -s $D/cloud.conf ] && [ -s $D/cloud.conf.off ] && mv -f $D/cloud.conf.off $D/cloud.conf
	if [ ! -s $D/cloud.conf ] || [ -n "$CURL_" ]; then
		[ -n "$CURL_" ] || ask CURL_ "云端地址" "${DOMAIN:+https://$DOMAIN/cloud}"
		case "$CURL_" in https://*/cloud) ;; *) die "云端地址应该像 https://router.example.com/cloud" ;; esac
		[ -z "$DOMAIN" ] && warn "临时隧道的域名会变，面板读不到 /cloud/；完整版建议用自己的域名"
		RKEY=$(sed -n 's/^RKEY=//p' $D/cloud.conf 2>/dev/null || true); [ -n "$RKEY" ] || RKEY=$(rnd 32)
		TKEY=$(sed -n 's/^TKEY=//p' $D/cloud.conf 2>/dev/null || true); [ -n "$TKEY" ] || TKEY=$(rnd 32)
		(umask 077; printf 'URL=%s\nRKEY=%s\nTKEY=%s\n' "$CURL_" "$RKEY" "$TKEY" > $D/cloud.conf)
	fi
fi
[ "$ED" = full ] && . $D/cloud.conf

# ---------- 定时任务 ----------
CR=/etc/crontabs/root
touch $CR
sed -i '/\/usr\/sbin\/cmcp-backup\|\/usr\/sbin\/cmcp-daily\|\/usr\/sbin\/cmcp-route/d' $CR
echo '0 9 * * * /usr/sbin/cmcp-daily >/dev/null 2>&1' >> $CR
# 面板走直连还是走代理，自动选能打开的那条
echo '*/3 * * * * /usr/sbin/cmcp-route >/dev/null 2>&1' >> $CR
[ "$ED" = full ] && echo '7 4 * * * /usr/sbin/cmcp-backup auto >/dev/null 2>&1' >> $CR
/etc/init.d/cron enable >/dev/null 2>&1 || true
/etc/init.d/cron restart >/dev/null 2>&1 || true

# ---------- 升级系统时保留 ----------
for p in /etc/claude-mcp/ /www-claude-mcp/ /usr/share/ucode/cmcp/ /etc/init.d/claude-mcp /etc/init.d/cmcp-watchdog /etc/hotplug.d/ntp/90-cmcp-synced \
	/usr/sbin/cmcp-autosw /usr/sbin/cmcp-backup /usr/sbin/cmcp-daily /usr/sbin/cmcp-notify /usr/sbin/cmcp-pair /usr/sbin/cmcp-pause /usr/sbin/cmcp-route /usr/sbin/cmcp-traffic /usr/sbin/cmcp-watchdog; do
	grep -qxF "$p" /etc/sysupgrade.conf 2>/dev/null || echo "$p" >> /etc/sysupgrade.conf
done
[ "$ED" = lite ] && [ -f $D/cloud.conf ] && mv -f $D/cloud.conf $D/cloud.conf.off  # 换回精简版：云端设置先停用，重装完整版时会自动恢复

# ---------- 启动 ----------
say "启动服务"
/etc/init.d/claude-mcp enable
/etc/init.d/claude-mcp restart
/etc/init.d/cmcp-watchdog enable
/etc/init.d/cmcp-watchdog restart
# 换了网址（比如自建版换成托管版）后，OpenClash 规则集里的面板域名也要跟着更新
/usr/sbin/cmcp-route --init >/dev/null 2>&1 || true
sleep 3
code=$(curl -s -m 6 -o /dev/null -w '%{http_code}' http://127.0.0.1:18765/panel/manifest.json || true)
[ "$code" = 200 ] && ok "面板服务已运行" || warn "面板服务没响应（HTTP $code），看看 logread | grep uhttpd"

if [ -z "$DOMAIN" ]; then
	say "等待临时隧道地址（最多 30 秒）"
	i=0
	while [ $i -lt 30 ]; do
		DOMAIN=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/claude-mcp-tunnel.log 2>/dev/null | head -n1 | sed 's#https://##')
		[ -n "$DOMAIN" ] && break
		sleep 1; i=$((i + 1))
	done
	[ -n "$DOMAIN" ] || warn "还没拿到临时隧道地址，稍后运行：grep trycloudflare /tmp/claude-mcp-tunnel.log"
fi

H=${DOMAIN:-<你的隧道域名>}
echo
echo "================ 安装完成 ================"
echo
echo "已安装：$NAME"
echo
echo "手机面板：https://$H/panel/"
echo
echo "登录地址（第一次打开面板时粘贴）："
echo "  https://$H/cgi-bin/mcp/$TOKEN"
echo
echo "或者在手机上直接打开这个链接，自动登录（同样不要发给别人）："
echo "  https://$H/panel/#login=$TOKEN"
echo "以后添加别的手机：面板里「系统操作 → 添加新手机」扫码就行。"
if [ "$AI" = 1 ]; then
	echo
	echo "这个登录地址同时也是 Claude 连接器地址：在 Claude 设置 → 连接器 → 添加自定义连接器 里填它。"
fi
echo
echo "⚠️  登录地址里带着密钥，谁拿到都能完全控制你的路由器：不要发给别人，也不要截图分享。"
if [ -n "$HUB" ]; then
	echo
	echo "托管版：推送、云端备份、断电断网判断都已经开通，不用再做别的设置。"
	echo
	/usr/sbin/cmcp-pair --install || echo "绑定到官网账号：面板里「系统操作 → 绑定到账号」，或者在终端运行 cmcp-pair 拿配对码。"
elif [ "$ED" = full ]; then
	echo
	echo "---------- 完整版：把下面 3 个值设成 Worker 的密钥（见 cloud/README.md） ----------"
	echo "  PANEL_TOKEN = $TOKEN"
	echo "  RKEY        = $RKEY"
	echo "  TKEY        = $TKEY"
fi
echo
echo "卸载：sh uninstall.sh"
