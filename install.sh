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
#   --invite 安装码              托管版：官网注册账号后在「装新路由器」里拿（领试用或用邀请码兑换），官网给的命令里已经带着；装 AI 版还是纯面板版在终端里输 1 或 2 选
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
ED=""; AI=""; DOMAIN=""; TTOK=""; CURL_=""; YES=0; HUB=""; INV=""; BOUND=0

STEP="开始安装"; ERR=""; ABORT=0
say()  { STEP="$*"; printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !\033[0m %s\n' "$*"; }
die()  { ERR="$*"; printf '\033[1;31m ✗ %s\033[0m\n' "$*"; exit 1; }
# 某个目录所在分区还剩多少 MB。
# BusyBox 的 df 遇到很长的分区名（超过 20 个字），会把名字单独放一行、数字挪到下一行，
# 所以把数据行拼起来、从后往前数取「可用」那一列（不管换没换行都对）；
# 读不出来或者读出来很小（不到 40 MB）时，再用 stat -f 查一次，取大的，免得读错了不让装
avail_mb() {
	local m s
	m=$(df -k "$1" 2>/dev/null | awk 'NR > 1 { l = l " " $0 } END { n = split(l, f, " "); if (n >= 6 && f[n - 2] ~ /^[0-9]+$/) print int(f[n - 2] / 1024) }')
	if [ -z "$m" ] || [ "$m" -lt 40 ]; then
		s=$(stat -f -c '%a %S' "$1" 2>/dev/null | awk '$1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ { print int($1 * $2 / 1048576) }')
		if [ -n "$s" ] && { [ -z "$m" ] || [ "$s" -gt "$m" ]; }; then m=$s; fi
	fi
	echo "${m:-0}"
}
# 闪存（/overlay，没有的话就是 /）还剩多少 MB
free_mb() { if [ -d /overlay ]; then avail_mb /overlay; else avail_mb /; fi; }
# 各分区的原始情况（空间不够时附在报错和上报里，开发者能看到真实情况）
df_raw() { df -h / /overlay /tmp 2>/dev/null | awk '!s[$0]++' | head -n 8 | sed 's/^/    /'; }
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
	local rc=$1 url info yn r px logt bf em n idj acct hs hk
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
闪存剩余：$(free_mb) MB
分区情况：
$(df_raw)
内存：$(free 2>/dev/null | awk '/^Mem/{print "共 " int($2/1024) " MB，可用 " int((NF >= 7 ? $7 : $4)/1024) " MB"}')
有没有：ucode $(command -v ucode >/dev/null && echo 有 || echo 没有) · cloudflared $(command -v cloudflared >/dev/null && echo 有 || { [ "${CFD_RAM:-0}" = 1 ] && echo '没有（小闪存模式，下载到内存）' || echo 没有; }) · curl $(command -v curl >/dev/null && echo 有 || echo 没有) · $(command -v opkg >/dev/null && echo opkg || { command -v apk >/dev/null && echo apk || echo 没有软件包管理器; }) · 防火墙 $(command -v fw4 >/dev/null 2>&1 && echo fw4 || { command -v fw3 >/dev/null 2>&1 && echo fw3 || echo 不知道; })
代理插件：${px:-没有}
是不是升级：$( [ "${UPGRADE:-0}" = 1 ] && echo 是 || echo 不是（全新安装）)"
	info=$(mask "$info")
	# 安装日志：这次安装在屏幕上输出的全部内容（去掉颜色，遮住邀请码、令牌、域名，最多最后 60KB）
	logt=""; if [ -s "$LOG" ]; then logt=$(mask "$(sed "s/$(printf '\033')\[[0-9;]*m//g" "$LOG" | tail -c 60000)"); fi
	echo
	if [ -n "$INV" ]; then echo "安装没有成功。可以把下面这些信息发给开发者，帮忙找原因（不含密码、密钥和网址；会另外附上这次的安装码，只用来认出你的官网账号）："
	else echo "安装没有成功。可以把下面这些信息发给开发者，帮忙找原因（不含密码、密钥、邀请码和网址）："; fi
	echo "----------------------------------------"
	printf '%s\n' "$info"
	[ -n "$logt" ] && echo "（还有这次安装在上面显示的全部过程，共 $(printf '%s\n' "$logt" | wc -l) 行，同样遮住了邀请码、令牌和域名）"
	echo "----------------------------------------"
	# 输入只打开一次，所有回答都从这里按顺序读（「要不要上报」之后接着读邮箱）
	exec 3<"$TTY" || { echo "没有上报（读不到输入）。可以把上面的内容截图发给开发者。"; return 0; }
	[ -z "$CMCP_TTY" ] && while IFS= read -r -t 0.2 yn 2>/dev/null <&3; do :; done
	printf '要上报吗？输入 y 上报，n 不上报 [n]：'
	yn=""; read -r yn <&3 || yn=""
	case "$yn" in y|Y|yes|YES|是) ;; *) exec 3<&-; echo "没有上报。"; return 0 ;; esac
	# 认得出官网账号的：这次用了官网给的安装码，或者是托管版路由器升级（凭路由器自己的钥匙）——处理进度直接发到账号邮箱，不用再填
	idj="" acct=""
	if [ -n "$INV" ]; then idj="\"inv\":\"$(jesc "$INV")\""
	elif [ -s "$D/hub.conf" ] && [ -s "$D/cloud.conf" ]; then
		hs=$(sed -n 's/^SUB=//p' "$D/hub.conf" | head -n1); hk=$(sed -n 's/^RKEY=//p' "$D/cloud.conf" | head -n1)
		[ -n "$hs" ] && [ -n "$hk" ] && idj="\"sub\":\"$(jesc "$hs")\",\"rkey\":\"$(jesc "$hk")\""
	fi
	if [ -n "$idj" ]; then
		bf=/tmp/cmcp-install-who.json; printf '{%s}' "$idj" > "$bf"
		if command -v curl >/dev/null 2>&1; then r=$(curl -s -m 20 -X POST -H 'Content-Type: application/json' --data-binary "@$bf" "$url/api/report/who" 2>/dev/null)
		elif command -v uclient-fetch >/dev/null 2>&1; then r=$(uclient-fetch -q -T 20 -O - --post-file="$bf" "$url/api/report/who" 2>/dev/null)
		else r=$(wget -q -T 20 -O - --post-data="$(cat "$bf")" "$url/api/report/who" 2>/dev/null); fi
		rm -f "$bf"
		acct=$(printf '%s' "$r" | sed -n 's/.*"acct":"\([^"]*\)".*/\1/p')
	fi
	# 认不出账号的：上报必须留邮箱，开发者处理好了、写了说明，会发邮件告诉他（最多问 3 次；输入 n 取消；输入结束了就不再问）
	em="" n=0
	[ -n "$acct" ] && n=3
	while [ $n -lt 3 ]; do
		n=$((n + 1))
		printf '你的邮箱（必填，处理进度和结果会发到这个邮箱；输入 n 取消上报）：'
		if ! read -r em <&3; then em=""; echo; break; fi
		em=$(printf '%s' "$em" | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
		case "$em" in n|N|no|NO|否) exec 3<&-; echo "没有上报。"; return 0 ;; esac
		if [ ${#em} -le 120 ] && printf '%s\n' "$em" | grep -Eq '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'; then break; fi
		if [ -z "$em" ]; then echo "需要填邮箱才能上报（开发者处理好了会发邮件告诉你）。"; else echo "邮箱格式不对，再输一次（比如 name@example.com）。"; fi
		em=""
	done
	exec 3<&-
	if [ -z "$em" ] && [ -z "$acct" ]; then echo "没有上报（没填邮箱）。可以把上面的内容截图发给开发者。"; return 0; fi
	bf=/tmp/cmcp-install-report.json
	printf '{"kind":"install","text":"%s","log":"%s","contact":"","email":"%s"%s}' "$(jesc "$info")" "$(jesc "$logt")" "$(jesc "$em")" "${idj:+,$idj}" > "$bf"
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
				if [ -n "$acct" ]; then echo "处理进度会发到你官网账号的邮箱 $acct（收不到的话看看垃圾邮件），开发者处理好了也会发邮件告诉你。"
				else echo "开发者处理好了会发邮件到 $em 告诉你（收不到的话看看垃圾邮件）。"; fi
				echo "过一阵子打开 $url/r/$code 看处理结果（建议截图或收藏这个网址），"
				echo "也可以在官网底部「查处理进度」输入编号查；"
				echo "以后重新运行安装命令时，最上面也会显示开发者的回复。"
			else echo "已上报，谢谢！开发者会尽快看。"; fi ;;
		*'邮箱格式不对'*) echo "上报没成功：托管服务说邮箱格式不对。可以把上面的内容截图发给开发者。" ;;
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
# 托管版：安装包都一样，AI 版还是纯面板版在终端里选（输 1 或 2）；再装一次（升级）时默认原来那个，一键更新不问
[ -n "$AI" ] || [ -n "$PKG_HUB" ] || AI=$PKG_AI
[ -n "$ED" ] || ED=$PKG_ED
[ -n "$HUB" ] || HUB=$PKG_HUB
[ -z "$HUB" ] && [ -s "$D/hub.conf" ] && HUB=$(sed -n 's/^HUB=//p' "$D/hub.conf")
HUB=${HUB%/}
if [ -n "$HUB" ]; then
	case "$HUB" in https://*) ;; *) die "托管服务网址应该是 https:// 开头" ;; esac
	ED=full   # 托管版自带云端（推送、云端备份、断电断网判断）
fi
if [ -z "$AI" ]; then
	def=1; [ "$PKG_AI" = 0 ] && def=2
	[ $UPGRADE = 1 ] && { grep -q '"ai": *false' "$D/config.json" && def=2 || def=1; }
	echo
	echo "  装哪个版本？"
	echo "  1) AI 版：手机面板 + 能在 Claude 里用对话管理路由器"
	echo "  2) 纯面板版：只有手机面板，自己动手管理，不接 AI"
	echo "  （以后想换，再运行一次安装命令选另一个就行，网址和设置都保留）"
	ask PICK "输入 1 或 2，回车" "$def"
	case "$PICK" in 2) AI=0 ;; *) AI=1 ;; esac
fi
if [ -z "$ED" ]; then
	if [ -s "$D/cloud.conf" ]; then def=2; else def=1; fi
	echo
	echo "  装精简版还是完整版？"
	echo "  1) 精简版：手机面板 + 本地看门狗（不需要 Cloudflare 账号）"
	echo "  2) 完整版：再加 Cloudflare 云端（手机/微信推送、云端备份、断电断网判断，需要先部署 Worker）"
	ask PICK "输入 1 或 2，回车" "$def"
	case "$PICK" in 2) ED=full ;; *) ED=lite ;; esac
