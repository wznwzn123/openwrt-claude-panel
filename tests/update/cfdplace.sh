#!/bin/sh
# 安装时 cloudflared 放哪：压缩闪存（UBIFS、JFFS2）剩 22 MB 以上就先试着装进闪存（以前一律要 40 MB）；
# 装不上、装完不够放面板，都改用小闪存模式（内存够的话）；不压缩的闪存照旧要 40 MB
# 用法：sh tests/update/cfdplace.sh（不用路由器，用假的 df / 软件包管理器）
cd "$(dirname "$0")/../.." || exit 1
pass=0 fail=0
ck() { if eval "$2"; then pass=$((pass+1)); echo "✓ $1"; else fail=$((fail+1)); echo "✗ $1"; fi; }
T=$(mktemp -d)
# 只取出 install.sh 里跟 cloudflared 放哪有关的函数
{ sed -n '/^cfd_ram_check() {/,/^}/p' install.sh; sed -n '/^ovl_fs() {/,/^cfd_place$/p' install.sh | sed '$d'; } > "$T/f.sh"
grep -q '^cfd_place() {' "$T/f.sh" || { echo "✗ install.sh 里找不到 cfd_place"; exit 1; }
# 跑一次：$1 闪存类型 $2 剩多少 MB $3 装 cloudflared 会不会成功（ok/fail）$4 装完剩多少 MB $5 可用内存 MB
run() {
	printf '/dev/root / squashfs ro 0 0\n/dev/ubi0_1 /overlay %s rw 0 0\n' "$1" > "$T/mounts"
	printf 'MemAvailable: %d kB\n' $(($5 * 1024)) > "$T/meminfo"
	echo "$2" > "$T/free"; rm -f "$T/installed" "$T/removed"
	(
		say() { echo "SAY $*"; }; warn() { echo "WARN $*"; }; die() { echo "DIE $*"; exit 3; }
		pkg_die() { echo "PKGDIE $*"; exit 4; }
		have_pkg() { case "$1" in cloudflared) [ -f "$T/installed" ] ;; sha256sum) return 0 ;; apk) return 0 ;; *) command -v "$1" >/dev/null ;; esac; }
		free_mb() { cat "$T/free"; }
		mem_mb() { awk -v k="$1:" '$1 == k { print int($2 / 1024) }' "$T/meminfo"; }
		pkg_add() { echo "ADD $*"; if [ "$INST" = ok ]; then touch "$T/installed"; echo "$AFTER" > "$T/free"; return 0; fi; PKGERR=""; return 1; }
		apk() { [ "$1" = del ] && { rm -f "$T/installed"; touch "$T/removed"; }; return 0; }
		uname() { echo aarch64; }
		SRC=$T; mkdir -p "$T/etc"; echo x > "$T/etc/cfd.sums"
		CMCP_MOUNTS=$T/mounts INST=$3 AFTER=$4
		. "$T/f.sh"
		cfd_place
		echo "RAM=$CFD_RAM NEED=$CFD_NEED"
	) 2>&1
}
# 这次上报的路由器：Tenda BE12 Pro，UBIFS 闪存剩 37 MB，可用内存 71 MB
o=$(run ubifs 37 ok 20 71)
ck "压缩闪存（UBIFS）剩 37 MB：直接装进闪存（以前报「放不下」）" 'echo "$o" | grep -q "ADD cloudflared" && echo "$o" | grep -q "RAM=0 NEED=22" && ! echo "$o" | grep -q DIE'
ck "装的时候说明闪存是压缩的" 'echo "$o" | grep -q "闪存是压缩的"'
o=$(run jffs2 25 ok 9 71)
ck "JFFS2 剩 25 MB：也先试着装进闪存" 'echo "$o" | grep -q "RAM=0 NEED=22"'
o=$(run ubifs 37 fail 37 71)
ck "压缩闪存装不上、内存也不够小闪存模式：说清楚原因（要剩 22 MB 以上）" 'echo "$o" | grep -q "DIE cloudflared 装不上" && echo "$o" | grep -q "可用内存只有 71 MB" && echo "$o" | grep -q "剩 22 MB 以上"'
o=$(run ubifs 37 fail 37 200)
ck "压缩闪存装不上、内存够：改用小闪存模式" 'echo "$o" | grep -q "RAM=1" && ! echo "$o" | grep -q DIE'
o=$(run ubifs 30 ok 4 200)
ck "装完只剩 4 MB 不够放面板：卸掉，改用小闪存模式" 'echo "$o" | grep -q "RAM=1" && [ -f "$T/removed" ] && echo "$o" | grep -q "不够放面板"'
o=$(run ubifs 30 ok 4 71)
ck "装完不够放面板、内存也不够：卸掉以后说清楚" '[ -f "$T/removed" ] && echo "$o" | grep -q "DIE 闪存放下 cloudflared 以后不够放面板"'
o=$(run ubifs 18 ok 5 200)
ck "压缩闪存只剩 18 MB：不硬装，直接用小闪存模式" '! echo "$o" | grep -q "ADD" && echo "$o" | grep -q "RAM=1"'
o=$(run ext4 37 ok 7 71)
ck "不压缩的闪存（ext4）剩 37 MB：照旧不装，说要剩 40 MB" '! echo "$o" | grep -q "ADD" && echo "$o" | grep -q "剩 40 MB 以上"'
o=$(run f2fs 60 ok 30 71)
ck "不压缩的闪存剩 60 MB：照旧装进闪存" 'echo "$o" | grep -q "RAM=0 NEED=40"'
rm -rf "$T"
echo; echo "通过 $pass/$((pass+fail))"
[ $fail = 0 ]
