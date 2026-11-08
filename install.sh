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

# 在终端里手动安装时：整个安装过程同时记到 /tmp/cmcp-install.log（失败时用户输入 y 同意上报，会一起发给开发者）
# 带 --yes 的（一键更新就是这样调用的）不走这一步，跟以前完全一样
LOG=/tmp/cmcp-install.log RCF=/tmp/cmcp-install.rc
case " $* " in *" --yes "*) CMCP_LOGGING=1 ;; esac
if [ -z "$CMCP_LOGGING" ] && [ -f "$0" ] && command -v tee >/dev/null 2>&1; then
	export CMCP_LOGGING=1
	rm -f "$RCF"
	sh "$0" "$@" 2>&1 | tee "$LOG"
	rc=$(cat "$RCF" 2>/dev/null); rm -f "$RCF"
	exit "${rc:-1}"
fi

SRC=$(cd "$(dirname "$0")" && pwd)/src
WWW=/www-claude-mcp
D=/etc/claude-mcp
ED=""; AI=""; DOMAIN=""; TTOK=""; CURL_=""; YES=0; HUB=""; INV=""

STEP="开始安装"; ERR=""; ABORT=0
say()  { STEP="$*"; printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !\033[0m %s\n' "$*"; }
die()  { ERR="$*"; printf '\033[1;31m ✗ %s\033[0m\n' "$*"; exit 1; }
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

# ---------- 安装失败：问要不要把失败原因发给开发者（输入 y 才发，默认不发；--yes 或者没有终端时不问也不发） ----------
# 发的内容先完整显示出来：版本、失败的步骤、错误信息、系统和空间情况；不含密码、密钥、邀请码、网址
TTY=${CMCP_TTY:-/dev/tty}  # 测试用：CMCP_TTY 指向一个写好回答的文件
jesc() { printf '%s' "$1" | tr -d '\000-\011\013-\037' | sed 's/\\/\\\\/g; s/"/\\"/g' | awk 'BEGIN{ORS=""} NR>1{print "\\n"} {print}'; }
mask() { # 把邀请码、隧道令牌、域名、云端地址换成 ***，长串（像密钥的）也遮掉
	printf '%s\n' "$1" | awk -v a="$INV" -v b="$TTOK" -v c="$DOMAIN" -v d="$CURL_" '
		function rp(s, x,   i, o) { if (length(x) < 4) return s; o = ""; while ((i = index(s, x)) > 0) { o = o substr(s, 1, i - 1) "***"; s = substr(s, i + length(x)) } return o s }
		{ $0 = rp(rp(rp(rp($0, a), b), c), d); print }' | sed -E 's/[A-Za-z0-9_-]{32,}/***/g'
}
fail_report() {
	set +e
	local rc=$1 url info yn r px logt bf
	[ "$rc" = 0 ] && return 0
	[ "$ABORT" = 1 ] && return 0
	url=${PKG_REPORT:-${PKG_HUB:-$HUB}}
	[ -z "$url" ] && url=$(sed -n 's/^PKG_REPORT=//p; s/^PKG_HUB=//p' "$SRC/../EDITION" 2>/dev/null | head -n1)
	url=${url%/}
	case "$url" in https://*) ;; *) echo; echo "安装没有成功。可以把上面的错误截图，发到 GitHub 的 Issues 或者联系提供安装包的人。"; return 0 ;; esac
	if [ "$YES" = 1 ] || ! ( : <"$TTY" ) 2>/dev/null; then echo; echo "安装没有成功。需要帮忙的话，把上面的错误截图发给开发者（官网「安全说明」页底部有报告表单）。"; return 0; fi
	px=$(for p in openclash nikki passwall passwall2 homeproxy shadowsocksr; do [ -x /etc/init.d/$p ] && printf '%s ' $p; done)
	info="面板版本：${PKG_VER:-开发版}（${PKG_CODE:-源码}）
失败的步骤：$STEP
错误：${ERR:-命令出错退出（代码 $rc）}
系统：$( (. /etc/openwrt_release 2>/dev/null; echo "${DISTRIB_DESCRIPTION:-不是 OpenWrt？}（${DISTRIB_ID:-?} ${DISTRIB_RELEASE:-?} ${DISTRIB_REVISION:-}）") )
平台：$( (. /etc/openwrt_release 2>/dev/null; echo "${DISTRIB_TARGET:-?} · ${DISTRIB_ARCH:-?}") )
型号：$( { ubus call system board 2>/dev/null | sed -n 's/.*"model": *"\([^"]*\)".*/\1/p'; cat /tmp/sysinfo/model 2>/dev/null; } | head -n1 )
内核：$(uname -rm 2>/dev/null)
闪存剩余：$( { df -k /overlay 2>/dev/null || df -k / 2>/dev/null; } | awk 'NR==2{print int($4/1024) " MB"}')
内存：$(free 2>/dev/null | awk '/^Mem/{print "共 " int($2/1024) " MB，空闲 " int($4/1024) " MB"}')
有没有：ucode $(command -v ucode >/dev/null && echo 有 || echo 没有) · cloudflared $(command -v cloudflared >/dev/null && echo 有 || { [ "${CFD_RAM:-0}" = 1 ] && echo '没有（小闪存模式，下载到内存）' || echo 没有; }) · curl $(command -v curl >/dev/null && echo 有 || echo 没有) · $(command -v opkg >/dev/null && echo opkg || { command -v apk >/dev/null && echo apk || echo 没有软件包管理器; }) · 防火墙 $(command -v fw4 >/dev/null 2>&1 && echo fw4 || { command -v fw3 >/dev/null 2>&1 && echo fw3 || echo 不知道; })
代理插件：${px:-没有}
是不是升级：$( [ "${UPGRADE:-0}" = 1 ] && echo 是 || echo 不是（全新安装）)"
	info=$(mask "$info")
	# 安装日志：这次安装在屏幕上输出的全部内容（去掉颜色，遮住邀请码、令牌、域名，最多最后 60KB）
	logt=""; if [ -s "$LOG" ]; then logt=$(mask "$(sed "s/$(printf '\033')\[[0-9;]*m//g" "$LOG" | tail -c 60000)"); fi
	echo
	echo "安装没有成功。可以把下面这些信息发给开发者，帮忙找原因（不含密码、密钥、邀请码和网址）："
	echo "----------------------------------------"
	printf '%s\n' "$info"
	[ -n "$logt" ] && echo "（还有这次安装在上面显示的全部过程，共 $(printf '%s\n' "$logt" | wc -l) 行，同样遮住了邀请码、令牌和域名）"
	echo "----------------------------------------"
	[ -z "$CMCP_TTY" ] && while IFS= read -r -t 0.2 yn 2>/dev/null <"$TTY"; do :; done
	printf '要上报吗？输入 y 上报，n 不上报 [n]：'
	yn=""; read -r yn <"$TTY" || yn=""
	case "$yn" in y|Y|yes|YES|是) ;; *) echo "没有上报。"; return 0 ;; esac
	bf=/tmp/cmcp-install-report.json
	printf '{"kind":"install","text":"%s","log":"%s","contact":""}' "$(jesc "$info")" "$(jesc "$logt")" > "$bf"
	if command -v curl >/dev/null 2>&1; then r=$(curl -s -m 30 -X POST -H 'Content-Type: application/json' --data-binary "@$bf" "$url/api/report" 2>/dev/null)
	elif command -v uclient-fetch >/dev/null 2>&1; then r=$(uclient-fetch -q -T 30 -O - --post-file="$bf" "$url/api/report" 2>/dev/null)
	else r=$(wget -q -T 30 -O - --post-data="$(cat "$bf")" "$url/api/report" 2>/dev/null); fi
	rm -f "$bf"
	case "$r" in
		*'"ok":true'*)
			code=$(printf '%s' "$r" | sed -n 's/.*"code":"\([a-z2-9]\{8\}\)".*/\1/p' | tr 'a-z' 'A-Z')
			if [ -n "$code" ]; then
				# 编号存在路由器上：下次运行安装命令时，先告诉他开发者回复了什么（不用账号、不用邮箱）
				printf '%s %s\n' "$code" "$url" > /etc/cmcp-report 2>/dev/null
				echo "已上报，谢谢！上报编号：$code"
				echo "过一阵子打开 $url/r/$code 看处理结果（建议截图或收藏这个网址），"
				echo "也可以在官网底部「查处理进度」输入编号查；"
				echo "以后重新运行安装命令时，最上面也会显示开发者的回复。"
			else echo "已上报，谢谢！开发者会尽快看。"; fi ;;
		*) echo "上报没成功（可能网络不通）。可以把上面的内容截图发给开发者。" ;;
	esac
	return 0
}
trap 'rc=$?; echo $rc > "$RCF" 2>/dev/null; fail_report $rc' EXIT
trap 'ABORT=1; exit 130' INT TERM

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