fi
[ "$ED" = full ] && [ ! -f "$SRC/bin/cmcp-backup" ] && die "这个安装包是精简版，装完整版请下载 full 包"
NAME="$( [ "$AI" = 1 ] && echo AI版 || echo 纯面板版 )·$( [ -n "$HUB" ] && echo 托管版 || { [ "$ED" = full ] && echo 完整版 || echo 精简版; } )"
say "安装 $NAME${PKG_VER:+（v$PKG_VER）}$( [ $UPGRADE = 1 ] && echo '，升级，保留现有设置' )"

# ---------- 依赖 ----------
need=""
have_pkg() { [ -n "$(command -v "$1")" ]; }
mem_mb() { awk -v k="$1:" '$1 == k { print int($2 / 1024) }' "${CMCP_MEMINFO:-/proc/meminfo}" 2>/dev/null; }
# 装软件包。opkg / apk 自己崩溃（Segmentation fault 这类，退出码 ≥ 128）时，清掉软件源列表重试一次
PKGERR="" PKGFEEDS="" PKGNONE=""
UPLOG=/tmp/cmcp_pkgupdate.log
# 更新软件源失败时，从报错里找出连不上的软件源地址（最多 3 个，给用户和上报看）
pkg_feeds() { grep -i -e fail -e error -e warn "$UPLOG" 2>/dev/null | grep -o 'https\{0,1\}://[^ ,:"]*[^ ,:".]' | sed 's#/Packages\(\.gz\|\.sig\)\{0,1\}$##; s#/APKINDEX\.tar\.gz$##' | awk '!s[$0]++' | head -n 3; }
# 软件源里根本没有的包（更新成功、但列表里找不到）
pkg_none() { local p n=""; for p in "$@"; do if have_pkg apk; then apk search -e "$p" 2>/dev/null | grep -q . || n="$n $p"; else opkg list "$p" 2>/dev/null | grep -q "^$p " || n="$n $p"; fi; done; echo "${n# }"; }
pkg_add() {
	local rc=0
	PKGERR="" PKGFEEDS="" PKGNONE=""
	if have_pkg apk; then
		apk update >"$UPLOG" 2>&1 || PKGERR=net
		apk add "$@" || rc=$?
		if [ $rc -gt 128 ] && [ $rc -lt 160 ]; then
			warn "apk 崩溃了（退出码 $rc），清掉缓存重试一次"; rc=0
			rm -rf /var/cache/apk/* 2>/dev/null || true; apk update >/dev/null 2>&1 || true
			apk add "$@" || rc=$?
		fi
	elif have_pkg opkg; then
		opkg update >"$UPLOG" 2>&1 || PKGERR=net
		opkg install "$@" || rc=$?
		if [ $rc -gt 128 ] && [ $rc -lt 160 ]; then
			warn "opkg 崩溃了（退出码 $rc），清掉软件源列表重试一次"; rc=0
			rm -rf /var/opkg-lists 2>/dev/null || true; opkg update >/dev/null 2>&1 || true
			opkg install "$@" || rc=$?
		fi
	else PKGERR=nopm; return 1; fi
	[ $rc -eq 0 ] && return 0
	[ $rc -gt 128 ] && [ $rc -lt 160 ] && PKGERR=crash
	[ "$PKGERR" = net ] && PKGFEEDS=$(pkg_feeds)
	[ -z "$PKGERR" ] && { PKGNONE=$(pkg_none "$@"); [ -n "$PKGNONE" ] && PKGERR=none; }
	return 1
}
# 软件源出问题的说明（连不上哪几个 / 里面没有哪些包），给 pkg_die 和 ucode 补装失败时用
pkg_why() {
	case "$PKGERR" in
		net) if [ -n "$PKGFEEDS" ]; then printf '路由器连不上这几个软件源：\n%s\n可能是路由器没联网，或者固件里设置的软件源地址已经失效（路由器后台「系统 → 软件包 → 配置」里能看、能改）' "$(echo "$PKGFEEDS" | sed 's/^/    /')"
			else printf '更新软件源列表时出错了，可能是路由器连不上软件源：检查路由器能不能上网、软件源地址对不对'; fi ;;
		none) printf '这个固件的软件源里没有 %s。面板要用 ucode（OpenWrt 22.03 以后才有），这个固件可能比较旧，或者不是标准的 OpenWrt' "$PKGNONE" ;;
		*) printf '在路由器后台「系统 → 软件包」里搜一下这几个包，看看能不能手动装上' ;;
	esac
}
pkg_die() {
	local pm; pm=$(have_pkg apk && echo apk || echo opkg)
	case "$PKGERR" in
		crash) die "路由器的软件包管理器（$pm）自己崩溃了（Segmentation fault），清掉软件源列表重试也一样。这是路由器固件的问题，不是面板的问题：先重启路由器再装一次；还不行，建议换这个固件的稳定版（SNAPSHOT 测试版容易这样）。没装上的：$1" ;;
		nopm) die "没有找到 opkg / apk，请手动安装：$1" ;;
		net) die "依赖安装失败：$1。$(pkg_why)。改好以后再装一次" ;;
		none) die "依赖安装失败：$1。$(pkg_why)。建议换成 ImmortalWrt、iStoreOS 或官方 OpenWrt 再装" ;;
		*) die "依赖安装失败：$1（$(pkg_why)）" ;;
	esac
}
# ucode 从软件源装不上（软件源连不上、或者固件的软件源里没有）时的补救：
# 从 OpenWrt 官方（先国内镜像）下载 23.05 的 ucode 这几个包，核对安装包里写好的 SHA256；
# 只补系统里没有的文件（已有的一个都不动），补完真的跑一遍；跑不起来就把补的文件删干净
RT=${CMCP_ROOT:-}
UC_SUMS="$SRC/etc/ucode.sums"
uc_arch() {
	local a; a=$(sed -n "s/^DISTRIB_ARCH=['\"]\{0,1\}\([^'\"]*\).*/\1/p" $RT/etc/openwrt_release 2>/dev/null | head -n 1)
	[ -n "$a" ] || a=$(opkg print-architecture 2>/dev/null | awk '$2 != "all" && $2 != "noarch" { a = $2 } END { print a }')
	echo "$a"
}
# 试运行（测试时 CMCP_UCCHROOT 指向一个真的 OpenWrt 根目录，在里面跑）
# 结果用拼出来的字（出错时 ucode 会把程序原文打出来，原文里不能直接有「通过」的字样）
UC_TRY='let fs = require("fs"), uci = require("uci"); print((type(fs.readfile) == "function" && type(uci.cursor) == "function") ? "UCODE" + "-PASS" : "UCODE" + "-BAD");'
uc_ok() { if [ -n "$CMCP_UCCHROOT" ]; then chroot "$CMCP_UCCHROOT" /usr/bin/ucode -e "$UC_TRY" 2>&1; else $RT/usr/bin/ucode -e "$UC_TRY" 2>&1; fi; }
# 系统里有没有这个库（几个可能的位置，有一个就算有）
uc_has() { local f; for f in "$@"; do [ -e "$f" ] && return 0; done; return 1; }
ucode_fetch() {
	local a v t n line f s u got pk p out
	UCWHY=""
	a=$(uc_arch); v=$(sed -n 's/^VER=//p' "$UC_SUMS" 2>/dev/null | head -n 1)
	if [ -z "$a" ] || [ -z "$v" ] || ! grep -q "^$a " "$UC_SUMS" 2>/dev/null; then UCWHY="安装包里没有这个架构（${a:-认不出来}）的 ucode"; return 1; fi
	have_pkg sha256sum || { UCWHY="系统里没有 sha256sum，没法校验下载的文件"; return 1; }
	t=$(mktemp -d /tmp/cmcp_uc.XXXXXX 2>/dev/null) || { UCWHY="建不了临时目录"; return 1; }
	pk="libucode20230711 ucode ucode-mod-fs ucode-mod-uci"
	# 按 ucode 要的版本找（老固件的 libubox 版本号不同，文件名也不同；补上新版跟老版并存，不会覆盖）
	uc_has $RT/usr/lib/libjson-c.so.5 $RT/lib/libjson-c.so.5 || pk="libjson-c5 $pk"
	uc_has $RT/usr/lib/libuci.so $RT/lib/libuci.so || pk="libuci20130104 $pk"
	uc_has $RT/usr/lib/libubox.so.20230523 $RT/lib/libubox.so.20230523 || pk="libubox20230523 $pk"
	mkdir -p "$t/root"
	for n in $pk; do
		line=$(awk -v a="$a" -v n="$n" '$1 == a && $2 == n { print $3, $4; exit }' "$UC_SUMS"); f=${line% *}; s=${line#* }
		[ -n "$line" ] || { UCWHY="安装包里没有 $n（$a）"; rm -rf "$t"; return 1; }
		got=0
		for u in https://mirrors.tuna.tsinghua.edu.cn/openwrt https://mirrors.ustc.edu.cn/openwrt https://downloads.openwrt.org; do
			curl -fsSL --connect-timeout 10 -m 180 -o "$t/$f" "$u/releases/$v/packages/$a/base/$f" 2>/dev/null || continue
			[ "$(sha256sum "$t/$f" | cut -d' ' -f1)" = "$s" ] && { got=1; break; }
		done
		[ $got = 1 ] || { UCWHY="下载 $n 失败（国内镜像和 OpenWrt 官网都没下成，或者文件校验不对）"; rm -rf "$t"; return 1; }
		mkdir -p "$t/x" && tar -xzf "$t/$f" -C "$t/x" ./data.tar.gz 2>/dev/null && tar -xzf "$t/x/data.tar.gz" -C "$t/root" 2>/dev/null \
			|| { UCWHY="解不开下载的 $n"; rm -rf "$t"; return 1; }
		rm -rf "$t/x" "$t/$f"
	done
	: > "$t/added"
	( cd "$t/root" && find . ! -type d ) | sed 's#^\.##' > "$t/list"
	while read -r p; do
		[ -n "$p" ] || continue
		if [ -e "$RT$p" ] || [ -L "$RT$p" ]; then continue; fi
		mkdir -p "$(dirname "$RT$p")" && cp -a "$t/root$p" "$RT$p" && echo "$p" >> "$t/added"
	done < "$t/list"
	out=$(uc_ok)
	case "$out" in
		UCODE-PASS) mkdir -p $D; cat "$t/added" >> $D/ucode.files; rm -rf "$t"; return 0 ;;
	esac
	# 跑不起来：把这次补的文件删干净，跟没装过一样
	while read -r p; do [ -n "$p" ] && rm -f "$RT$p"; done < "$t/added"
	rm -rf "$t"
	UCWHY="下载的 ucode 在这个固件上跑不起来（$(echo "$out" | head -n 1 | cut -c1-120)），已经删掉了"
	return 1
}
# 系统自带的 ucode 太旧（比如 21.02 时期的固件）：从 OpenWrt 官方补的新模块跟它对不上（报 ucv_resource_data 之类找不到）。
# 这时给面板单独装一套完整的新 ucode，放在 /usr/share/claude-mcp/ucrt，只给面板自己的程序用：
# 用系统的动态链接器指定库目录来启动（不设 LD_LIBRARY_PATH，面板调用的系统命令照样用系统自己的库），系统原有的 ucode 一个文件都不动
UCRT=/usr/share/claude-mcp/ucrt UCW=/usr/libexec/cmcp-ucode
uc_ld() { local l; for l in $RT/lib/ld-musl-*.so.1 $RT/lib/ld-linux*.so.* $RT/lib64/ld-linux*.so.*; do [ -e "$l" ] && { echo "${l#$RT}"; return 0; }; done; return 1; }
# 用私有 ucode 试运行（测试时 CMCP_UCLIBX 补上测试机自己的库目录）
uc_priv_try() { local l; l=$(uc_ld) || return 1; "$RT$l" --library-path "$RT$UCRT/lib${CMCP_UCLIBX:+:$CMCP_UCLIBX}" "$RT$UCRT/bin/ucode" -L "$RT$UCRT/lib/ucode/*.so" -L "$RT/usr/share/ucode/*.uc" -e "$UC_TRY" 2>&1; }
uc_priv_ok() { [ -x "$RT$UCW" ] && [ -x "$RT$UCRT/bin/ucode" ] && [ "$(uc_priv_try)" = UCODE-PASS ]; }
ucode_private() {
	local a v t n line f s u got l
	UCWHY=""
	a=$(uc_arch); v=$(sed -n 's/^VER=//p' "$UC_SUMS" 2>/dev/null | head -n 1)
	if [ -z "$a" ] || [ -z "$v" ] || ! grep -q "^$a " "$UC_SUMS" 2>/dev/null; then UCWHY="安装包里没有这个架构（${a:-认不出来}）的 ucode"; return 1; fi
	l=$(uc_ld) || { UCWHY="找不到系统的动态链接器"; return 1; }
	have_pkg sha256sum || { UCWHY="系统里没有 sha256sum，没法校验下载的文件"; return 1; }
	t=$(mktemp -d /tmp/cmcp_ucp.XXXXXX 2>/dev/null) || { UCWHY="建不了临时目录"; return 1; }
	mkdir -p "$t/root"
	for n in libjson-c5 libubox20230523 libuci20130104 libucode20230711 ucode ucode-mod-fs ucode-mod-uci; do
		line=$(awk -v a="$a" -v n="$n" '$1 == a && $2 == n { print $3, $4; exit }' "$UC_SUMS"); f=${line% *}; s=${line#* }
		[ -n "$line" ] || { UCWHY="安装包里没有 $n（$a）"; rm -rf "$t"; return 1; }
		got=0
		for u in https://mirrors.tuna.tsinghua.edu.cn/openwrt https://mirrors.ustc.edu.cn/openwrt https://downloads.openwrt.org; do
			curl -fsSL --connect-timeout 10 -m 180 -o "$t/$f" "$u/releases/$v/packages/$a/base/$f" 2>/dev/null || continue
			[ "$(sha256sum "$t/$f" | cut -d' ' -f1)" = "$s" ] && { got=1; break; }
		done
		[ $got = 1 ] || { UCWHY="下载 $n 失败（国内镜像和 OpenWrt 官网都没下成，或者文件校验不对）"; rm -rf "$t"; return 1; }
		mkdir -p "$t/x" && tar -xzf "$t/$f" -C "$t/x" ./data.tar.gz 2>/dev/null && tar -xzf "$t/x/data.tar.gz" -C "$t/root" 2>/dev/null \
			|| { UCWHY="解不开下载的 $n"; rm -rf "$t"; return 1; }
		rm -rf "$t/x" "$t/$f"
	done
	# 装到面板自己的目录：bin/ucode、lib/（库）、lib/ucode/（fs、uci 模块）
	rm -rf "$RT$UCRT.new" && mkdir -p "$RT$UCRT.new/bin" "$RT$UCRT.new/lib/ucode" || { UCWHY="建不了 $UCRT"; rm -rf "$t"; return 1; }
	cp -a "$t/root/usr/bin/ucode" "$RT$UCRT.new/bin/" && cp -a "$t/root/usr/lib/ucode/fs.so" "$t/root/usr/lib/ucode/uci.so" "$RT$UCRT.new/lib/ucode/" \
		&& for f in "$t"/root/usr/lib/lib*.so* "$t"/root/lib/lib*.so*; do [ -e "$f" ] && cp -a "$f" "$RT$UCRT.new/lib/"; done \
		|| { UCWHY="复制文件失败（闪存满了？）"; rm -rf "$t" "$RT$UCRT.new"; return 1; }
	rm -rf "$t"
	rm -rf "$RT$UCRT.old"; [ -d "$RT$UCRT" ] && mv "$RT$UCRT" "$RT$UCRT.old"; mv "$RT$UCRT.new" "$RT$UCRT"
	local out; out=$(uc_priv_try)
	if [ "$out" != UCODE-PASS ]; then
		rm -rf "$RT$UCRT"; [ -d "$RT$UCRT.old" ] && mv "$RT$UCRT.old" "$RT$UCRT"
		UCWHY="面板自带的 ucode 在这个固件上也跑不起来（$(echo "$out" | head -n 1 | cut -c1-120)），已经删掉了"
		return 1
	fi
	rm -rf "$RT$UCRT.old"
	mkdir -p "$RT${UCW%/*}"
	printf '#!/bin/sh\n# 面板自带的 ucode（这个固件自带的太旧）：只给面板自己的程序用，系统原有的 ucode 不动\nR=%s\nexec %s --library-path "$R/lib" "$R/bin/ucode" -L "$R/lib/ucode/*.so" -L "/usr/share/ucode/*.uc" "$@"\n' "$UCRT" "$l" > "$RT$UCW.new" \
		&& chmod 755 "$RT$UCW.new" && mv -f "$RT$UCW.new" "$RT$UCW" || { UCWHY="写不了 $UCW"; return 1; }
	return 0
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
# 以前装过面板自带的 ucode、而且还能用：系统的 ucode 就不用管了
UC_PRIV=0
uc_priv_ok && UC_PRIV=1
if [ $UC_PRIV = 0 ]; then
	[ -x /usr/bin/ucode ] || need="$need ucode"
	[ -f /usr/lib/ucode/fs.so ] || need="$need ucode-mod-fs"
	[ -f /usr/lib/ucode/uci.so ] || need="$need ucode-mod-uci"
fi
[ -x /usr/sbin/uhttpd ] || need="$need uhttpd"
have_pkg curl || need="$need curl"
FREE=$(free_mb); FREE=${FREE:-0}
# 认出这台路由器的配置：小内存、单核的机器自动开省资源设置（cloudflared 早点回收内存、面板刷新放慢一点），功能不变
MEMT=$(mem_mb MemTotal); MEMT=${MEMT:-0}
CPUS=$(grep -c '^processor' /proc/cpuinfo 2>/dev/null); CPUS=${CPUS:-1}; [ "$CPUS" -ge 1 ] 2>/dev/null || CPUS=1
LOWHW=""
[ "$MEMT" -gt 0 ] && [ "$MEMT" -le 256 ] && LOWHW="内存小"
[ "$CPUS" -le 1 ] && LOWHW="${LOWHW:+$LOWHW、}单核"
ok "这台路由器：内存 ${MEMT} MB · 闪存剩 ${FREE} MB · ${CPUS} 核${LOWHW:+ → $LOWHW，已自动开启省资源设置（功能不变）}"
# 面板本身加上面这几个小依赖，大约要 5 MB
[ "$FREE" -lt 6 ] && die "闪存只剩 $FREE MB，装面板至少要 6 MB。先删掉用不上的插件（在路由器后台「系统 → 软件包」里卸载），再装一次。路由器上各分区的情况：
$(df_raw)"
if [ -n "$need" ]; then
	say "安装依赖：$need"
	if ! pkg_add $need; then
		# 还缺哪些：ucode 那几个可以从 OpenWrt 官方补；别的（uhttpd、curl）补不了
		uneed="" oneed=""
		[ -x /usr/bin/ucode ] || uneed="$uneed ucode"
		[ -f /usr/lib/ucode/fs.so ] || uneed="$uneed ucode-mod-fs"
		[ -f /usr/lib/ucode/uci.so ] || uneed="$uneed ucode-mod-uci"
		[ -x /usr/sbin/uhttpd ] || oneed="$oneed uhttpd"
		have_pkg curl || oneed="$oneed curl"
		{ [ "$PKGERR" = crash ] || [ "$PKGERR" = nopm ] || [ -n "$oneed" ]; } && pkg_die "${uneed# }${oneed}"
		if [ -n "$uneed" ]; then
			warn "软件源里装不上 ucode（$(pkg_why | head -n 1 | sed 's/：$//')），改从 OpenWrt 官方下载补上（会先核对校验值，只补缺的文件）"
			if ucode_fetch; then
				ok "ucode 已从 OpenWrt 官方补上，校验通过，试运行正常"
			else
				UCWHY1=$UCWHY
				warn "补上的 ucode 跟这个固件自带的对不上（$UCWHY1），改成给面板单独装一套完整的 ucode（系统原有的不动）"
				ucode_private || die "依赖安装失败：${uneed# }。$(pkg_why)。从 OpenWrt 官方补装也不行：$UCWHY1；给面板单独装也不行：$UCWHY。建议换成 ImmortalWrt、iStoreOS 或官方 OpenWrt 再装"
				UC_PRIV=1
				ok "面板自带的 ucode 装好了，校验通过，试运行正常（只给面板用，系统原有的 ucode 没动）"
			fi
		fi
	fi
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
for f in "$SRC"/bin/cmcp-*; do
	# 精简版用不到云端备份：通用安装包里有也不装，不占闪存
	[ "$ED" = lite ] && case "${f##*/}" in cmcp-backup|cmcp-bkcrypt) rm -f "/usr/sbin/${f##*/}"; continue ;; esac
	cp -f "$f" /usr/sbin/; chmod 755 "/usr/sbin/${f##*/}"
done
cp -f "$SRC/init.d/claude-mcp" "$SRC/init.d/cmcp-watchdog" /etc/init.d/
chmod 755 /etc/init.d/claude-mcp /etc/init.d/cmcp-watchdog
cp -f "$SRC/hotplug/90-cmcp-synced" /etc/hotplug.d/ntp/
# 用面板自带的 ucode 时：面板的 ucode 程序改由它来跑（第一行 #!/usr/bin/ucode 换成 #!/usr/libexec/cmcp-ucode）
if [ "$UC_PRIV" = 1 ]; then
	for f in $WWW/cgi-bin/mcp /usr/sbin/cmcp-*; do
		[ -f "$f" ] && head -n 1 "$f" | grep -qx '#!/usr/bin/ucode' && sed -i "1s|^#!/usr/bin/ucode\$|#!$UCW|" "$f"
	done
fi
# 卸载脚本也放一份到路由器上（安装包解压在内存里，装完就删了）：以后直接运行 cmcp-uninstall
[ -f "$SRC/../uninstall.sh" ] && cp -f "$SRC/../uninstall.sh" /usr/sbin/cmcp-uninstall && chmod 755 /usr/sbin/cmcp-uninstall
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
UCX=ucode; [ "$UC_PRIV" = 1 ] && UCX=$UCW
$UCX -e 'let fs = require("fs"), f = ARGV[0], c = json(fs.readfile(f)); if (ARGV[1] == "0") c.ai = false; else delete c.ai; if (length(ARGV[2] ?? "") >= 16) c.ckey = ARGV[2]; fs.writefile(f, sprintf("%.J\n", c));' $D/config.json "$AI" "$CKEY" \
	|| die "写入 config.json 失败"
# 路由器自己的小工具调用面板接口用的钥匙（托管版不用输登录码）
[ -s $D/local.key ] || rnd 40 > $D/local.key
# 原版页面的门禁钥匙：6.0 起换登录密钥、移除手机时都会换；从 6.0 以前升上来先换一次（以前移除的手机手上可能还留着旧的）
if [ ! -s $D/luci_key ] || [ ! -e $D/luci_key.v6 ]; then rnd 32 > $D/luci_key; : > $D/luci_key.v6; fi
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
				warn "这台路由器原来的托管网址（$SUB0）已经被删除了，要在官网拿一个新的安装码重新开通（路由器上的设置都会保留，网址会换成新的）"
				# 一键更新这类不问问题、又没给邀请码的：先什么都不动，免得删了开通信息又开通不了
				if [ -n "$INV" ] || [ "$YES" != 1 ]; then rm -f $D/hub.conf
				else warn "这次没有安装码，先保留原来的设置。在官网「装新路由器」里拿到安装码后，复制那里的安装命令运行"; fi ;;
		esac
	fi
	if [ -s $D/hub.conf ] && grep -q '^PKEY=' $D/cloud.conf 2>/dev/null; then
		ok "已经开通过托管服务，保留现在的网址"
	else
		nm=$(uci -q get system.@system[0].hostname 2>/dev/null | tr -cd 'A-Za-z0-9._-' | cut -c1-40 || true)
		md=$(cat /tmp/sysinfo/model 2>/dev/null | tr -cd 'A-Za-z0-9 ._()-' | cut -c1-60 || true)
		jf() { jsonfilter -s "$R" -e "@.$1" 2>/dev/null || true; }
		SUB=""; try=0
		# 5.2：托管版要先在官网注册账号，在官网拿「安装码」（领试用，或者用邀请码兑换），官网给的安装命令里已经带着它
		if [ -z "$INV" ]; then
			echo
			echo "  托管版要先在官网注册账号（免费）：用手机打开"
			echo
			echo "     $HUB/app"
			echo
			echo "  注册后在「添加路由器 → 装新路由器」里领免费试用，或者填邀请码兑换，"
			echo "  那里会给你一条带着安装码的安装命令：复制到这里运行，装好自动加到你的账号里。"
			echo "  已经拿到安装码的，也可以直接粘贴到下面。"
			echo
		fi
		while [ -z "$SUB" ]; do
			try=$((try+1))
			[ -n "$INV" ] || ask INV "安装码（官网「装新路由器」里拿）" "" 1
			inv=$(printf '%s' "$INV" | tr -cd 'A-Za-z0-9')
			[ -n "$inv" ] || die "托管版需要安装码：手机打开 $HUB/app 注册账号，在「添加路由器 → 装新路由器」里拿，复制那里的安装命令运行"
			say "向托管服务申请专属网址"
			R=$(curl -s -m 90 -X POST -H 'Content-Type: application/json' -d "{\"invite\":\"$inv\",\"name\":\"$nm\",\"model\":\"$md\"}" "$HUB/api/register" || true)
			SUB=$(jf sub)
			[ -n "$SUB" ] && break
			e=$(jf error)
			# 邀请码输错了（或者过期、用完）：一共给三次机会
			case "$e" in 邀请码*|安装码*) if [ "$YES" != 1 ] && [ $try -lt 3 ]; then warn "$e"; INV=""; continue; fi ;; esac
			die "开通失败：${e:-连不上托管服务 $HUB}"
		done
		HOST=$(jf host)
		(umask 077
		 printf '%s' "$(jf token)" > $D/tunnel_token
		 printf 'URL=%s\nRKEY=%s\nTKEY=%s\nPKEY=%s\n' "$(jf url)" "$(jf rkey)" "$(jf tkey)" "$(jf pkey)" > $D/cloud.conf
		 printf 'HUB=%s\nSUB=%s\n' "$HUB" "$SUB" > $D/hub.conf)
		printf '%s\n' "$HOST" > $D/hostname
		ok "开通成功：https://$HOST"
		[ "$(jf bound)" = true ] && { BOUND=1; ok "路由器已经自动加到你的官网账号里，你是它的主账号"; }
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
sed -i '/\/usr\/sbin\/cmcp-backup\|\/usr\/sbin\/cmcp-daily\|\/usr\/sbin\/cmcp-route\|\/usr\/sbin\/cmcp-ann/d' $CR
echo '0 9 * * * /usr/sbin/cmcp-daily >/dev/null 2>&1' >> $CR
# 面板走直连还是走代理，自动选能打开的那条
echo '*/3 * * * * /usr/sbin/cmcp-route >/dev/null 2>&1' >> $CR
# 公告：每 30 分钟取一次（脚本里再随机等 0–10 分钟，大家错开），重要的推送到手机
echo '*/30 * * * * /usr/sbin/cmcp-ann >/dev/null 2>&1' >> $CR
[ "$ED" = full ] && echo '7 4 * * * /usr/sbin/cmcp-backup auto >/dev/null 2>&1' >> $CR
/etc/init.d/cron enable >/dev/null 2>&1 || true
/etc/init.d/cron restart >/dev/null 2>&1 || true

