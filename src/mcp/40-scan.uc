/* ---------------- 6.0 第 26 项：局域网深度扫描（找出没走 DHCP、手动设了 IP 的设备） ----------------
 * 用户 11/26 定：设备页点「扫描」才扫，不定时扫。只扫家里网段（太大的网段只扫路由器所在的那个 /24）：
 * 对每个地址 ping 一下（设备不回 ping 也会回 ARP），然后看 ARP 表；DHCP 里没有的记进 scan.json，设备列表里一直留着（30 天没再见到就删）。
 * 一次最多同时 64 个 ping，小内存路由器也扛得住。 */
P.lan_scan = function() {
	if (own_only()) die('只有能看所有设备的家人能扫描');
	let lan = pf_lan();
	if (!lan) die('没有家里网络（lan）的设置');
	let pl = lan.pl, base, size, part = null;
	if (pl < 22) { pl = 24; part = true; }
	size = pow2(32 - pl); base = v4int(lan.ip) - v4int(lan.ip) % size;
	let ips = [];
	for (let i = 1; i < size - 1; i++) { let ip = ls_int2ip(base + i); if (ip != lan.ip) push(ips, ip); }
	let pb = getenv('CMCP_PING') || 'ping';
	for (let i = 0; i < length(ips); i += 64) {
		let c = [];
		for (let ip in slice(ips, i, i + 64)) push(c, sprintf('%s -c 1 -W 1 %s >/dev/null 2>&1 &', pb, ip));
		sh(join(' ', c) + ' wait');
	}
	let leases = lease_map(), known = {}, sc = cmcp_readj(SCAN_F, {}), now = time(), found = 0, fresh = [];
	if (type(sc) != 'object') sc = {};
	for (let ip, l in leases) if (l.mac) known[l.mac] = 1;
	for (let l in split(readfile(ARP_F) ?? '', '\n')) {
		let m = match(l, /^(\d+\.\d+\.\d+\.\d+)\s+\S+\s+(0x\S+)\s+([0-9a-fA-F:]{17})\s+\S+\s+(\S+)/);
		if (!m || m[2] == '0x0' || m[3] == '00:00:00:00:00:00' || !cidr_has(lan.ip, lan.pl, m[1]) || m[1] == lan.ip) continue;
		found++;
		let mac = lc(m[3]);
		if (known[mac]) continue;
		if (!sc[mac]) push(fresh, { ip: m[1], mac, name: CL.dev_label(mac, null) });
		sc[mac] = { ip: m[1], at: now };
	}
	for (let mac in keys(sc)) if (type(sc[mac]) != 'object' || now - (+sc[mac].at || 0) > 30 * 86400 || known[mac]) delete sc[mac];
	cmcp_writej(SCAN_F, sc);
	return { found, fresh, range: ls_int2ip(base) + '/' + pl, part };
};
