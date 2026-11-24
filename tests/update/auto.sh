#!/bin/sh
# 6.0 第 86 项：必须更新每天夜里自动装（cmcp-update auto）。不需要真路由器：
# 版本接口和下载地址都用 file://，假安装包装的时候故意失败、马上退回，所以不会真装任何东西
# 用法：sh tests/update/auto.sh      每项一行，最后打印「通过 n/n」或「失败 n/n」
# 要有 node（生成临时测试密钥、签名）和 openssl 3
cd "$(dirname "$0")/../.." || exit 1
REPO=$(pwd)
T=$(mktemp -d) || exit 1
trap 'rm -rf "${T:?}"; rm -f /tmp/cmcp-update.run; rmdir /tmp/cmcp_update.lock 2>/dev/null' EXIT
pass=0; fail=0
ok() { if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "✓ $1"; else fail=$((fail + 1)); echo "✗ $1  ← $3"; fi; }

TK=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))')
eval "$(RELEASE_SIGN_KEY_V6=$TK node tools/sign.mjs --consts | sed 's/^/K_/')"
D=$T/root/etc/claude-mcp
mkdir -p "$D"
# 假安装包 v9.9.9：install.sh 直接失败（证明下载、验签、校验都过了，走到了安装，又安全退回）
mkdir -p "$T/dl/p/openwrt-claude-panel"
printf 'exit 1\n' > "$T/dl/p/openwrt-claude-panel/install.sh"
printf 'PKG_VER=9.9.9\n' > "$T/dl/p/openwrt-claude-panel/EDITION"
tar -C "$T/dl/p" -czf "$T/dl/openwrt-claude-panel-ai-full.tar.gz" openwrt-claude-panel && rm -rf "$T/dl/p"
(cd "$T/dl" && sha256sum *.tar.gz > SHA256SUMS && RELEASE_SIGN_KEY_V6=$TK CMCP_SIGN_ANY=1 node "$REPO/tools/sign.mjs" SHA256SUMS >/dev/null)
ST=$T/st.json
# ver 现在的版本；api 版本接口返回的 JSON
setv() { printf 'CODE=ai-full\nVER=%s\n' "$1" > "$D/version"; }
api() { printf '%s' "$1" > "$T/ver.json"; }
# 跑一次 auto，等后台的更新跑完（最多 30 秒），输出最终状态（没开始就是空）
auto() {
	rm -f "$ST"; rmdir /tmp/cmcp_update.lock 2>/dev/null
	env CMCP_ROOT="$T/root" CMCP_DL="file://$T/dl" CMCP_GH="file://$T/dl" CMCP_ST="$ST" CMCP_NOSVC=1 CMCP_VER_URL="file://$T/ver.json" \
		CMCP_UPUB="$K_UPUB" CMCP_PPUB="$K_PPUB" CMCP_STSIG="$K_STSIG" "$@" sh "$REPO/src/bin/cmcp-update" auto >/dev/null 2>&1
	i=0
	while [ $i -lt 60 ]; do
		s=$(sed -n 's/.*"state":"\([a-z]*\)".*/\1/p' "$ST" 2>/dev/null)
		case "$s" in ''|done|failed|rolledback) [ -d /tmp/cmcp_update.lock ] || break ;; esac
		sleep 0.5; i=$((i + 1))
	done
	sed -n 's/.*"state":"\([a-z]*\)".*/\1/p' "$ST" 2>/dev/null
}
fails() { cat "$D/autoupd_fail" 2>/dev/null; }

