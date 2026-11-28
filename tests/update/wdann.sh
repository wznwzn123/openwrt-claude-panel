#!/bin/sh
# 公告即时送达（用户 11/27）：看门狗拿到官网的公告版本号，跟上次不一样就马上取一次公告（cmcp-ann now）
#   托管版：每分钟心跳的回复里带 annv；自建版：没有心跳带版本号时，每 5 分钟问一下 /api/notices/v
# 用法：sh tests/update/wdann.sh
set -u
W=$(mktemp -d); trap 'rm -rf "${W:?}"' EXIT
WD=$(cd "$(dirname "$0")/../.." && pwd)/src/bin/cmcp-watchdog
pass=0; fail=0
ok() { if eval "$2"; then pass=$((pass+1)); echo "✓ $1"; else fail=$((fail+1)); echo "✗ $1"; fi; }
mkdir -p "$W/bin" "$W/srv/beat/r"
# 假的 jsonfilter（-e '@.键'，从标准输入读）
cat > "$W/bin/jsonfilter" <<'EOF'
#!/usr/bin/env node
const a = process.argv.slice(2); let f = null, e = '';
for (let i = 0; i < a.length; i++) { if (a[i] === '-i') f = a[++i]; else if (a[i] === '-e') e = a[++i]; }
let o; try { o = JSON.parse(require('fs').readFileSync(f ?? 0, 'utf8')); } catch (x) { process.exit(1); }
const v = o[e.replace(/^@\./, '')]; if (v == null) process.exit(1); console.log(v);
EOF
# 假的 cmcp-ann：记一笔；FAIL 文件存在时表示取不到
printf '#!/bin/sh\necho "$1" >> %s/ann.calls\n[ -f %s/ann.fail ] && exit 1\nexit 0\n' "$W" "$W" > "$W/bin/cmcp-ann"
# 假的 cmcp-hot：记一笔（后台按台退回补丁时，心跳回复带 hotc，用户 11/28）
printf '#!/bin/sh\necho "$1" >> %s/hot.calls\n' "$W" > "$W/bin/cmcp-hot"
chmod 755 "$W/bin/jsonfilter" "$W/bin/cmcp-ann" "$W/bin/cmcp-hot"
run() { # $1 = 场景目录
	mkdir -p "$W/$1"
	PATH="$W/bin:$PATH" WD_DIR="$W/$1" WD_STATE="$W/$1/state" DRYRUN=1 WD_ANNTEST=1 WD_ANN="$W/bin/cmcp-ann" WD_HOT="$W/bin/cmcp-hot" WD_ANNV="$W/ann.v" WD_ANNB="$W/annb" \
		WD_ANNURL="file://$W/v.json" FAKE_WAN=1 FAKE_GW=1 FAKE_NET=1 FAKE_DNS=1 FAKE_TPID=123 FAKE_READY=4 FAKE_CLASH=1 FAKE_PANEL=1 FAKE_OOM=0 FAKE_KERR=0 \
		sh "$WD" once >/dev/null 2>&1
	rmdir /tmp/cmcp_wd.lock 2>/dev/null
	sleep 2   # 取公告在后台跑
}
calls() { [ -f "$W/ann.calls" ] && grep -c . "$W/ann.calls" || echo 0; }
# ---- 自建版：没有心跳，问版本号接口 ----
echo '{"ok":true,"v":"3.0"}' > "$W/v.json"
run self
ok '自建版：第一次拿到版本号就取一次公告，记下版本号' '[ "$(calls)" = 1 ] && [ "$(cat "$W/ann.v")" = 3.0 ] && grep -q now "$W/ann.calls"'
run self
ok '版本号没变：不再取' '[ "$(calls)" = 1 ]'
echo '{"ok":true,"v":"4.0"}' > "$W/v.json"
run self
ok '后台发了 / 改了公告（版本号变了）：马上再取一次' '[ "$(calls)" = 2 ] && [ "$(cat "$W/ann.v")" = 4.0 ]'
touch "$W/ann.fail"; echo '{"ok":true,"v":"5.0"}' > "$W/v.json"
run self
ok '取不到（官网连不上）：不记版本号，下次再试' '[ "$(calls)" = 3 ] && [ "$(cat "$W/ann.v")" = 4.0 ]'
rm -f "$W/ann.fail"
run self
ok '下次就取到了' '[ "$(calls)" = 4 ] && [ "$(cat "$W/ann.v")" = 5.0 ]'
echo '{"ok":true,"v":"5.0; reboot"}' > "$W/v.json"; echo 9 > "$W/ann.v"
run self
ok '版本号里有奇怪的字符：不认' '[ "$(calls)" = 4 ]'
# ---- 托管版：心跳回复里带版本号 ----
echo 1 > "$W/ann.v"; rm -f "$W/ann.calls"
mkdir -p "$W/host"; printf 'URL=file://%s/srv\nRKEY=rk\n' "$W" > "$W/host/cloud.conf"
echo '{"ok":true,"m":0,"annv":"7.2"}' > "$W/srv/beat/r/rk"
echo '{"ok":true,"v":"0.0"}' > "$W/v.json"
run host
ok '托管版：心跳回复带了新版本号，马上取公告' '[ "$(calls)" = 1 ] && [ "$(cat "$W/ann.v")" = 7.2 ] && [ -s "$W/annb" ]'
run host
ok '心跳 5 分钟内带过版本号：不再自己去问版本号接口' '[ "$(calls)" = 1 ] && [ "$(cat "$W/ann.v")" = 7.2 ]'
echo '{"ok":true,"m":1}' > "$W/srv/beat/r/rk"; echo $(( $(date +%s) - 400 )) > "$W/annb"
run host
ok '老官网的心跳不带版本号（超过 5 分钟）：自己问版本号接口' '[ "$(calls)" = 2 ] && [ "$(cat "$W/ann.v")" = 0.0 ]'
ok '心跳回复没带 hotc：不问补丁' '[ ! -f "$W/hot.calls" ]'
echo '{"ok":true,"m":0,"hotc":1}' > "$W/srv/beat/r/rk"
mkdir -p "$W/host2"; cp "$W/host/cloud.conf" "$W/host2/"
run host2
ok '心跳回复带 hotc（后台把这台固定在某个补丁）：马上跑一次 cmcp-hot check' '[ -f "$W/hot.calls" ] && grep -qx check "$W/hot.calls"'
echo; echo "通过 $pass/$((pass+fail))"
[ $fail = 0 ]