# 上次安装失败上报过（编号存在 /etc/cmcp-report）：先看看开发者回复了没有。查不到、断网都不影响安装
fb_reply() {
	local code url r st rep stage s3 m1 m2 m3
	code=""; url=""; read -r code url < /etc/cmcp-report 2>/dev/null || true
	case "$code" in [A-Z2-9][A-Z2-9][A-Z2-9][A-Z2-9][A-Z2-9][A-Z2-9][A-Z2-9][A-Z2-9]) ;; *) rm -f /etc/cmcp-report; return 0 ;; esac
	case "$url" in https://*) ;; *) return 0 ;; esac
	if command -v curl >/dev/null 2>&1; then r=$(curl -s -m 8 "$url/api/fb/$code" 2>/dev/null || true)
	elif command -v uclient-fetch >/dev/null 2>&1; then r=$(uclient-fetch -q -T 8 -O - "$url/api/fb/$code" 2>/dev/null || true)
	else r=$(wget -q -T 8 -O - "$url/api/fb/$code" 2>/dev/null || true); fi
	case "$r" in
		*'"ok":true'*) ;;
		*'没有这个编号'*) rm -f /etc/cmcp-report; return 0 ;;
		*) return 0 ;;
	esac
	st=$(jsonfilter -s "$r" -e '@.state' 2>/dev/null || true); rep=$(jsonfilter -s "$r" -e '@.reply' 2>/dev/null || true)
	stage=$(jsonfilter -s "$r" -e '@.stage' 2>/dev/null || true)
	[ -n "$st" ] || { [ "$(jsonfilter -s "$r" -e '@.done' 2>/dev/null || true)" = 1 ] && st=fixed || st=open; }
	case "$stage" in 1|2|3) ;; *) [ "$st" = open ] && stage=1 || stage=3 ;; esac
	echo
	case "$st" in
		fixed) printf '\033[1;32m==> 你上次上报的安装问题（编号 %s），开发者已经修好了\033[0m\n' "$code" ;;
		nofix) printf '\033[1;31m==> 你上次上报的安装问题（编号 %s），开发者说暂时没法修复\033[0m\n' "$code" ;;
		*) if [ "$stage" = 2 ]; then printf '\033[1;33m==> 你上次上报的安装问题（编号 %s），开发者已收到，正在处理\033[0m\n' "$code"
			else printf '\033[1;33m==> 你上次上报的安装问题（编号 %s），已提交，等开发者查看\033[0m\n' "$code"; fi ;;
	esac
	# 进度：反馈成功 → 开发人员已收到 → 已修复（没法修的是「无法修复」）
	s3="已修复"; [ "$st" = nofix ] && s3="无法修复"
	m1="✓"; m2="○"; m3="○"; [ "$stage" -ge 2 ] && m2="✓"; [ "$stage" -ge 3 ] && { m3="✓"; [ "$st" = nofix ] && m3="✕"; }
	echo "    进度：$m1 反馈成功 ── $m2 开发人员已收到 ── $m3 $s3"
	[ -n "$rep" ] && { echo "    开发者的说明："; printf '%s\n' "$rep" | sed 's/^/      /'; }
	echo "    详情：$url/r/$code"
	echo
}
[ -s /etc/cmcp-report ] && fb_reply
[ "$(id -u)" = 0 ] || die "请用 root 运行"
[ -f /etc/openwrt_release ] || die "这不是 OpenWrt 系统"
[ -f "$SRC/www/cgi-bin/mcp" ] || die "找不到 $SRC，请在解压后的目录里运行 install.sh"

