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
adb shell mkdir -p /sdcard/Android/data/$PKG/files
adb push android/ci/qr-test.png /sdcard/Android/data/$PKG/files/qr-test.png
adb shell am start -n $PKG/.MainActivity --es qrfile /sdcard/Android/data/$PKG/files/qr-test.png
sleep 10
adb exec-out screencap -p > $OUT/9-album-qr.png
# 首页（新布局和图标）
adb shell am force-stop $PKG
adb shell am start -n $PKG/.MainActivity
sleep 6
adb exec-out screencap -p > $OUT/10-home-new.png
adb logcat -d > $OUT/logcat.txt
if grep -E "FATAL EXCEPTION" $OUT/logcat.txt; then echo "::error::App 崩溃了"; grep -A30 "FATAL EXCEPTION" $OUT/logcat.txt | head -60; exit 1; fi
echo "::notice::App 启动正常，没有崩溃"
