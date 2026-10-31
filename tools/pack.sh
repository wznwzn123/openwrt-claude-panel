#!/bin/sh
# 打四个发布包到 dist/：
#   openwrt-claude-panel-ai-lite.tar.gz     AI 版 · 精简版
#   openwrt-claude-panel-ai-full.tar.gz     AI 版 · 完整版
#   openwrt-claude-panel-noai-lite.tar.gz   纯面板版 · 精简版
#   openwrt-claude-panel-noai-full.tar.gz   纯面板版 · 完整版
# 每个包里的 EDITION 文件决定 install.sh 默认装哪个版本，INSTALL.md 是这个版本的安装教程。
# 精简版不带云端备份脚本和 Worker；完整版全带。
# 设置了环境变量 HUB_URL 时，再多打两个托管版：openwrt-claude-panel-hosted-{ai,noai}.tar.gz
set -e
cd "$(dirname "$0")/.."
V=${1:-$(git describe --tags --always 2>/dev/null || echo dev)}
rm -rf dist && mkdir -p dist/tmp
for ai in ai noai; do
	for ed in lite full; do
		k=$ai-$ed
		case $k in
			ai-lite) name='AI 版 · 精简版' ;;
			ai-full) name='AI 版 · 完整版' ;;
			noai-lite) name='纯面板版 · 精简版' ;;
			noai-full) name='纯面板版 · 完整版' ;;
		esac
		d=dist/tmp/$k/openwrt-claude-panel
		mkdir -p "$d"
		cp -r src docs install.sh uninstall.sh README.md LICENSE "$d/"
		cp "docs/install-$k.md" "$d/INSTALL.md"
		printf '# %s（%s）\nPKG_AI=%s\nPKG_ED=%s\n' "$name" "$V" "$( [ $ai = ai ] && echo 1 || echo 0 )" "$ed" > "$d/EDITION"
		if [ "$ed" = lite ]; then
			rm -f "$d/src/bin/cmcp-backup"
		else
			mkdir -p "$d/cloud" && cp cloud/worker.js cloud/wrangler.toml cloud/gen-vapid.mjs cloud/README.md "$d/cloud/"
		fi
		tar -C dist/tmp/$k -czf dist/openwrt-claude-panel-$k.tar.gz openwrt-claude-panel
	done
done
# 托管版：设置了 HUB_URL（托管服务的网址）才打包，安装时只要输入邀请码
if [ -n "$HUB_URL" ]; then
	for ai in ai noai; do
		k=hosted-$ai
		name="$( [ $ai = ai ] && echo 'AI 版' || echo '纯面板版' ) · 托管版"
		d=dist/tmp/$k/openwrt-claude-panel
		mkdir -p "$d"
		cp -r src docs install.sh uninstall.sh README.md LICENSE "$d/"
		cp docs/install-hosted.md "$d/INSTALL.md"
		printf '# %s（%s）\nPKG_AI=%s\nPKG_ED=full\nPKG_HUB=%s\n' "$name" "$V" "$( [ $ai = ai ] && echo 1 || echo 0 )" "$HUB_URL" > "$d/EDITION"
		tar -C dist/tmp/$k -czf dist/openwrt-claude-panel-$k.tar.gz openwrt-claude-panel
	done
fi
rm -rf dist/tmp
(cd dist && sha256sum *.tar.gz > SHA256SUMS)
ls -la dist