# ---------- 升级系统时保留 ----------
[ "$UC_PRIV" = 1 ] && for p in $UCRT/ $UCW; do grep -qxF "$p" /etc/sysupgrade.conf 2>/dev/null || echo "$p" >> /etc/sysupgrade.conf; done
for p in /etc/claude-mcp/ /www-claude-mcp/ /usr/share/ucode/cmcp/ /etc/init.d/claude-mcp /etc/init.d/cmcp-watchdog /etc/hotplug.d/ntp/90-cmcp-synced \
	/usr/sbin/cmcp-ann /usr/sbin/cmcp-autosw /usr/sbin/cmcp-backup /usr/sbin/cmcp-bkcrypt /usr/sbin/cmcp-lfull /usr/sbin/cmcp-daily /usr/sbin/cmcp-logincode /usr/sbin/cmcp-notify /usr/sbin/cmcp-pair /usr/sbin/cmcp-pause /usr/sbin/cmcp-proxy /usr/sbin/cmcp-route /usr/sbin/cmcp-traffic /usr/sbin/cmcp-tunbypass /usr/sbin/cmcp-update /usr/sbin/cmcp-watchdog /usr/sbin/cmcp-cfd /usr/sbin/cmcp-gz /usr/sbin/cmcp-uninstall; do
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
# 公告：先取一次（记下从现在开始，以前的公告不推送到手机；面板「通知」里马上就能看到）
( /usr/sbin/cmcp-ann now >/dev/null 2>&1 & ) 2>/dev/null || true
sleep 3
code=$(curl -s -m 6 -o /dev/null -w '%{http_code}' http://127.0.0.1:18765/panel/manifest.json || true)
[ "$code" = 200 ] && ok "面板服务已运行" || warn "面板服务没响应（HTTP $code），看看 logread | grep uhttpd"
# 面板压缩着存（省闪存，发给手机也更快）：确认这台路由器上真的能用，能用才删掉没压缩的那份；不能用就照旧
if [ -f $WWW/panel/index.zh ]; then
	zok=0
	if command -v gzip >/dev/null 2>&1 && [ -x /usr/sbin/cmcp-gz ]; then
		curl -s -m 8 -H 'Accept-Encoding: gzip' -o /tmp/cmcp_zchk.gz http://127.0.0.1:18765/panel/ 2>/dev/null
		gzip -dc /tmp/cmcp_zchk.gz 2>/dev/null | grep -q 'name="panel-ver"' && zok=1
		[ $zok = 1 ] && { curl -s -m 8 http://127.0.0.1:18765/panel/ 2>/dev/null | grep -q 'name="panel-ver"' || zok=0; }
		rm -f /tmp/cmcp_zchk.gz
	fi
	if [ $zok = 1 ]; then
		# 有人直接打开 index.html（旧书签）：跳回面板
		printf '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./"><script>location.replace("./"+location.search+location.hash)</script><a href="./">打开面板</a>\n' > $WWW/panel/index.html
		ok "面板压缩存放（省闪存约 $(( ($(wc -c < "$SRC/www/panel/index.html") - $(wc -c < $WWW/panel/index.zh)) / 1024 )) KB）"
	else
		rm -f $WWW/panel/index.zh
	fi
fi

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
	# 5.2 托管版：路由器已经在官网账号里了（用官网给的安装码装的），回官网点「打开面板」就行，不用抄任何地址和码
	echo
	if [ "$BOUND" = 1 ]; then
		echo "✅ 这台路由器已经加到你的官网账号里，你是它的主账号。"
		echo
		echo "👉 接下来：回到手机上的官网「我的路由器」（页面会自动刷新），"
		echo "   点这台路由器的「打开面板」就进去了，不用输任何码。"
	else
		echo "👉 接下来：手机打开官网，在「我的路由器」里点这台路由器的「打开面板」。"
		echo
		echo "   官网里还没有这台路由器的话：在这里运行 cmcp-pair 拿一个配对码，"
		echo "   在官网「添加路由器 → 装新路由器 → 路由器已经装好了」里填上，就加到你的账号里了。"
	fi
	echo
	echo "  官网账号页：$HUB/app"
	echo "  （打开面板、申请续期、加家里人、查反馈都在这里，建议收藏）"
	echo
	echo "  换手机、清了浏览器：在新手机上登录官网，点「打开面板」就行。"
	echo "  家里人也要用：在面板「我的主页 → 家人」里给他生成加入码。"
	echo "  面板打开后点浏览器菜单「添加到主屏幕」，以后就像 App 一样打开。"
	if [ -n "$SVC_END" ]; then
		echo
		echo "⏳ 托管服务用到 $SVC_END。快到期时在官网账号页点「申请续期」，审核通过自动续上，不用重装。"
	fi
	echo
	echo "托管版的推送、云端备份、断电断网判断都已经开通，不用另外设置。"
	echo
	echo "---------- 备用信息（一般用不到） ----------"
	echo "面板地址：https://$H/panel/（要从官网「打开面板」进去才能登录）"
	[ "$AI" = 1 ] && echo "Claude 连接器地址（在 Claude「设置 → 连接器 → 添加自定义连接器」里填，只有你自己能看）：https://$H/cgi-bin/mcp/$CKEY"
	echo "官网打不开、急着用：在这里运行 cmcp-logincode 拿一个应急登录码，在面板「官网打不开、急着用？」里输入"
else
	echo
	echo "手机面板：https://$H/panel/"
	echo
	echo "登录地址（第一次打开面板时粘贴）："
	echo "  https://$H/cgi-bin/mcp/$TOKEN"
	echo
	echo "或者在手机上直接打开这个链接，自动登录（同样不要发给别人）："
	echo "  https://$H/panel/#login=$TOKEN"
	echo "以后添加别的手机：面板里「我的主页 → 敏感信息」（输路由器后台密码验证）→「添加新手机」扫码就行。"
	# 官方发布的安装包里写着官网地址（PKG_REPORT）：自建版也告诉用户去哪看教程、反馈问题
	OFF=${PKG_REPORT%/}
	case "$OFF" in https://*)
		echo
		echo "官网（使用教程、反馈问题、查处理进度）：$OFF"
		echo "  也可以在官网注册账号，在「添加路由器 → 自建版（网址）」里记下这个面板网址，换手机时好找。" ;;
	esac
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
echo "卸载：cmcp-uninstall"
# 安装包是解压在内存（/tmp）里的：装完就删掉，省内存（一键更新用的临时目录由更新程序自己删）
case "$SRC" in
	/tmp/cmcp_upd/*) ;;
	/tmp/?*/src)
		PD=${SRC%/src}
		if [ -f "$PD/install.sh" ] && [ -f "$PD/EDITION" ]; then
			[ -f /tmp/p.tar.gz ] && tar -tzf /tmp/p.tar.gz 2>/dev/null | head -n 1 | grep -q '^openwrt-claude-panel/' && rm -f /tmp/p.tar.gz
			rm -rf "$PD"
			echo "（安装用的临时文件已删除，省内存；当前目录已不存在，可以运行 cd / ）"
		fi ;;
esac
