#!/bin/sh
# 看门狗和一键更新不打架：更新正在装时，面板服务没响应不去重启（只记一条），隧道也不重启；没在更新时照常重启
# 用法：sh tests/update/wdupd.sh
set -u
W=$(mktemp -d); trap 'rm -rf "${W:?}"' EXIT
WD=$(cd "$(dirname "$0")/../.." && pwd)/src/bin/cmcp-watchdog
pass=0; fail=0
ok() { if eval "$2"; then pass=$((pass+1)); echo "✓ $1"; else fail=$((fail+1)); echo "✗ $1"; fi; }
run() { # $1 = 场景目录
	mkdir -p "$W/$1"
	for i in 1 2 3; do
		WD_DIR="$W/$1" WD_STATE="$W/$1/state" DRYRUN=1 FAKE_WAN=1 FAKE_GW=1 FAKE_NET=1 FAKE_DNS=1 FAKE_TPID=123 FAKE_READY=4 FAKE_CLASH=1 FAKE_PANEL=0 FAKE_OOM=0 FAKE_KERR=0 \
			WD_UPDLOCK="$2" sh "$WD" once >/dev/null 2>&1
		rmdir /tmp/cmcp_wd.lock 2>/dev/null
	done
}
mkdir "$W/updlock"
run upd "$W/updlock"
ok '正在更新：面板没响应时不重启，记一条「正在一键更新」' 'grep -q "正在一键更新" "$W/upd/events.log" && ! grep -q "已自动重启" "$W/upd/events.log"'
run normal "$W/nolock"
ok '没在更新：面板没响应照常自动重启' 'grep -q "已自动重启" "$W/normal/events.log" && ! grep -q "正在一键更新" "$W/normal/events.log"'
touch -d '@'$(( $(date +%s) - 1200 )) "$W/updlock"
run stale "$W/updlock"
ok '更新锁超过 15 分钟（更新卡死）：照常自动重启' 'grep -q "已自动重启" "$W/stale/events.log"'
echo; echo "通过 $pass/$((pass+fail))"
[ $fail = 0 ]
