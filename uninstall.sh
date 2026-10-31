#!/bin/sh
# 卸载 openwrt-claude-panel：停止服务、删除程序和定时任务。
#   sh uninstall.sh          保留 /etc/claude-mcp（密钥、断线记录、流量统计），以后重装还能接着用
#   sh uninstall.sh --purge  连 /etc/claude-mcp 一起删掉
[ "$(id -u)" = 0 ] || { echo "请用 root 运行"; exit 1; }
# 托管版：先把专属网址和隧道交还给托管服务（名额腾出来）
if [ -s /etc/claude-mcp/hub.conf ]; then
	HUB=$(sed -n 's/^HUB=//p' /etc/claude-mcp/hub.conf); SUB=$(sed -n 's/^SUB=//p' /etc/claude-mcp/hub.conf)
	RKEY=$(sed -n 's/^RKEY=//p' /etc/claude-mcp/cloud.conf 2>/dev/null)
	r=$(curl -s -m 30 -X POST -H 'Content-Type: application/json' -d "{\"sub\":\"$SUB\",\"rkey\":\"$RKEY\"}" "$HUB/api/unregister" 2>/dev/null)
	case "$r" in
		*'"ok":true'*) echo "已注销托管网址 $SUB"; rm -f /etc/claude-mcp/hub.conf /etc/claude-mcp/tunnel_token /etc/claude-mcp/cloud.conf /etc/claude-mcp/hostname ;;
		*) echo "托管网址注销失败（${r:-连不上托管服务}），不用管它：90 天没上线会自动回收" ;;
	esac
fi
for s in cmcp-watchdog claude-mcp; do
	[ -x /etc/init.d/$s ] && { /etc/init.d/$s stop; /etc/init.d/$s disable; }
	rm -f /etc/init.d/$s
done
# 设备暂停的防火墙规则要先清掉，否则被暂停的设备会一直断网
for t in iptables ip6tables; do
	command -v $t >/dev/null || continue
	while $t -t mangle -D PREROUTING -j CMCP_PAUSE 2>/dev/null; do :; done
	$t -t mangle -F CMCP_PAUSE 2>/dev/null; $t -t mangle -X CMCP_PAUSE 2>/dev/null
done
sed -i '/\/usr\/sbin\/cmcp-/d' /etc/crontabs/root 2>/dev/null; /etc/init.d/cron restart >/dev/null 2>&1
rm -f /usr/sbin/cmcp-autosw /usr/sbin/cmcp-backup /usr/sbin/cmcp-daily /usr/sbin/cmcp-logincode /usr/sbin/cmcp-notify /usr/sbin/cmcp-pair /usr/sbin/cmcp-pause /usr/sbin/cmcp-route /usr/sbin/cmcp-traffic /usr/sbin/cmcp-update /usr/sbin/cmcp-watchdog
rm -rf /usr/share/ucode/cmcp /www-claude-mcp
rm -f /etc/hotplug.d/ntp/90-cmcp-synced
sec=$(uci -q show rpcd | sed -n "s/^rpcd\.\(@login\[[0-9]*\]\)\.username='cmcp'$/\1/p" | head -n1)
[ -n "$sec" ] && { uci delete rpcd.$sec; uci commit rpcd; /etc/init.d/rpcd reload >/dev/null 2>&1; }
sed -i '\#^/etc/claude-mcp/$#d; \#^/www-claude-mcp/$#d; \#^/usr/share/ucode/cmcp/$#d; \#cmcp#d; \#claude-mcp#d' /etc/sysupgrade.conf 2>/dev/null
if [ "$1" = --purge ]; then rm -rf /etc/claude-mcp; echo "已卸载（包括所有设置和记录）"
else echo "已卸载。设置和记录还在 /etc/claude-mcp，彻底删除请运行：sh uninstall.sh --purge"; fi
echo "提示：OpenClash 覆写/自定义规则里如果加过面板的规则，请在 OpenClash 里自行检查。"
