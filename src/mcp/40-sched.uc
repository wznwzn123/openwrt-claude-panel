/* ---------------- 6.0 第 31、35 项：定时重启、定时关 Wi-Fi、手动关机 ----------------
 * 用户 11/26 定：定时开关机改成「定时重启 + 定时关 Wi-Fi」，关机只做手动按钮（写清「关了要拔插电源才能开」）。
 * 设置存 /etc/claude-mcp/sched.json，写进计划任务（/etc/crontabs/root，行尾带 # cmcp-sched，只动自己的行），时间按路由器的时区。
 * 只有主账号能设（sched_set、poweroff 不在任何权限组里）；大家都能看（sched_get 在 view 组）。 */
const SC_F = ETC + '/sched.json', SC_CRON = getenv('CMCP_CRONTAB') || '/etc/crontabs/root', SC_TAG = '# cmcp-sched';
function sc_read() { let o = cmcp_readj(SC_F, {}); return type(o) == 'object' ? o : {}; }
function sc_hm(s, what) { let m = match('' + (s ?? ''), /^([01][0-9]|2[0-3]):([0-5][0-9])$/); if (!m) die(what + '不对，比如 04:00'); return [+m[2], +m[1]]; }
function sc_days(d) {
	let o = [];
	for (let x in (type(d) == 'array' ? d : [])) if (+x >= 0 && +x <= 6 && index(o, +x) < 0) push(o, +x);
	if (!length(o)) die('至少选一天');
	return sort(o, (a, b) => a - b);
}
function sc_cron(o) {
	let old = split(readfile(SC_CRON) ?? '', '\n'), out = filter(old, (l) => length(l) && index(l, SC_TAG) < 0);
	let dw = (d) => length(d) == 7 ? '*' : join(',', d);
	if (o.reboot?.on) { let t = sc_hm(o.reboot.at, '时间'); push(out, sprintf('%d %d * * %s %s/cmcp-sched reboot %s', t[0], t[1], dw(o.reboot.days), SBIN, SC_TAG)); }
	if (o.wifi?.on) {
		let a = sc_hm(o.wifi.off, '关的时间'), b = sc_hm(o.wifi.on_at, '开的时间');
		push(out, sprintf('%d %d * * %s %s/cmcp-sched wifioff %s', a[0], a[1], dw(o.wifi.days), SBIN, SC_TAG));
		push(out, sprintf('%d %d * * * %s/cmcp-sched wifion %s', b[0], b[1], SBIN, SC_TAG));
	}
	writefile(SC_CRON + '.tmp', join('\n', out) + '\n');
	rename(SC_CRON + '.tmp', SC_CRON);
	let f = getenv('CMCP_NG_RUN');
	bg(f ? 'echo /etc/init.d/cron restart >> ' + shq(f) : '/etc/init.d/cron restart');
}
P.sched_get = function() {
	let o = sc_read();
	return { reboot: o.reboot ?? { on: false, days: [0, 1, 2, 3, 4, 5, 6], at: '04:00' }, wifi: o.wifi ?? { on: false, days: [0, 1, 2, 3, 4, 5, 6], off: '23:30', on_at: '07:00' }, sta: !!match(readfile(ucdir() + '/wireless') ?? '', /option mode '?sta'?/), owner: ROLE == 'owner' };
};
// a: { reboot: { on, days, at } } 或 { wifi: { on, days, off, on_at } }
P.sched_set = function(a) {
	let o = sc_read();
	if (a?.reboot) { let r = a.reboot; o.reboot = { on: !!r.on, days: sc_days(r.days ?? [0, 1, 2, 3, 4, 5, 6]), at: r.at ?? '04:00' }; sc_hm(o.reboot.at, '时间'); }
	if (a?.wifi) {
		let w = a.wifi;
		if (w.on && !stat(ucdir() + '/wireless')) die('这台路由器没有无线');
		o.wifi = { on: !!w.on, days: sc_days(w.days ?? [0, 1, 2, 3, 4, 5, 6]), off: w.off ?? '23:30', on_at: w.on_at ?? '07:00' };
		sc_hm(o.wifi.off, '关的时间'); sc_hm(o.wifi.on_at, '开的时间');
		if (o.wifi.off == o.wifi.on_at) die('关和开不能是同一个时间');
	}
	cmcp_writej(SC_F, o);
	sc_cron(o);
	return P.sched_get();
};
// 手动关机：关了要拔插电源才能开
P.poweroff = function(a) {
	if (a?.confirm != 'OFF') die('需要确认');
	try { sh(sprintf('%s/cmcp-notify warn sched %s %s sched >/dev/null 2>&1', SBIN, shq('路由器关机了'), shq('要拔插电源才能开。'))); } catch (e) {}
	let f = getenv('CMCP_NG_RUN');
	bg(f ? 'echo poweroff >> ' + shq(f) : 'sleep 2; poweroff');
	return { ok: true };
};
