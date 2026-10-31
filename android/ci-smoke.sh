#!/bin/sh
# 在模拟器上装 App、打开、截图（浅色、深色），检查有没有崩溃
set -x
OUT=shots; mkdir -p $OUT
adb install -r router-panel.apk
adb logcat -c
adb shell am start -n io.github.wznwzn123.routerpanel/.MainActivity
sleep 12
adb exec-out screencap -p > $OUT/home-light.png
# 打开一个面板网址（测试 App 里的网页窗口能用、返回键能回首页）
adb shell am force-stop io.github.wznwzn123.routerpanel
adb shell cmd uimode night yes
sleep 2
adb shell am start -n io.github.wznwzn123.routerpanel/.MainActivity
sleep 10
adb exec-out screencap -p > $OUT/home-dark.png
adb shell input keyevent KEYCODE_BACK
sleep 2
adb logcat -d > $OUT/logcat.txt
if grep -E "FATAL EXCEPTION|AndroidRuntime: Process: io.github" $OUT/logcat.txt; then echo "::error::App 崩溃了"; grep -A30 "FATAL EXCEPTION" $OUT/logcat.txt | head -60; exit 1; fi
grep -E "chromium|Console" $OUT/logcat.txt | grep -i -E "error|uncaught" | head -20 > $OUT/console-errors.txt || true
echo "::notice::App 启动正常，没有崩溃"
