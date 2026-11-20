#!/bin/sh
# 固件自带的 ucode 太旧时，给面板单独装一套 ucode（install.sh 的 ucode_private）：
#   用法：sh tests/update/ucpriv.sh <解压好的 OpenWrt 根目录> <ucode.sums>
#   根目录里要有一个旧的 ucode（并且删掉了 fs.so、uci.so，模拟 21.02 时期的固件）
#   会真的从 OpenWrt 官方下载 23.05 的包（核对校验值）
cd "$(dirname "$0")/../.." || exit 1
ROOT=$(cd "$1" && pwd) SUMS=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
[ -d "$ROOT/usr" ] && [ -s "$SUMS" ] || { echo "跳过：没有给根目录和 ucode.sums"; exit 0; }
pass=0 fail=0
ck() { if eval "$2"; then pass=$((pass+1)); echo "✓ $1"; else fail=$((fail+1)); echo "✗ $1"; fi; }
T=$(mktemp -d)
# 只取出 install.sh 里跟 ucode 有关的几个函数
{ echo 'have_pkg() { [ -n "$(command -v "$1")" ]; }'; sed -n '/^RT=\${CMCP_ROOT:-}/,/^# 小闪存模式能不能用/p' install.sh; } > "$T/f.sh"
L=$(ls "$ROOT"/lib/ld-musl-*.so.1 | head -n 1)
# 测试机不是 OpenWrt：系统自己的库（libgcc_s 等）在根目录里，告诉链接器去那里找（路由器上本来就在默认位置）
export CMCP_UCLIBX="$ROOT/lib:$ROOT/usr/lib"
old_ok() { "$L" --library-path "$ROOT/usr/lib:$ROOT/lib" "$ROOT/usr/bin/ucode" -e 'print("old-ok")' 2>&1; }
ck "前提：系统自带的旧 ucode 能跑" '[ "$(old_ok)" = old-ok ]'
ck "前提：系统里没有 fs.so、uci.so（模拟旧固件）" '[ ! -e "$ROOT/usr/lib/ucode/fs.so" ] && [ ! -e "$ROOT/usr/lib/ucode/uci.so" ]'
before=$(cd "$ROOT" && find usr lib -type f | sort | md5sum)
out=$( . "$T/f.sh"; CMCP_ROOT=$ROOT; RT=$ROOT; UC_SUMS=$SUMS; ucode_private && echo RET-OK || echo "RET-BAD $UCWHY" )
echo "$out" | tail -n 1
ck "装好面板自带的 ucode" 'echo "$out" | grep -q RET-OK'
ck "试运行：能用 fs 和 uci 模块" '[ "$( . "$T/f.sh"; RT=$ROOT; uc_priv_try)" = UCODE-PASS ]'
ck "生成了启动脚本 /usr/libexec/cmcp-ucode，用系统的链接器指定库目录" 'grep -q -- "--library-path" "$ROOT/usr/libexec/cmcp-ucode" && grep -q "^R=/usr/share/claude-mcp/ucrt" "$ROOT/usr/libexec/cmcp-ucode"'
after=$(cd "$ROOT" && find usr lib -type f ! -path "usr/share/claude-mcp/*" ! -path "usr/libexec/cmcp-ucode" | sort | md5sum)
ck "系统原有的文件一个都没动（只多了面板自己的目录）" '[ "$before" = "$after" ]'
ck "系统自带的旧 ucode 照样能跑" '[ "$(old_ok)" = old-ok ]'
# 用面板自带的 ucode 跑一段调用系统命令的程序：子进程不带 LD_LIBRARY_PATH
child=$("$L" --library-path "$ROOT/usr/share/claude-mcp/ucrt/lib:$CMCP_UCLIBX" "$ROOT/usr/share/claude-mcp/ucrt/bin/ucode" -L "$ROOT/usr/share/claude-mcp/ucrt/lib/ucode/*.so" -e 'let fs = require("fs"), p = fs.popen("echo \"[$LD_LIBRARY_PATH]\""); print(trim(p.read("all"))); p.close();' 2>&1)
ck "面板调用的系统命令不受影响（没有 LD_LIBRARY_PATH）" '[ "$child" = "[]" ]'
# 再装一次（一键更新）：已经有能用的就直接认
ck "再装一次时认出已经装好的" '( . "$T/f.sh"; RT=$ROOT; uc_priv_ok )'
# 坏掉的情况：删掉一个库，试运行不通过
mv "$ROOT/usr/share/claude-mcp/ucrt/lib/ucode/uci.so" "$T/uci.so"
ck "面板自带的 ucode 坏了能认出来（不会当成能用）" '! ( . "$T/f.sh"; RT=$ROOT; uc_priv_ok )'
mv "$T/uci.so" "$ROOT/usr/share/claude-mcp/ucrt/lib/ucode/uci.so"
rm -rf "$T"
echo; echo "通过 $pass/$((pass+fail))"
[ $fail = 0 ]
