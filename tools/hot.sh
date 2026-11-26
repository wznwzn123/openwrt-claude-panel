#!/bin/sh
# 打热补丁到 dist-hot/：sh tools/hot.sh 基础版本 编号 "一句话说明"（例如 sh tools/hot.sh 6.0.0 3 "修了订阅页的显示问题"）
# 包里：hot.json（给哪个版本、第几个、说明）+ root/（要换的文件，路径跟路由器上一样）。路由器上的 cmcp-hot 只认白名单里的文件：
#   面板网页（www-claude-mcp/panel/）、接口（www-claude-mcp/cgi-bin/mcp）、共用库（usr/share/ucode/cmcp/lib.uc）、小工具（usr/sbin/cmcp-*）、远程数据（etc/claude-mcp/remote.json）
# 面板版本号写成「基础版本-h编号」（6.0.0-h3），手机上的面板发现跟路由器不一样就自己换新的
set -e
cd "$(dirname "$0")/.."
B=$1; N=$2; NOTES=$3
case "$B" in [0-9]*.[0-9]*.[0-9]*) ;; *) echo "基础版本写成 6.0.0 这样" >&2; exit 1 ;; esac
case "$N" in ''|*[!0-9]*) echo "编号是数字" >&2; exit 1 ;; esac
[ -n "$NOTES" ] || { echo "写一句说明" >&2; exit 1; }
node tools/build-src.mjs --check
rm -rf dist-hot && mkdir -p dist-hot/p/root/www-claude-mcp/cgi-bin dist-hot/p/root/usr/share/ucode/cmcp dist-hot/p/root/usr/sbin dist-hot/p/root/etc/claude-mcp dist-hot/s
# 跟正式包一样精简面板
cp -r src dist-hot/s/src
sed -i "s/<meta name=\"panel-ver\" content=\"dev\">/<meta name=\"panel-ver\" content=\"$B-h$N\">/" dist-hot/s/src/www/panel/index.html
if [ -d tools/minify/node_modules/esbuild ]; then node tools/minify/minify-panel.mjs dist-hot/s/src/www/panel; elif [ -n "$CI" ]; then echo "没装 tools/minify 的依赖" >&2; exit 1; fi
gzip -9 -n -c dist-hot/s/src/www/panel/index.html > dist-hot/s/src/www/panel/index.zh
cp -r dist-hot/s/src/www/panel dist-hot/p/root/www-claude-mcp/panel
cp dist-hot/s/src/www/cgi-bin/mcp dist-hot/p/root/www-claude-mcp/cgi-bin/mcp
cp src/lib/lib.uc dist-hot/p/root/usr/share/ucode/cmcp/lib.uc
for f in src/bin/cmcp-*; do cp "$f" dist-hot/p/root/usr/sbin/; done
# 精简版没有云端备份：补丁里也不带（不给精简版加文件）
rm -f dist-hot/p/root/usr/sbin/cmcp-backup dist-hot/p/root/usr/sbin/cmcp-bkcrypt
[ -f src/etc/remote.json ] && cp src/etc/remote.json dist-hot/p/root/etc/claude-mcp/remote.json
node -e 'const [b,n,t]=process.argv.slice(1);process.stdout.write(JSON.stringify({base:b,n:+n,notes:t}))' "$B" "$N" "$NOTES" > dist-hot/p/hot.json
tar -C dist-hot/p -czf dist-hot/hot.tar.gz .
( cd dist-hot && sha256sum hot.tar.gz > SHA256SUMS )
rm -rf dist-hot/p dist-hot/s
echo "热补丁 hot-$B-$N：$(du -k dist-hot/hot.tar.gz | cut -f1) KB"
