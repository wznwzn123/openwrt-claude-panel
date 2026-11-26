#!/bin/sh
# 一键更新的签名校验测试（不需要真路由器，用 file:// 当下载地址，假的安装包装的时候故意失败、马上退回，所以不会真装任何东西）
# 用法：sh tests/update/sig.sh      每项一行，最后打印「通过 n/n」或「失败 n/n」
# 要有 node（生成临时测试密钥、签名、模拟 usign）和 openssl 3
cd "$(dirname "$0")/../.." || exit 1
REPO=$(pwd)
T=$(mktemp -d) || exit 1
trap 'rm -rf "${T:?}"' EXIT
pass=0; fail=0
ok() { if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "✓ $1"; else fail=$((fail + 1)); echo "✗ $1  ← $3"; fi; }

# 临时测试密钥（不是发布用的那把）
TK=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))')
eval "$(RELEASE_SIGN_KEY_V6=$TK node tools/sign.mjs --consts | sed 's/^/K_/')"
TK2=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))')

# 假路由器：现在装的是 ai-full 1.0
mkdir -p "$T/root/etc/claude-mcp"
printf 'CODE=ai-full\nVER=1.0\n' > "$T/root/etc/claude-mcp/version"
# 假安装包：install.sh 直接失败（这样一键更新会马上退回，证明前面的签名和校验都过了）
mk() { # mk 目录 内容标记
	mkdir -p "$1/p/openwrt-claude-panel"
	printf 'exit 1 # %s\n' "$2" > "$1/p/openwrt-claude-panel/install.sh"
	printf 'PKG_VER=9.9.9\n' > "$1/p/openwrt-claude-panel/EDITION"
	tar -C "$1/p" -czf "$1/openwrt-claude-panel-ai-full.tar.gz" openwrt-claude-panel && rm -rf "$1/p"
	(cd "$1" && sha256sum *.tar.gz > SHA256SUMS)
}
# 5.3.x 的路由器认旧密钥的签名（SHA256SUMS.sig，tools/sign.mjs --old）
sg() { (cd "$1" && RELEASE_SIGN_KEY=${2:-$TK} CMCP_SIGN_ANY=1 node "$REPO/tools/sign.mjs" --old SHA256SUMS >/dev/null); }
ST=$T/st.json
run() { # run 官网目录 GitHub目录 [额外环境变量...]
	b=$1; g=$2; shift 2
	rm -f "$ST"; rmdir /tmp/cmcp_update.lock 2>/dev/null
	env CMCP_ROOT="$T/root" CMCP_DL="file://$b" CMCP_GH="file://$g" CMCP_ST="$ST" CMCP_NOSVC=1 \
		CMCP_UPUB="$K_UPUB" CMCP_PPUB="$K_PPUB" CMCP_STSIG="$K_STSIG" "$@" sh "$REPO/src/bin/cmcp-update" run >/dev/null 2>&1
	sed -n 's/.*"state":"\([a-z]*\)".*/\1/p' "$ST"
}
msg() { sed -n 's/.*"msg":"\([^"]*\)".*/\1/p' "$ST"; }
log() { cat /tmp/cmcp_update.log 2>/dev/null; }

