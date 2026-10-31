#!/bin/sh
# 打两个发布包：dist/openwrt-claude-panel-{lite,full}.tar.gz
# 精简版不带云端备份脚本和 Worker；完整版全带
set -e
cd "$(dirname "$0")/.."
V=${1:-$(git describe --tags --always 2>/dev/null || echo dev)}
rm -rf dist && mkdir -p dist/tmp
for ed in lite full; do
	d=dist/tmp/$ed/openwrt-claude-panel
	mkdir -p "$d"
	cp -r src install.sh uninstall.sh README.md LICENSE "$d/"
	echo "$V ($ed)" > "$d/VERSION"
	if [ "$ed" = lite ]; then
		rm -f "$d/src/bin/cmcp-backup"
	else
		mkdir -p "$d/cloud" && cp cloud/worker.js cloud/wrangler.toml cloud/gen-vapid.mjs cloud/README.md "$d/cloud/"
	fi
	tar -C dist/tmp/$ed -czf dist/openwrt-claude-panel-$ed.tar.gz openwrt-claude-panel
done
rm -rf dist/tmp
(cd dist && sha256sum *.tar.gz > SHA256SUMS)
ls -la dist
