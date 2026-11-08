#!/bin/sh
# 在模拟器上装 App（调试包）：首页（浅色/深色）、打开网页、返回键、扫码界面；检查有没有崩溃
set -x
OUT=shots; mkdir -p $OUT
PKG=io.github.wznwzn123.routerpanel
adb install -r router-panel.apk
adb logcat -c
adb shell am start -n $PKG/.MainActivity
sleep 12
adb exec-out screencap -p > $OUT/1-home-light.png
# 打开网页窗口（官网账号页）
adb shell am force-stop $PKG
adb shell am start -n $PKG/.MainActivity --es open https://example.com/app
sleep 10
adb exec-out screencap -p > $OUT/2-site.png
adb shell input keyevent KEYCODE_BACK
sleep 3
adb exec-out screencap -p > $OUT/3-back-home.png
# 扫码界面
adb shell am force-stop $PKG
adb shell am start -n $PKG/.MainActivity --ez scan true
sleep 6
adb shell pm grant $PKG android.permission.CAMERA || true
sleep 6
adb exec-out screencap -p > $OUT/4-scan.png
adb shell input keyevent KEYCODE_BACK
sleep 2
# 深色
adb shell am force-stop $PKG
adb shell cmd uimode night yes
sleep 2
adb shell am start -n $PKG/.MainActivity
sleep 10
adb exec-out screencap -p > $OUT/5-home-dark.png
# 开着 App 切回浅色：不重开也要跟着变
adb shell cmd uimode night no
sleep 4
adb exec-out screencap -p > $OUT/6-live-light.png
# 首页的弹窗（以前被安卓吞掉，点了没反应）
adb shell am force-stop $PKG
adb shell "am start -n $PKG/.MainActivity --es homejs 'confirm(\"测试弹窗：看到这个就说明弹窗正常\")'"
sleep 8
adb exec-out screencap -p > $OUT/7-dialog.png
adb shell input keyevent KEYCODE_BACK
sleep 1
# 手动添加：填登录地址点「添加」→ 打开面板
adb shell am force-stop $PKG
adb shell "am start -n $PKG/.MainActivity --es homejs 'document.getElementById(\"addr\").value=\"https://example.com/cgi-bin/mcp/abcdefghijklmnop1234\";document.getElementById(\"addBtn\").click()'"
sleep 10
adb exec-out screencap -p > $OUT/8-manual-add.png
# 相册识别：识别一张二维码图片（内容是 https://example.com/panel/）→ 打开面板
adb shell am force-stop $PKG
adb shell am start -n $PKG/.MainActivity --ez qrtest true
sleep 10
adb exec-out screencap -p > $OUT/9-album-qr.png
# 点「相册识别」：打开系统的选图片界面
adb shell am force-stop $PKG
adb shell "am start -n $PKG/.MainActivity --es homejs 'App.pickQr()'"
sleep 8
adb exec-out screencap -p > $OUT/11-album-picker.png
adb shell input keyevent KEYCODE_BACK
sleep 1
# 首页（新布局和图标）
adb shell am force-stop $PKG
adb shell am start -n $PKG/.MainActivity
sleep 6
adb exec-out screencap -p > $OUT/10-home-new.png
# 状态栏：面板这种铺到顶上的页面（深色渐变背景）→ 状态栏透明、背景铺到时间后面、白色图标；顶栏让开状态栏
adb shell am force-stop $PKG
adb shell "am start -n $PKG/.MainActivity --es open https://example.com/panel/ --es sitejs 'var m=document.createElement(\"meta\");m.name=\"theme-color\";m.content=\"#20406a\";document.head.appendChild(m);window.RP_EDGE=1;document.body.innerHTML=\"<div style=position:fixed;inset:0;background:linear-gradient(160deg,#20406a,#1f6b6b,#3a2c8f)></div><div id=t style=position:fixed;left:10px;right:10px;top:var(--sat,0px);margin-top:8px;height:56px;border-radius:22px;background:rgba(255,255,255,.18);color:#fff;font-size:20px;line-height:56px;font-weight:600;padding-left:18px>顶栏（应该在状态栏下面）</div>\"'"
sleep 12
adb exec-out screencap -p > $OUT/12-edge-dark.png
# 浅色、不支持铺到顶上的网页 → 往下让开状态栏，状态栏涂成网页给的颜色，黑色图标
adb shell am force-stop $PKG
adb shell "am start -n $PKG/.MainActivity --es open https://example.com/panel/ --es sitejs 'var m=document.createElement(\"meta\");m.name=\"theme-color\";m.content=\"#f4dff2\";document.head.appendChild(m);document.body.style.background=\"#f4dff2\"'"
sleep 12
adb exec-out screencap -p > $OUT/13-plain-light.png
# 回到首页：状态栏用首页的颜色
adb shell input keyevent KEYCODE_BACK
sleep 3
adb exec-out screencap -p > $OUT/14-back-home.png
adb logcat -d > $OUT/logcat.txt
grep -A3 "识别二维码失败" $OUT/logcat.txt | head -8 | sed 's/^/::warning::/'
if grep -E "FATAL EXCEPTION" $OUT/logcat.txt; then echo "::error::App 崩溃了"; grep -A30 "FATAL EXCEPTION" $OUT/logcat.txt | head -60; exit 1; fi
echo "::notice::App 启动正常，没有崩溃"