setv 6.0.0
api '{"ok":true,"version":"9.9.9","force":true,"min":""}'
s=$(auto)
ok "必须更新、现在的版本旧：自动开始更新（走到安装，假包失败后退回）" $([ "$s" = rolledback ] ; echo $?) "状态：$s"
ok "自动更新没成功：记下这个版本失败 1 次" $([ "$(fails)" = "9.9.9 1" ] ; echo $?) "$(fails)"
s=$(auto)
ok "第二天再试：失败 2 次" $([ "$s" = rolledback ] && [ "$(fails)" = "9.9.9 2" ] ; echo $?) "$s / $(fails)"
s=$(auto); s=$(auto)
ok "同一个版本失败 3 次以后不再自动试" $([ -z "$s" ] && [ "$(fails)" = "9.9.9 3" ] ; echo $?) "状态：$s / $(fails)"
api '{"ok":true,"version":"9.9.9","force":true,"min":"","next":1}'
printf '9.9.8 5\n' > "$D/autoupd_fail"
s=$(auto)
ok "换了新的必须更新版本：失败次数从头算，照样自动试" $([ "$s" = rolledback ] && [ "$(fails)" = "9.9.9 1" ] ; echo $?) "$s / $(fails)"
rm -f "$D/autoupd_fail"

api '{"ok":true,"version":"9.9.9","force":false,"min":""}'
s=$(auto)
ok "不是必须更新：不自动装（普通更新等用户点）" $([ -z "$s" ] ; echo $?) "状态：$s"
api '{"ok":true,"version":"9.9.9","force":false,"min":"6.5.0"}'
s=$(auto)
ok "低于「最低版本」也算必须更新：自动装" $([ "$s" = rolledback ] ; echo $?) "状态：$s"
rm -f "$D/autoupd_fail"
api '{"ok":true,"version":"6.0.0","force":true,"min":""}'
s=$(auto)
ok "已经是最新版：什么都不做" $([ -z "$s" ] ; echo $?) "状态：$s"
setv 9.9.10
api '{"ok":true,"version":"9.9.9","force":true,"min":""}'
s=$(auto)
ok "现在用的比正式版新（尝鲜版）：不会被换回去" $([ -z "$s" ] ; echo $?) "状态：$s"
setv dev
s=$(auto)
ok "现在的版本号不是数字（开发版）：不管" $([ -z "$s" ] ; echo $?) "状态：$s"
setv 6.0.0
: > "$D/autoupd_off"
s=$(auto)
ok "在面板里关掉了（autoupd_off）：不自动装" $([ -z "$s" ] ; echo $?) "状态：$s"
rm -f "$D/autoupd_off"
mkdir /tmp/cmcp_update.lock
env CMCP_ROOT="$T/root" CMCP_ST="$ST" CMCP_NOSVC=1 CMCP_VER_URL="file://$T/ver.json" sh "$REPO/src/bin/cmcp-update" auto >/dev/null 2>&1
ok "用户自己正在更新（有锁）：不插手" $([ ! -s "$ST" ] || ! grep -q queued "$ST" ; echo $?)
rmdir /tmp/cmcp_update.lock
api 'not json'
s=$(auto)
ok "版本接口回的不对：什么都不做" $([ -z "$s" ] ; echo $?) "状态：$s"
rm -f "$T/ver.json"
s=$(auto)
ok "连不上官网：什么都不做" $([ -z "$s" ] ; echo $?) "状态：$s"
# 用户自己点的一键更新失败：不算进自动更新的失败次数
rm -f "$D/autoupd_fail"; rm -f "$ST"
env CMCP_ROOT="$T/root" CMCP_DL="file://$T/dl" CMCP_GH="file://$T/dl" CMCP_ST="$ST" CMCP_NOSVC=1 \
	CMCP_UPUB="$K_UPUB" CMCP_PPUB="$K_PPUB" CMCP_STSIG="$K_STSIG" sh "$REPO/src/bin/cmcp-update" run >/dev/null 2>&1
ok "用户自己点的更新失败：不记自动更新的失败" $([ ! -e "$D/autoupd_fail" ] && grep -q rolledback "$ST" ; echo $?) "$(cat "$ST")"
ok "安装脚本：加了每天夜里 3–5 点的自动更新定时任务，重装时先删旧的" $(grep -q 'cmcp-update auto' install.sh && grep -q '% 3 + 3 )) \* \* \* /usr/sbin/cmcp-update auto' install.sh && grep -q 'cmcp-compat\\|\\/usr\\/sbin\\/cmcp-update/d' install.sh ; echo $?)

if [ $fail = 0 ]; then echo "通过 $pass/$pass"; else echo "失败 $fail/$((pass + fail))"; exit 1; fi