UPGRADE=0
[ -s "$D/config.json" ] && UPGRADE=1

# ---------- 选版本 ----------
# 发布的安装包里有 EDITION 文件，写着这个包是哪个版本；参数可以覆盖它
PKG_AI=""; PKG_ED=""; PKG_HUB=""; PKG_VER=""; PKG_CODE=""
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
say "安装 $NAME${PKG_VER:+（v$PKG_VER）}$( [ $UPGRADE = 1 ] && echo '，升级，保留现有设置' )"

# ---------- 依赖 ----------
need=""
have_pkg() { [ -n "$(command -v "$1")" ]; }
free_mb() { { df -k /overlay 2>/dev/null || df -k / 2>/dev/null; } | awk 'NR==2{print int($4/1024)}'; }
mem_mb() { awk -v k="$1:" '$1 == k { print int($2 / 1024) }' "${CMCP_MEMINFO:-/proc/meminfo}" 2>/dev/null; }
# 装软件包。opkg / apk 自己崩溃（Segmentation fault 这类，退出码 ≥ 128）时，清掉软件源列表重试一次
PKGERR=""
pkg_add() {
	local rc=0
	PKGERR=""
	if have_pkg apk; then
		apk update >/dev/null 2>&1 || PKGERR=net
		apk add "$@" || rc=$?
		if [ $rc -gt 128 ] && [ $rc -lt 160 ]; then
			warn "apk 崩溃了（退出码 $rc），清掉缓存重试一次"; rc=0
			rm -rf /var/cache/apk/* 2>/dev/null || true; apk update >/dev/null 2>&1 || true
			apk add "$@" || rc=$?
		fi
	elif have_pkg opkg; then
		opkg update >/dev/null 2>&1 || PKGERR=net
		opkg install "$@" || rc=$?
		if [ $rc -gt 128 ] && [ $rc -lt 160 ]; then
			warn "opkg 崩溃了（退出码 $rc），清掉软件源列表重试一次"; rc=0
			rm -rf /var/opkg-lists 2>/dev/null || true; opkg update >/dev/null 2>&1 || true
			opkg install "$@" || rc=$?
		fi
	else PKGERR=nopm; return 1; fi
	[ $rc -eq 0 ] && return 0
	[ $rc -gt 128 ] && [ $rc -lt 160 ] && PKGERR=crash
	return 1
}
pkg_die() {
	local pm; pm=$(have_pkg apk && echo apk || echo opkg)
	case "$PKGERR" in
		crash) die "路由器的软件包管理器（$pm）自己崩溃了（Segmentation fault），清掉软件源列表重试也一样。这是路由器固件的问题，不是面板的问题：先重启路由器再装一次；还不行，建议换这个固件的稳定版（SNAPSHOT 测试版容易这样）。没装上的：$1" ;;
		nopm) die "没有找到 opkg / apk，请手动安装：$1" ;;
		net) die "依赖安装失败：$1。更新软件源列表时出错了，可能是路由器连不上软件源：检查路由器能不能上网、软件源地址对不对，再装一次" ;;
		*) die "依赖安装失败：$1（在路由器后台「系统 → 软件包」里搜一下这几个包，看看能不能手动装上）" ;;
	esac
}
# 小闪存模式能不能用：要官方有这个架构的 cloudflared、内存够、能校验
cfd_ram_check() {
	local m why=""
	case "$(uname -m)" in aarch64|arm64|armv7*|armv8l|x86_64|i386|i486|i586|i686) ;; *) why="这台路由器的架构（$(uname -m)）没有官方的 cloudflared" ;; esac
	m=$(mem_mb MemAvailable); m=${m:-0}
	[ -z "$why" ] && [ "$m" -lt 120 ] && why="可用内存只有 $m MB，小闪存模式要 120 MB 以上"
	[ -z "$why" ] && ! have_pkg sha256sum && why="系统里没有 sha256sum，没法校验下载的程序"
	[ -z "$why" ] && [ ! -s "$SRC/etc/cfd.sums" ] && why="这个安装包里没有 cloudflared 的校验值"
	[ -n "$why" ] && die "$1，小闪存模式也用不了：$why。可以先删掉用不上的插件（在路由器后台「系统 → 软件包」里卸载），让闪存剩 40 MB 以上再装一次"
	return 0
}
[ -x /usr/bin/ucode ] || need="$need ucode"
[ -f /usr/lib/ucode/fs.so ] || need="$need ucode-mod-fs"
[ -f /usr/lib/ucode/uci.so ] || need="$need ucode-mod-uci"
[ -x /usr/sbin/uhttpd ] || need="$need uhttpd"
have_pkg curl || need="$need curl"
FREE=$(free_mb); FREE=${FREE:-0}
# 面板本身加上面这几个小依赖，大约要 5 MB
[ "$FREE" -lt 6 ] && die "闪存只剩 $FREE MB，装面板至少要 6 MB。先删掉用不上的插件（在路由器后台「系统 → 软件包」里卸载），再装一次"
if [ -n "$need" ]; then
	say "安装依赖：$need"
	pkg_add $need || pkg_die "$need"
fi
# cloudflared（远程访问必需，约 30 MB）：闪存放得下就装进闪存（跟以前一样）；
# 放不下、或者软件源里没有，但内存够的，用小闪存模式：不装进闪存，开机时下载到内存里运行
CFD_RAM=0
if ! have_pkg cloudflared; then
	FREE=$(free_mb); FREE=${FREE:-0}
	if [ "$FREE" -ge 40 ]; then
		say "安装 cloudflared（远程访问用，约 30 MB）"
		if ! pkg_add cloudflared; then
			[ "$PKGERR" = crash ] && pkg_die cloudflared
			[ "$PKGERR" = nopm ] && pkg_die cloudflared
			warn "cloudflared 没装上（软件源里可能没有），改用小闪存模式"
			cfd_ram_check "cloudflared 装不上"
			CFD_RAM=1
		fi
	else
		cfd_ram_check "闪存只剩 $FREE MB，放不下远程访问要用的 cloudflared（约 30 MB）"
		CFD_RAM=1
	fi
	if [ $CFD_RAM = 1 ]; then
		say "小闪存模式：闪存只剩 $FREE MB，cloudflared 不装进闪存，每次开机下载到内存里运行（约 35 MB，网速慢的话要一两分钟）"
		cfh=$HUB; [ -z "$cfh" ] && [ -s "$D/hub.conf" ] && cfh=$(sed -n 's/^HUB=//p' "$D/hub.conf")
		CFD_SUMS="$SRC/etc/cfd.sums" CFD_HUB="$cfh" sh "$SRC/bin/cmcp-cfd" fetch \
			|| die "下载 cloudflared 失败：官网和 GitHub 都没下成，或者下载的文件校验不对。检查路由器能不能上网，过一会儿再装一次"
		ok "cloudflared 已下载到内存，校验通过（不占闪存；路由器重启后会自动重新下载）"
	fi
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
# 小闪存模式：校验值跟着安装包走；cfd.ram 是记号（升级、体检、卸载时看）
[ -s "$SRC/etc/cfd.sums" ] && cp -f "$SRC/etc/cfd.sums" $D/cfd.sums
if [ "$CFD_RAM" = 1 ]; then : > $D/cfd.ram; else rm -f $D/cfd.ram; fi
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
# AI 版另外生成一个「Claude 连接器地址」的钥匙（ckey）：只给 Claude 用，打不开面板；托管版的面板要登录码，连接器不用
CKEY=$(jsonfilter -i $D/config.json -e '@.ckey' 2>/dev/null || true)
[ "$AI" = 1 ] && [ ${#CKEY} -lt 16 ] && CKEY=$(rnd 40)
ucode -e 'let fs = require("fs"), f = ARGV[0], c = json(fs.readfile(f)); if (ARGV[1] == "0") c.ai = false; else delete c.ai; if (length(ARGV[2] ?? "") >= 16) c.ckey = ARGV[2]; fs.writefile(f, sprintf("%.J\n", c));' $D/config.json "$AI" "$CKEY" \
	|| die "写入 config.json 失败"
# 路由器自己的小工具调用面板接口用的钥匙（托管版不用输登录码）
[ -s $D/local.key ] || rnd 40 > $D/local.key
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
	# 已经开通过：问一下托管服务这个网址还在不在（被提供服务的人彻底删除了，就要用新邀请码重新开通）
	if [ -s $D/hub.conf ] && grep -q '^PKEY=' $D/cloud.conf 2>/dev/null; then
		SUB0=$(sed -n 's/^SUB=//p' $D/hub.conf); RK0=$(sed -n 's/^RKEY=//p' $D/cloud.conf)
		R0=$(curl -s -m 20 -X POST -H 'Content-Type: application/json' -d "{\"sub\":\"$SUB0\",\"rkey\":\"$RK0\"}" "$HUB/api/dev/info" 2>/dev/null || true)
		case "$R0" in
			*钥匙不对*|*没有这台路由器*)
				warn "这台路由器原来的托管网址（$SUB0）已经被删除了，要用新的邀请码重新开通（路由器上的设置都会保留，网址会换成新的）"
				# 一键更新这类不问问题、又没给邀请码的：先什么都不动，免得删了开通信息又开通不了
				if [ -n "$INV" ] || [ "$YES" != 1 ]; then rm -f $D/hub.conf
				else warn "这次没有邀请码，先保留原来的设置。拿到新邀请码后在这个目录运行：sh install.sh --invite 新邀请码"; fi ;;
		esac
	fi
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
		[ "$(jf bound)" = true ] && ok "这个试用码是官网账号领的：路由器已经自动加到你的账号里"
		EXP=$(jf exp); [ "${EXP:-0}" -gt 0 ] 2>/dev/null && SVC_END=$(date -d "@$((EXP / 1000))" '+%Y-%m-%d' 2>/dev/null || echo "")
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
	/usr/sbin/cmcp-autosw /usr/sbin/cmcp-backup /usr/sbin/cmcp-daily /usr/sbin/cmcp-logincode /usr/sbin/cmcp-notify /usr/sbin/cmcp-pair /usr/sbin/cmcp-pause /usr/sbin/cmcp-proxy /usr/sbin/cmcp-route /usr/sbin/cmcp-traffic /usr/sbin/cmcp-tunbypass /usr/sbin/cmcp-update /usr/sbin/cmcp-watchdog; do
	grep -qxF "$p" /etc/sysupgrade.conf 2>/dev/null || echo "$p" >> /etc/sysupgrade.conf
done
[ "$ED" = lite ] && [ -f $D/cloud.conf ] && mv -f $D/cloud.conf $D/cloud.conf.off  # 换回精简版：云端设置先停用，重装完整版时会自动恢复

# ---------- 记下装的是哪个版本（面板「一键更新」要用：下载同一种安装包） ----------
# 按实际装好的算（可能用 --ai / --no-ai 改过安装包默认的版本）
CODE=$( [ "$AI" = 1 ] && echo ai || echo noai )
if [ -n "$HUB" ]; then CODE=hosted-$CODE; else CODE=$CODE-$ED; fi
printf 'VER=%s\nCODE=%s\nAT=%s\n' "${PKG_VER:-dev}" "$CODE" "$(date +%s)" > $D/version

# ---------- 隧道直连 Cloudflare（不经过 OpenClash，OpenClash 重启、节点卡住时面板不跟着断）----------
# 认出装了哪些代理插件（OpenClash、Nikki、PassWall、PassWall2、HomeProxy、SSR Plus+），面板按它显示
PXL=$(/usr/sbin/cmcp-proxy list 2>/dev/null | cut -d' ' -f4- | tr '\n' '、' | sed 's/、$//')
[ -n "$PXL" ] && ok "认出代理插件：$PXL" || ok "没装代理插件（以后装了 OpenClash、PassWall 等，面板会自动认出来）"
[ "$(/usr/sbin/cmcp-tunbypass apply 2>/dev/null)" = changed ] && ok "隧道改成直连 Cloudflare：代理插件重启或节点卡住时，面板和 Claude 不会再跟着断"

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
if [ -n "$HUB" ]; then
	# 托管版：只给一个链接。手机打开后，面板会带着去官网绑定账号、拿登录码，不用再抄别的地址
	PC=$(/usr/sbin/cmcp-pair --code 2>/dev/null)
	HUBN=${HUB#https://}
	echo
	echo "👉 接下来用手机做（10 分钟内）："
	echo
	echo "  1. 手机打开这个链接（复制到手机浏览器，或者直接在手机上点）："
	echo
	echo "     https://$H/panel/#login=$TOKEN${PC:+&pair=$PC}"
	echo
	if [ -n "$PC" ]; then
		echo "  2. 页面上点「绑定官网账号」，登录或注册 $HUBN 的账号"
		echo "  3. 绑定好后官网会显示登录码，点「打开面板」就进去了"
	else
		echo "  2. 页面会提示输入登录码：打开 $HUB/app 登录账号，在「添加路由器」里输入配对码绑定"
		echo "     （配对码在这个终端运行 cmcp-pair 拿）；绑定好点「获取登录码」→「打开面板」"
	fi
	echo
	echo "  以后换手机、清了浏览器：打开 $HUBN 账号页，在这台路由器下面点「获取登录码」。"
	echo "  面板里点浏览器菜单「添加到主屏幕」，以后就像 App 一样打开。"
	echo
	echo "⚠️  这个链接带着密钥：只在自己的手机上打开，不要发给别人，也不要截图分享。"
	if [ -n "$SVC_END" ]; then
		echo
		echo "⏳ 这是试用，用到 $SVC_END。快到期时在官网账号页点「申请续期」，审核通过自动续上，不用重装。"
	fi
	echo
	echo "托管版的推送、云端备份、断电断网判断都已经开通，不用另外设置。"
	echo
	echo "---------- 备用信息（一般用不到） ----------"
	echo "面板地址：https://$H/panel/"
	echo "登录地址（面板要求粘贴时用）：https://$H/cgi-bin/mcp/$TOKEN"
	[ "$AI" = 1 ] && echo "Claude 连接器地址（在 Claude「设置 → 连接器 → 添加自定义连接器」里填）：https://$H/cgi-bin/mcp/$CKEY"
	[ -n "$PC" ] && echo "配对码：$PC（在官网「添加路由器」里手动输入也行；过期了运行 cmcp-pair 再拿）"
	echo "官网打不开、急着用：运行 cmcp-logincode 拿一个应急登录码"
else
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
		echo "Claude 连接器地址（在 Claude「设置 → 连接器 → 添加自定义连接器」里填它；只给 Claude 用，打不开面板）："
		echo "  https://$H/cgi-bin/mcp/$CKEY"
	fi
	echo
	echo "⚠️  上面的地址里都带着密钥，谁拿到都能控制你的路由器：不要发给别人，也不要截图分享。"
	if [ "$ED" = full ]; then
		echo
		echo "---------- 完整版：把下面 3 个值设成 Worker 的密钥（见 cloud/README.md） ----------"
		echo "  PANEL_TOKEN = $TOKEN"
		echo "  RKEY        = $RKEY"
		echo "  TKEY        = $TKEY"
	fi
fi
rm -f /etc/cmcp-report
echo
echo "卸载：sh uninstall.sh"
