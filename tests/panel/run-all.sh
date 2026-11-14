#!/bin/sh
# 路由器面板全套浏览器测试（Playwright + 模拟的路由器接口 mock.js，不需要真路由器）
# 用法：sh tests/panel/run-all.sh            全部跑一遍，每个测试一行结果，最后打印 ALLDONE
#       sh tests/panel/run-all.sh notice chat 只跑指定的几个
# 截图放在 tests/panel/shots/（不进仓库）
# PANEL_WWW=某个目录 → 测那个目录里的面板（比如打包后精简过的那份：dist/tmp/.../src/www）
cd "$(dirname "$0")" || exit 1
mkdir -p shots
ALL="main svc auto pxs logincode update updbanner verfix run nav net dash wd toast push asw pause traf menu sc back speed bk quick lock sec daily lite theme hosted pair rotate svcexp barcolor forcepage fbreply notice chat offline layout"
[ $# -gt 0 ] && ALL="$*"
for t in $ALL; do
	a=""; [ $t = offline ] && a=${PANEL_WWW:-../../src/www}/panel/sw.js
	r=$(timeout 1800 node $t.js $a 2>&1 | grep -E "^通过|✗|Error" | head -3 | tr '\n' ' ')
	echo "$t: $r" | cut -c1-220
done
echo ALLDONE