# 1. 官网和 GitHub 都是好的：验签过了，开始装（假安装包装失败 → 退回）
mk "$T/good" good; sg "$T/good"
s=$(run "$T/good" "$T/good")
ok "签名对：验过了、开始安装（openssl 验签）" $([ "$s" = rolledback ] && log | grep -q '验签工具：v_ossl' ; echo $?) "$s $(msg)"
# 2. 官网被人改了：换了安装包、重算了校验值，但没有私钥 → 签名对不上；改从 GitHub 下载好的
mk "$T/evil" evil; cp "$T/good/SHA256SUMS.sig" "$T/evil/"
s=$(run "$T/evil" "$T/good")
ok "官网的安装包被换了（校验值也重算了）：签名对不上，不用它，改从 GitHub 下好的" $([ "$s" = rolledback ] && log | grep -q "签名不对：file://$T/evil" ; echo $?) "$s $(msg) $(log | tail -3)"
# 3. 两边都是假的：不装
s=$(run "$T/evil" "$T/evil")
ok "两边签名都不对：不装，提示签名不对" $([ "$s" = failed ] && msg | grep -q '签名不对' ; echo $?) "$s $(msg)"
# 4. 用别的密钥签的（攻击者自己的私钥）：不装
mk "$T/other" other; sg "$T/other" "$TK2"
s=$(run "$T/other" "$T/other")
ok "用别的私钥签的：不装" $([ "$s" = failed ] && msg | grep -q '签名不对' ; echo $?) "$s $(msg)"
# 5. 没有签名文件（攻击者删掉了）：不装
mk "$T/nosig" nosig
s=$(run "$T/nosig" "$T/nosig")
ok "没有签名文件：不装，提示没有签名" $([ "$s" = failed ] && msg | grep -q '没有签名' ; echo $?) "$s $(msg)"
# 6. 官网没签名（比如官网还没更新到能转发签名的版本）、GitHub 有：用 GitHub 的
s=$(run "$T/nosig" "$T/good")
ok "官网拿不到签名、GitHub 有：用 GitHub 的" $([ "$s" = rolledback ] && log | grep -q "没有签名：file://$T/nosig" ; echo $?) "$s $(msg)"
# 7. 签名对，但安装包下载坏了（跟校验值对不上）：不装
mkdir -p "$T/torn"; cp "$T/good/SHA256SUMS" "$T/good/SHA256SUMS.sig" "$T/torn/"; head -c 100 "$T/good/openwrt-claude-panel-ai-full.tar.gz" > "$T/torn/openwrt-claude-panel-ai-full.tar.gz"
s=$(run "$T/torn" "$T/torn")
ok "签名对但安装包不完整：不装，提示校验没通过" $([ "$s" = failed ] && msg | grep -q '校验没通过' ; echo $?) "$s $(msg)"
# 8. 有 usign 的路由器（OpenWrt 一般都有）：用 usign 验签
mkdir -p "$T/bin"; printf '#!/bin/sh\nexec node "%s/tests/update/fake-usign.mjs" "$@"\n' "$REPO" > "$T/bin/usign"; chmod 755 "$T/bin/usign"
s=$(run "$T/evil" "$T/good" PATH="$T/bin:$PATH")
ok "有 usign：用 usign 验签，假的照样认出来" $([ "$s" = rolledback ] && log | grep -q '验签工具：v_usign' && log | grep -q "签名不对：file://$T/evil" ; echo $?) "$s $(log | head -3)"
# 9. usign 是坏的（什么都说对）：自检认出来，不用它，改用 openssl
mkdir -p "$T/bin2"; printf '#!/bin/sh\nexit 0\n' > "$T/bin2/usign"; chmod 755 "$T/bin2/usign"
s=$(run "$T/evil" "$T/good" PATH="$T/bin2:$PATH")
ok "usign 是坏的（假的也说对）：自检认出来，改用 openssl" $([ "$s" = rolledback ] && log | grep -q '验签工具：v_ossl' && log | grep -q "签名不对：file://$T/evil" ; echo $?) "$s $(log | head -3)"
# 10. 没有能用的验签工具（自检过不了）：跟以前一样只按 SHA256 校验，照样能更新（不影响老路由器）
s=$(run "$T/nosig" "$T/nosig" CMCP_STSIG=RWQAAAAAAAAAAA==)
ok "没有能用的验签工具：只按 SHA256 校验，照样能更新，日志里写明" $([ "$s" = rolledback ] && log | grep -q '只按 SHA256 校验' ; echo $?) "$s $(msg)"
# 11. 已经是最新版：签名过了才说「已经是最新版」
printf 'CODE=ai-full\nVER=9.9.9\n' > "$T/root/etc/claude-mcp/version"
s=$(run "$T/good" "$T/good")
ok "已经是最新版：照样先验签，然后说已经是最新" $([ "$s" = done ] && msg | grep -q '已经是最新版' ; echo $?) "$s $(msg)"
s=$(run "$T/evil" "$T/evil")
ok "已经是最新版、但下到的是假的：不装也不说「最新」" $([ "$s" = failed ] ; echo $?) "$s $(msg)"
# 安全加固（第二轮）：防回滚——路由器现在是 9.9.9，下载地址被换成以前发布过、签名也对的 1.0：不装
mkdir -p "$T/old/p/openwrt-claude-panel"; printf 'exit 1 # old\n' > "$T/old/p/openwrt-claude-panel/install.sh"; printf 'PKG_VER=1.0\n' > "$T/old/p/openwrt-claude-panel/EDITION"
tar -C "$T/old/p" -czf "$T/old/openwrt-claude-panel-ai-full.tar.gz" openwrt-claude-panel && rm -rf "$T/old/p"; (cd "$T/old" && sha256sum *.tar.gz > SHA256SUMS); sg "$T/old"
s=$(run "$T/old" "$T/old")
ok "防回滚：签名对、但版本比现在旧（1.0 < 9.9.9）：不装，说明是旧版本" $([ "$s" = failed ] && msg | grep -q '旧版本' && ! log | grep -q '正在安装' ; echo $?) "$s $(msg)"
rm -f "$ST"; rmdir /tmp/cmcp_update.lock 2>/dev/null
env CMCP_ROOT="$T/root" CMCP_DL="file://$T/old" CMCP_GH="file://$T/old" CMCP_ST="$ST" CMCP_NOSVC=1 CMCP_UPUB="$K_UPUB" CMCP_PPUB="$K_PPUB" CMCP_STSIG="$K_STSIG" sh "$REPO/src/bin/cmcp-update" run force >/dev/null 2>&1
s=$(sed -n 's/.*"state":"\([a-z]*\)".*/\1/p' "$ST")
ok "防回滚：强制更新也不装旧版本" $([ "$s" = failed ] && msg | grep -q '旧版本' ; echo $?) "$s $(msg)"
s=$(run "$T/old" "$T/old" CMCP_ALLOW_OLD=1)
ok "防回滚：在路由器终端明确要退回（CMCP_ALLOW_OLD=1）：可以装" $([ "$s" = rolledback ] ; echo $?) "$s $(msg)"
# 12. 发布用的签名脚本：私钥跟脚本里写死的公钥对不上就不签（免得发出去路由器都验不过）
mk "$T/rel" rel
(cd "$T/rel" && RELEASE_SIGN_KEY=$TK node "$REPO/tools/sign.mjs" --old SHA256SUMS >/dev/null 2>&1); r=$?
ok "发布签名：旧私钥跟一键更新脚本里的公钥对不上 → 报错、不签" $([ $r != 0 ] && [ ! -f "$T/rel/SHA256SUMS.sig" ] ; echo $?) "rc=$r"
(cd "$T/rel" && RELEASE_SIGN_KEY_V6=$TK node "$REPO/tools/sign.mjs" SHA256SUMS >/dev/null 2>&1); r=$?
ok "发布签名：新私钥跟 6.0 的公钥对不上 → 报错、不签 .sig2" $([ $r != 0 ] && [ ! -f "$T/rel/SHA256SUMS.sig2" ] ; echo $?) "rc=$r"
(cd "$T/rel" && RELEASE_SIGN_KEY= node "$REPO/tools/sign.mjs" --old SHA256SUMS >/dev/null 2>&1); r=$?
ok "发布签名：没设置私钥 → 报错" $([ $r != 0 ] ; echo $?) "rc=$r"
# 5.3.0：尝鲜版（指定版本，从官网 /dl/t/版本/ 或 GitHub 这个版本下载；照样验旧密钥的签名）
runch() { # runch 官网目录 GitHub发布目录 参数...
	b=$1; g=$2; shift 2
	rm -f "$ST"; rmdir /tmp/cmcp_update.lock 2>/dev/null
	env CMCP_ROOT="$T/root" CMCP_DL="file://$b" CMCP_GHR="file://$g" CMCP_ST="$ST" CMCP_NOSVC=1 \
		CMCP_UPUB="$K_UPUB" CMCP_PPUB="$K_PPUB" CMCP_STSIG="$K_STSIG" sh "$REPO/src/bin/cmcp-update" run "$@" >/dev/null 2>&1
	sed -n 's/.*"state":"\([a-z]*\)".*/\1/p' "$ST"
}
printf 'CODE=ai-full\nVER=1.0\n' > "$T/root/etc/claude-mcp/version"
s=$(runch "$T/none" "$T/none" beta 'v9.9.9;reboot')
ok "尝鲜版：版本号不对（混了别的命令）：不装" $([ "$s" = failed ] && msg | grep -q '版本号不对' ; echo $?) "$s $(msg)"
mkdir -p "$T/bh/t" "$T/bg/download"; cp -r "$T/good" "$T/bh/t/v9.9.9"
s=$(runch "$T/bh" "$T/bg" beta v9.9.9)
ok "尝鲜版：从官网 /dl/t/v9.9.9/ 下载，验签过了开始装" $([ "$s" = rolledback ] && log | grep -q '验签工具' ; echo $?) "$s $(msg)"
rm -rf "$T/bh/t/v9.9.9"; cp -r "$T/good" "$T/bg/download/v9.9.9"
s=$(runch "$T/bh" "$T/bg" beta v9.9.9)
ok "尝鲜版：官网没有，直连 GitHub 这个版本下载" $([ "$s" = rolledback ] ; echo $?) "$s $(msg)"
rm -rf "$T/bg/download/v9.9.9"; cp -r "$T/evil" "$T/bg/download/v9.9.9"
s=$(runch "$T/bh" "$T/bg" beta v9.9.9)
ok "尝鲜版：签名不对照样不装" $([ "$s" = failed ] ; echo $?) "$s $(msg)"
# start 把 beta 和版本号传给后台（面板点「装尝鲜版」走的是 start）
grep -q 'cmcp-update.run run "$2" "$3"' "$REPO/src/bin/cmcp-update"; ok "start 把尝鲜参数传给后台" $? ""

