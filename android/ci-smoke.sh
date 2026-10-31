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
adb logcat -d > $OUT/logcat.txt
if grep -E "FATAL EXCEPTION" $OUT/logcat.txt; then echo "::error::App 崩溃了"; grep -A30 "FATAL EXCEPTION" $OUT/logcat.txt | head -60; exit 1; fi
echo "::notice::App 启动正常，没有崩溃"
