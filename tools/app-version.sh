#!/bin/sh
# 算出 App 自己的版本，生成 Release 里的 app-version.json（官网据此决定 App 要不要提示更新）
#   App 的代码（android/app、gradle 设置）从上次发布到现在有改动 → App 版本 = 这次发布的版本，提示更新
#   强不强制跟官网判断路由器的一样（cloud/hub.js mustUpdate）：「最低版本：x.y.z【必须更新】」的 x.y.z 就是这个 App 版本才强制，
#   沿用上一版的这一行不算（用户 11/28 14:35：只有 6.0.1 这一次强制，后面不强制）；说明里别处另外写了【必须更新】照旧强制
#   只让 App 强制、路由器不强制（用户 11/28 16:17：App 6.0.2 这次强制，以后的不强制）：更新说明里写一行「App 最低版本：x.y.z」，
#   x.y.z 就是这个 App 版本才强制；这一行没有【必须更新】，官网判断路由器（mustUpdate）不认它，路由器照样不强制
#   没改动 → 沿用 App 上一次改动时的版本号，App 不弹更新
# 用法：sh tools/app-version.sh v2.1.0 > dist/app-version.json   （需要完整的 git 历史和标签）
set -e
cd "$(dirname "$0")/.."
V=${1:?要给这次发布的版本号，例如 v2.1.0}
c=$(git log -1 --format=%H -- android/app android/build.gradle android/settings.gradle android/gradle.properties 2>/dev/null || true)
T=""
[ -n "$c" ] && T=$(git tag --contains "$c" --sort=v:refname 2>/dev/null | grep -E '^v[0-9]+(\.[0-9]+){0,2}$' | head -1 || true)
[ -n "$T" ] || T=$V
if [ "$T" = "$V" ]; then body=$(cat tools/release-notes.md); else body=$(git show "$T:tools/release-notes.md" 2>/dev/null || true); fi
RE='最低版本[:：]\s*v?(?<m>\d+(?:\.\d+){0,2})\s*【必须更新】'
ARE='App 最低版本[:：]\s*v?(?<a>\d+(?:\.\d+){0,2})'
jq -n --arg v "${T#v}" --arg b "$body" --arg re "$RE" --arg are "$ARE" \
	'(first($b | capture($re) | .m) // null) as $m | (first($b | capture($are) | .a) // null) as $a | {version: $v, body: $b, force: ($m == $v or $a == $v or ($b | sub($re; "") | contains("【必须更新】")))}'
