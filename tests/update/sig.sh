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
sg() { (cd "$1" && RELEASE_SIGN_KEY_V6=${2:-$TK} CMCP_SIGN_ANY=1 node "$REPO/tools/sign.mjs" SHA256SUMS >/dev/null); }
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
mk "$T/evil" evil; cp "$T/good/SHA256SUMS.sig2" "$T/evil/"
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
mkdir -p "$T/torn"; cp "$T/good/SHA256SUMS" "$T/good/SHA256SUMS.sig2" "$T/torn/"; head -c 100 "$T/good/openwrt-claude-panel-ai-full.tar.gz" > "$T/torn/openwrt-claude-panel-ai-full.tar.gz"
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
# 10. 6.0 第 10 项：一律验签。没有能用的验签工具（这里用一个总是失败的假 openssl 挡住本机的 openssl）
mkdir -p "$T/nossl" "$T/inst"; printf '#!/bin/sh\nexit 1\n' > "$T/nossl/openssl"; chmod 755 "$T/nossl/openssl"
#   a. 没有软件包管理器、装不了：不更新，说清楚原因（不再只按 SHA256 校验就装）
s=$(run "$T/good" "$T/good" PATH="$T/nossl:$T/inst:$PATH")
ok "没有验签工具、也装不了：不更新，说明原因和怎么办" $([ "$s" = failed ] && msg | grep -q '为了安全没有更新' && msg | grep -q 'usign' && ! log | grep -q '只按 SHA256' ; echo $?) "$s $(msg)"
#   b. 有 opkg：自动装上 usign，验签通过后照常更新；假的安装包照样认出来
printf '#!/bin/sh\necho "opkg $*" >> "%s/opkg.log"\n[ "$1" = install ] && [ "$2" = usign ] && printf "#!/bin/sh\\nexec node %s/tests/update/fake-usign.mjs \\"\\$@\\"\\n" > "%s/inst/usign" && chmod 755 "%s/inst/usign"\nexit 0\n' "$T" "$REPO" "$T" "$T" > "$T/nossl/opkg"; chmod 755 "$T/nossl/opkg"
s=$(run "$T/evil" "$T/good" PATH="$T/nossl:$T/inst:$PATH")
ok "没有验签工具、有 opkg：自动装上 usign，用它验签，假的照样认出来" $([ "$s" = rolledback ] && grep -q 'opkg install usign' "$T/opkg.log" && log | grep -q '验签工具：v_usign' && log | grep -q "签名不对：file://$T/evil" ; echo $?) "$s $(msg) $(log | head -5)"
#   c. 装是装上了，但装的工具是坏的（自检过不了）：不更新
rm -f "$T/inst/usign"; printf '#!/bin/sh\n[ "$1" = install ] && printf "#!/bin/sh\\nexit 0\\n" > "%s/inst/usign" && chmod 755 "%s/inst/usign"\nexit 0\n' "$T" "$T" > "$T/nossl/opkg"
s=$(run "$T/good" "$T/good" PATH="$T/nossl:$T/inst:$PATH")
ok "装上的验签工具是坏的（假的也说对）：自检认出来，不更新" $([ "$s" = failed ] && msg | grep -q '为了安全没有更新' ; echo $?) "$s $(msg)"
rm -f "$T/inst/usign"
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
# 6.0 第 58 项：尝鲜版（指定版本，从官网 /dl/t/版本/ 或 GitHub 这个版本下载）、退回正式版（允许比现在旧，先直连 GitHub）
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
cp -r "$T/evil" "$T/bg/download/v9.9.9b"; rm -rf "$T/bg/download/v9.9.9"; mv "$T/bg/download/v9.9.9b" "$T/bg/download/v9.9.9"
s=$(runch "$T/bh" "$T/bg" beta v9.9.9)
ok "尝鲜版：签名不对照样不装" $([ "$s" = failed ] ; echo $?) "$s $(msg)"
# 现在用的是尝鲜版 9.9.9，正式版是 1.0：退回正式版
printf 'CODE=ai-full\nVER=9.9.9\n' > "$T/root/etc/claude-mcp/version"
mkdir -p "$T/sg"; cp -r "$T/old" "$T/sg/latest"; mv "$T/sg/latest" "$T/sg/latest-tmp"; mkdir -p "$T/sg/latest"; mv "$T/sg/latest-tmp" "$T/sg/latest/download"
s=$(runch "$T/evil" "$T/sg" stable)
ok "退回正式版：允许装比现在旧的正式版（1.0 < 9.9.9），先直连 GitHub（官网那份没用到）" $([ "$s" = rolledback ] && ! log | grep -q "签名不对：file://$T/evil" ; echo $?) "$s $(msg) $(log | tail -2)"
# 退回 6.0 以前的正式版：先停掉老版本管不了的（6.0 才有的程序、定时任务）；装不上退回 6.0 时定时任务和程序都放回去
mkdir -p "$T/root/etc/crontabs" "$T/root/usr/sbin"
printf '0 3 * * * /usr/sbin/cmcp-weekly\n*/5 * * * * /usr/sbin/cmcp-guard\n0 4 * * * /bin/true # 用户自己的\n' > "$T/root/etc/crontabs/root"
for b in ratelimit guard watchdog; do printf '#!/bin/sh\n' > "$T/root/usr/sbin/cmcp-$b"; done
mkdir -p "$T/o5/p/openwrt-claude-panel"; printf 'echo "CRON:$(tr "\\n" " " < "$CMCP_ROOT/etc/crontabs/root") BINS:$(ls "$CMCP_ROOT/usr/sbin" | tr "\\n" " ")"; exit 1\n' > "$T/o5/p/openwrt-claude-panel/install.sh"
printf 'PKG_VER=5.3.0\n' > "$T/o5/p/openwrt-claude-panel/EDITION"
tar -C "$T/o5/p" -czf "$T/o5/openwrt-claude-panel-ai-full.tar.gz" openwrt-claude-panel && rm -rf "$T/o5/p"; (cd "$T/o5" && sha256sum *.tar.gz > SHA256SUMS); sg "$T/o5"
rm -rf "$T/sg5"; mkdir -p "$T/sg5/latest"; cp -r "$T/o5" "$T/sg5/latest/download"
printf 'CODE=ai-full\nVER=6.0.1\n' > "$T/root/etc/claude-mcp/version"
s=$(CMCP_ROOT="$T/root" runch "$T/evil" "$T/sg5" stable)
ok "退回 6.0 以前：装之前停掉 6.0 才有的定时任务和程序，用户自己的定时任务留着" $([ "$s" = rolledback ] && log | grep -q '退回 6.0 以前的版本' && log | grep 'CRON:' | grep -q '/bin/true' && ! log | grep 'CRON:' | grep -q 'cmcp-weekly' && ! log | grep 'BINS:' | grep -q 'cmcp-ratelimit' && log | grep 'BINS:' | grep -q 'cmcp-watchdog' ; echo $?) "$s $(log | grep -E 'CRON|BINS|退回' | head -3)"
ok "退回 6.0 以前没装上：定时任务和程序放回去" $(grep -q 'cmcp-weekly' "$T/root/etc/crontabs/root" && [ -e "$T/root/usr/sbin/cmcp-ratelimit" ] ; echo $?) "$(cat "$T/root/etc/crontabs/root")"
mkdir -p "$T/o6/p/openwrt-claude-panel"; printf 'exit 1\n' > "$T/o6/p/openwrt-claude-panel/install.sh"; printf 'PKG_VER=6.0.1\n' > "$T/o6/p/openwrt-claude-panel/EDITION"
tar -C "$T/o6/p" -czf "$T/o6/openwrt-claude-panel-ai-full.tar.gz" openwrt-claude-panel && rm -rf "$T/o6/p"; (cd "$T/o6" && sha256sum *.tar.gz > SHA256SUMS); sg "$T/o6"
rm -rf "$T/sg6"; mkdir -p "$T/sg6/latest"; cp -r "$T/o6" "$T/sg6/latest/download"
printf 'CODE=ai-full\nVER=6.0.2\n' > "$T/root/etc/claude-mcp/version"
s=$(runch "$T/evil" "$T/sg6" stable)
ok "退回的正式版也是 6.x：不动 6.0 的程序和定时任务" $(! log | grep -q '退回 6.0 以前的版本' && grep -q 'cmcp-weekly' "$T/root/etc/crontabs/root" ; echo $?) "$s"
printf 'CODE=ai-full\nVER=9.9.9\n' > "$T/root/etc/claude-mcp/version"
s=$(run "$T/old" "$T/old")
ok "不是退回正式版（普通更新）：照样不装旧版本" $([ "$s" = failed ] && msg | grep -q '旧版本' ; echo $?) "$s $(msg)"
printf 'CODE=ai-full\nVER=1.0\n' > "$T/root/etc/claude-mcp/version"
# 12. 发布用的签名脚本（6.0 第 52 项：新密钥签 .sig2，旧密钥签 .sig 给老路由器）
mk "$T/rel" rel
(cd "$T/rel" && RELEASE_SIGN_KEY_V6=$TK node "$REPO/tools/sign.mjs" SHA256SUMS >/dev/null 2>&1); r=$?
ok "发布签名：新私钥跟一键更新脚本里的公钥对不上 → 报错、不签" $([ $r != 0 ] && [ ! -f "$T/rel/SHA256SUMS.sig2" ] ; echo $?) "rc=$r"
(cd "$T/rel" && RELEASE_SIGN_KEY_V6= node "$REPO/tools/sign.mjs" SHA256SUMS >/dev/null 2>&1); r=$?
ok "发布签名：没设置新私钥 → 报错" $([ $r != 0 ] ; echo $?) "rc=$r"
(cd "$T/rel" && RELEASE_SIGN_KEY_V6=short node "$REPO/tools/sign.mjs" SHA256SUMS >/dev/null 2>&1); r=$?
ok "发布签名：私钥太短（不到 32 个字符）→ 报错" $([ $r != 0 ] ; echo $?) "rc=$r"
(cd "$T/rel" && RELEASE_SIGN_KEY=$TK2 node "$REPO/tools/sign.mjs" --old SHA256SUMS >/dev/null 2>&1); r=$?
ok "发布签名：旧私钥不是原来那把 → 报错、不签 .sig" $([ $r != 0 ] && [ ! -f "$T/rel/SHA256SUMS.sig" ] ; echo $?) "rc=$r"
# 用手机密码生成器生成的长字符串当私钥：签出来的能验过；同一个字符串每次签的公钥一样
PW='k8#Qz!v2Lm9@xR4t$Wn7^pB3&yC6*hJ5dF1g'
eval "$(RELEASE_SIGN_KEY_V6=$PW node tools/sign.mjs --consts | sed 's/^/P_/')"
eval "$(RELEASE_SIGN_KEY_V6=$PW node tools/sign.mjs --consts | sed 's/^/P2_/')"
mk "$T/pw" pw; (cd "$T/pw" && RELEASE_SIGN_KEY_V6=$PW CMCP_SIGN_ANY=1 node "$REPO/tools/sign.mjs" SHA256SUMS >/dev/null)
printf 'CODE=ai-full\nVER=1.0\n' > "$T/root/etc/claude-mcp/version"
s=$(run "$T/pw" "$T/pw" CMCP_UPUB="$P_UPUB" CMCP_PPUB="$P_PPUB" CMCP_STSIG="$P_STSIG")
ok "用 32 个字符以上的随机字符串当私钥：签出来的能验过；每次算出来的公钥一样" $([ "$s" = rolledback ] && [ "$P_UPUB" = "$P2_UPUB" ] ; echo $?) "$s $(msg)"
# 老路由器只认旧密钥签的 .sig：新版一键更新不去拿它，只认 .sig2
rm -f "$T/good/SHA256SUMS.sig2"; cp "$T/good/SHA256SUMS" "$T/good/SHA256SUMS.sig" 2>/dev/null
s=$(run "$T/good" "$T/good")
ok "只有旧的 .sig、没有新密钥签的 .sig2：不装（6.0 起不认旧密钥）" $([ "$s" = failed ] && msg | grep -q '没有签名' ; echo $?) "$s $(msg)"
sg "$T/good"
# 12b. 热补丁正在换文件（有「正在换」的记号）：一键更新拿到锁以后等它换完再开始（11/27 全面检查第 1 条）
mkdir -p "$T/swap"; rm -f "$ST"; rmdir /tmp/cmcp_update.lock 2>/dev/null
( env CMCP_ROOT="$T/root" CMCP_DL="file://$T/good" CMCP_GH="file://$T/good" CMCP_ST="$ST" CMCP_NOSVC=1 CMCP_HOT_SWAP="$T/swap" \
	CMCP_UPUB="$K_UPUB" CMCP_PPUB="$K_PPUB" CMCP_STSIG="$K_STSIG" sh "$REPO/src/bin/cmcp-update" run >/dev/null 2>&1 & )
sleep 3
w1=$([ ! -s "$ST" ] && [ -d /tmp/cmcp_update.lock ]; echo $?)
rmdir "$T/swap"; i=0; while [ $i -lt 20 ] && ! grep -q rolledback "$ST" 2>/dev/null; do sleep 1; i=$((i + 1)); done
ok "热补丁在换文件时一键更新先等着（拿着锁不动），换完再接着装" $([ "$w1" = 0 ] && grep -q rolledback "$ST" ; echo $?) "w1=$w1 $(cat "$ST" 2>/dev/null)"
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
