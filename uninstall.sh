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
# 隧道直连的设置（dnsmasq、OpenClash 局域网名单里加的那一行）删掉
[ -x /usr/sbin/cmcp-tunbypass ] && /usr/sbin/cmcp-tunbypass remove
sed -i '/\/usr\/sbin\/cmcp-/d' /etc/crontabs/root 2>/dev/null; /etc/init.d/cron restart >/dev/null 2>&1
rm -f /usr/sbin/cmcp-autosw /usr/sbin/cmcp-backup /usr/sbin/cmcp-daily /usr/sbin/cmcp-logincode /usr/sbin/cmcp-notify /usr/sbin/cmcp-pair /usr/sbin/cmcp-pause /usr/sbin/cmcp-proxy /usr/sbin/cmcp-route /usr/sbin/cmcp-traffic /usr/sbin/cmcp-tunbypass /usr/sbin/cmcp-update /usr/sbin/cmcp-watchdog /usr/sbin/cmcp-cfd
# 小闪存模式下载到内存里的 cloudflared
rm -rf /tmp/cmcp-cfd
rm -rf /usr/share/ucode/cmcp /www-claude-mcp
rm -f /etc/hotplug.d/ntp/90-cmcp-synced
rm -f /etc/cmcp-report
sec=$(uci -q show rpcd | sed -n "s/^rpcd\.\(@login\[[0-9]*\]\)\.username='cmcp'$/\1/p" | head -n1)
[ -n "$sec" ] && { uci delete rpcd.$sec; uci commit rpcd; /etc/init.d/rpcd reload >/dev/null 2>&1; }
sed -i '\#^/etc/claude-mcp/$#d; \#^/www-claude-mcp/$#d; \#^/usr/share/ucode/cmcp/$#d; \#cmcp#d; \#claude-mcp#d' /etc/sysupgrade.conf 2>/dev/null
# 固件软件源装不上 ucode 时，安装脚本从 OpenWrt 官方补装过的文件（只记了它自己补的，系统原有的不在里面）：
# 普通卸载保留（面板以外的东西可能也用上了）；--purge 一起删掉
UCF=/etc/claude-mcp/ucode.files
UCF_LIST=$(grep -E '^/(usr|lib)/[A-Za-z0-9._/+-]+$' $UCF 2>/dev/null | grep -v '\.\.' | tr '\n' ' ')
RT=${CMCP_ROOT:-}
[ "$1" = --purge ] && for f in $UCF_LIST; do rm -f "$RT$f"; done
if [ "$1" = --purge ]; then rm -rf /etc/claude-mcp; echo "已卸载（包括所有设置和记录）"
else echo "已卸载。设置和记录还在 /etc/claude-mcp，彻底删除请运行：sh uninstall.sh --purge"; fi
echo "提示：OpenClash 覆写/自定义规则里如果加过面板的规则，请在 OpenClash 里自行检查。"

# ---------- 卸载检查：确认没留下面板的东西（只检查、只输出，不再改动任何东西），结果另存一份 ----------
CK=/tmp/cmcp-uninstall-check.txt; bad=0
chk() { if eval "$2"; then r="✓"; else r="✗"; bad=1; fi; echo "  $r $1"; echo "$r $1" >> $CK; }
echo "卸载检查（$(date '+%Y-%m-%d %H:%M')）" > $CK
echo "卸载检查："
chk "面板和看门狗服务已删除" '[ ! -e /etc/init.d/claude-mcp ] && [ ! -e /etc/init.d/cmcp-watchdog ]'
chk "面板网页服务、面板隧道已停止" '! ps w 2>/dev/null | grep -v grep | grep -q "uhttpd.*18765\|claude-mcp-tunnel"'
chk "程序文件已删除" '! ls /usr/sbin/cmcp-* >/dev/null 2>&1 && [ ! -e /www-claude-mcp ] && [ ! -e /usr/share/ucode/cmcp ] && [ ! -e /etc/hotplug.d/ntp/90-cmcp-synced ]'
chk "小闪存模式下载的 cloudflared 已删除" '[ ! -e /tmp/cmcp-cfd ]'
chk "定时任务已删除" '! grep -q "/usr/sbin/cmcp-" /etc/crontabs/root 2>/dev/null'
chk "防火墙规则（设备暂停）已删除" '! { iptables -t mangle -S 2>/dev/null; ip6tables -t mangle -S 2>/dev/null; } | grep -q CMCP_PAUSE'
chk "隧道直连设置已删除（dnsmasq、各代理插件的直连名单）" '! find /tmp /var/etc -maxdepth 3 -name cmcp-tunnel.conf 2>/dev/null | grep -q . && ! grep -rqs "\[cmcp-tunnel\]" /etc/openclash/custom /etc/passwall /usr/share/passwall /usr/share/passwall2 /etc/ssrplus'
chk "路由器登录账号（rpcd 里的 cmcp）已删除" '! uci -q show rpcd 2>/dev/null | grep -q "username=.cmcp."'
chk "系统升级保留列表已清理" '! grep -q "cmcp\|claude-mcp" /etc/sysupgrade.conf 2>/dev/null'
[ "$1" = --purge ] && chk "设置和记录（/etc/claude-mcp）已删除" '[ ! -e /etc/claude-mcp ]'
UC_LEFT=""; for f in $UCF_LIST; do [ -e "$RT$f" ] && UC_LEFT="$UC_LEFT $f"; done
[ "$1" = --purge ] && [ -n "$UCF_LIST" ] && chk "从 OpenWrt 官方补装的 ucode 已删除" '[ -z "$UC_LEFT" ]'
if [ $bad = 0 ]; then echo "检查通过：面板的东西都清理干净了。" | tee -a $CK; else echo "有没清理干净的（上面打 ✗ 的），可以把 $CK 的内容发给开发者。" | tee -a $CK; fi
[ "$1" != --purge ] && [ -n "$UCF_LIST" ] && echo "安装时从 OpenWrt 官方补装的 ucode 保留着（固件的软件源里没有，别的程序可能也用上了）；不需要的话运行 sh uninstall.sh --purge 一起删掉"
echo "检查记录存在 $CK（重启后会清空）。cloudflared 软件包保留着（别的程序可能也在用），不需要的话：opkg remove cloudflared（用小闪存模式的没装进闪存，不用删）"
