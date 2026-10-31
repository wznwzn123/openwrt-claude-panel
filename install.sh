#!/bin/sh
# openwrt-claude-panel 安装脚本（在路由器上以 root 运行）
#
#   sh install.sh            交互安装（会问你装哪个版本）
#   sh install.sh --lite     精简版：Claude 连接器 + 手机面板 + 本地看门狗
#   sh install.sh --full     完整版：再加 Cloudflare 云端（手机/微信推送、云端备份、断电断网判断）
#
# 可选参数（不填就交互询问）：
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
ED=""; DOMAIN=""; TTOK=""; CURL_=""; YES=0

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m ✗ %s\033[0m\n' "$*"; exit 1; }
ask()  { # ask 变量名 提示 默认值
	local v
	if [ "$YES" = 1 ]; then eval "$1=\"\$3\""; return; fi
	printf '%s' "$2"; [ -n "$3" ] && printf ' [%s]' "$3"; printf '：'
	read -r v </dev/tty || v=""
	[ -z "$v" ] && v="$3"
	eval "$1=\"\$v\""
}
rnd() { tr -dc 'a-z0-9' </dev/urandom 2>/dev/null | head -c "${1:-40}"; }

while [ $# -gt 0 ]; do
	case "$1" in
		--lite) ED=lite ;;
		--full) ED=full ;;
		--domain) DOMAIN=$2; shift ;;
		--tunnel-token) TTOK=$2; shift ;;
		--cloud-url) CURL_=$2; shift ;;
		--yes|-y) YES=1 ;;
		-h|--help) sed -n '2,16p' "$0"; exit 0 ;;
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
if [ -z "$ED" ]; then
	if [ -s "$D/cloud.conf" ]; then def=2; else def=1; fi
	echo
	echo "  1) 精简版：Claude 连接器 + 手机面板 + 本地看门狗（不需要 Cloudflare 账号）"
	echo "  2) 完整版：再加 Cloudflare 云端（手机/微信推送、云端备份、断电断网判断，需要先部署 Worker）"
	ask n "选择版本 1 或 2" "$def"
	case "$n" in 2) ED=full ;; *) ED=lite ;; esac
fi
[ "$ED" = full ] && [ ! -f "$SRC/bin/cmcp-backup" ] && die "这个安装包是精简版，装完整版请下载 full 包"
say "安装 $( [ "$ED" = full ] && echo 完整版 || echo 精简版 )$( [ $UPGRADE = 1 ] && echo '（升级，保留现有设置）' )"

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

# ---------- 隧道 ----------
if [ $UPGRADE = 0 ] || [ -n "$DOMAIN$TTOK" ]; then
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
if [ "$ED" = full ]; then
	[ ! -s $D/cloud.conf ] && [ -s $D/cloud.conf.off ] && mv -f $D/cloud.conf.off $D/cloud.conf
	if [ ! -s $D/cloud.conf ] || [ -n "$CURL_" ]; then
		[ -n "$CURL_" ] || ask CURL_ "云端地址" "${DOMAIN:+https://$DOMAIN/cloud}"
		case "$CURL_" in https://*/cloud) ;; *) die "云端地址应该像 https://router.example.com/cloud" ;; esac
		[ -z "$DOMAIN" ] && warn "临时隧道的域名会变，面板读不到 /cloud/；完整版建议用自己的域名"
		RKEY=$(sed -n 's/^RKEY=//p' $D/cloud.conf 2>/dev/null || true); [ -n "$RKEY" ] || RKEY=$(rnd 32)
		TKEY=$(sed -n 's/^TKEY=//p' $D/cloud.conf 2>/dev/null || true); [ -n "$TKEY" ] || TKEY=$(rnd 32)
		(umask 077; printf 'URL=%s\nRKEY=%s\nTKEY=%s\n' "$CURL_" "$RKEY" "$TKEY" > $D/cloud.conf)
	fi
	. $D/cloud.conf
fi

# ---------- 定时任务 ----------
CR=/etc/crontabs/root
touch $CR
sed -i '/\/usr\/sbin\/cmcp-backup\|\/usr\/sbin\/cmcp-daily/d' $CR
echo '0 9 * * * /usr/sbin/cmcp-daily >/dev/null 2>&1' >> $CR
[ "$ED" = full ] && echo '7 4 * * * /usr/sbin/cmcp-backup auto >/dev/null 2>&1' >> $CR
/etc/init.d/cron enable >/dev/null 2>&1 || true
/etc/init.d/cron restart >/dev/null 2>&1 || true

# ---------- 升级系统时保留 ----------
for p in /etc/claude-mcp/ /www-claude-mcp/ /usr/share/ucode/cmcp/ /etc/init.d/claude-mcp /etc/init.d/cmcp-watchdog /etc/hotplug.d/ntp/90-cmcp-synced \
	/usr/sbin/cmcp-autosw /usr/sbin/cmcp-backup /usr/sbin/cmcp-daily /usr/sbin/cmcp-notify /usr/sbin/cmcp-pause /usr/sbin/cmcp-traffic /usr/sbin/cmcp-watchdog; do
	grep -qxF "$p" /etc/sysupgrade.conf 2>/dev/null || echo "$p" >> /etc/sysupgrade.conf
done
[ "$ED" = lite ] && [ -f $D/cloud.conf ] && mv -f $D/cloud.conf $D/cloud.conf.off  # 换回精简版：云端设置先停用，重装完整版时会自动恢复

# ---------- 启动 ----------
say "启动服务"
/etc/init.d/claude-mcp enable
/etc/init.d/claude-mcp restart
/etc/init.d/cmcp-watchdog enable
/etc/init.d/cmcp-watchdog restart
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
echo "Claude 连接器地址（在 Claude 设置 → 连接器 → 添加自定义连接器 里填）："
echo "  https://$H/cgi-bin/mcp/$TOKEN"
echo
echo "手机面板：https://$H/panel/   （第一次打开时粘贴上面的连接器地址登录）"
echo
echo "⚠️  这个地址里带着密钥，谁拿到都能完全控制你的路由器：不要发给别人，也不要截图分享。"
if [ "$ED" = full ]; then
	echo
	echo "---------- 完整版：把下面 3 个值设成 Worker 的密钥（见 cloud/README.md） ----------"
	echo "  PANEL_TOKEN = $TOKEN"
	echo "  RKEY        = $RKEY"
	echo "  TKEY        = $TKEY"
fi
echo
echo "卸载：sh uninstall.sh"