# 13. 脚本里写死的测试签名跟公钥是一对（换密钥时忘了改其中一个，自检就会一直过不了）
eval "$(grep -E '^(UPUB|PPUB|STSIG)=' src/bin/cmcp-update | sed 's/=\${CMCP_[A-Z]*:-/=/; s/}$//; s/^/R_/')"
mkdir -p "$T/st"; printf 'cmcp release key selftest\n' > "$T/st/m"; printf 'untrusted comment: x\n%s\n' "$R_STSIG" > "$T/st/s"
printf -- '-----BEGIN PUBLIC KEY-----\n%s\n-----END PUBLIC KEY-----\n' "$R_PPUB" > "$T/st/p.pem"; printf 'untrusted comment: x\n%s\n' "$R_UPUB" > "$T/st/p.pub"
sed -n 2p "$T/st/s" | openssl base64 -d -A | tail -c 64 > "$T/st/s.bin"
openssl pkeyutl -verify -pubin -inkey "$T/st/p.pem" -rawin -in "$T/st/m" -sigfile "$T/st/s.bin" >/dev/null 2>&1; a=$?
node tests/update/fake-usign.mjs -V -q -m "$T/st/m" -p "$T/st/p.pub" -x "$T/st/s"; b=$?
ok "发布用的公钥：usign 写法、openssl 写法、测试签名三个是一套" $([ $a = 0 ] && [ $b = 0 ] ; echo $?) "openssl=$a usign=$b"

rm -rf /tmp/cmcp_upd /tmp/cmcp_upd_backup.tgz
[ $fail = 0 ] && echo "通过 $pass/$pass" || echo "失败 $fail/$((pass + fail))"
[ $fail = 0 ]
