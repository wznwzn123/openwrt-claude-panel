// 6.0 第 86 项：还停在旧版本的托管路由器，提醒主账号升级（推送到手机 + 发邮件）
// 自动提醒：最新版是「必须更新」（发布说明写了【必须更新】，或者路由器低于「最低版本」）、路由器 30 天内上过线。
//   用户 11/27 定：同一个必须更新的版本最多自动提醒 3 次（发现时、1 周后、再 2 周后），之后不再发；有新的必须更新版本再从头算。
//   升级了就不再提醒。邮件底下有「不再提醒这台路由器」（官网 /app?ovoff=专属网址编号，主账号登录后确认），点了自动、手动都不再发。
//   每 6 小时（或者发了新版本时）看一遍，一次最多提醒 25 台。
// 手动提醒：管理后台「路由器」筛「旧版本」→「提醒升级」，只要有新版本就提醒（同一台 12 小时内只提醒一次）。
// 怎么说：v2.0.2 起一键更新能用 → 打开面板点「一键更新」；
//         v2.0.1 及更早（一键更新有毛病或者没有）、心跳里报不上版本的（v1.3.0 及更早）→ 在路由器终端运行一次升级命令（网址和设置都保留）
const DAY = 86400e3;
export const OV_NMAX = 3, OV_WAIT = [0, 7 * DAY, 14 * DAY]; // 第 2 次等 7 天，第 3 次再等 14 天
export const OV_WEEK = 7 * DAY, OV_GAP = 12 * 3600e3, OV_SEEN = 30 * DAY, OV_SCAN = 6 * 3600e3, OV_SELF = '2.0.2', OV_MAX = 25, OV_MAX_MANUAL = 100;
const num = (v) => /^\d+(\.\d+){0,3}$/.test(String(v || ''));
const clean = (v) => String(v || '').replace(/^v/, '');
// a 比 b 新
export function vNewer(a, b) {
	const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
	for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
	return false;
}
// 这台路由器要不要提醒。ver 是心跳报上来的版本，报不上的算很旧；dev 这类不是数字的不管
export function ovNeed(rv, ver, manual) {
	if (!rv || !num(rv.version)) return false;
	ver = clean(ver);
	if (ver && !num(ver)) return false;
	const v = ver || '0';
	if (!vNewer(rv.version, v)) return false;
	return !!manual || !!rv.force || (num(rv.min) && vNewer(rv.min, v));
}
// 一键更新能不能用（v2.0.2 起）
export const ovSelf = (ver) => num(clean(ver)) && !vNewer(OV_SELF, clean(ver));
// 升级命令：跟官网「装新路由器」那条一样，只是不带安装码（已经开通过的路由器会保留原来的网址）
export const ovCmd = (host) => 'cd /tmp && wget -O p.tar.gz https://' + host + '/dl/openwrt-claude-panel-hosted.tar.gz && tar xzf p.tar.gz && cd openwrt-claude-panel && sh install.sh';
const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function installOldVer(Hub) {
	Object.assign(Hub.prototype, {
		// rv：最新版本信息（hub.js 的 routerVerInfo）；o.subs：管理员手动提醒的那几台
		async ovTick(rv, o = {}) {
			const now = Date.now(), out = { sent: 0, skip: 0, list: [] };
			if (!rv || !num(rv.version)) return out;
			const want = Array.isArray(o.subs) ? new Set(o.subs) : null, max = want ? OV_MAX_MANUAL : OV_MAX;
			for (const d of await this.devices()) {
				if (want && !want.has(d.sub)) continue;
				if (out.sent >= max) { out.skip++; continue; }
				if (d.state !== 'ok' || d.off) { if (want) out.skip++; continue; }
				let b;
				try { b = await this.watch(d.sub).brief(); } catch (e) { if (want) out.skip++; continue; }
				const k = 'ov:' + d.sub, rec = await this.ctx.storage.get(k);
				if (!b.last || now - b.last > OV_SEEN || !ovNeed(rv, b.ver, !!want)) {
					// 升级了（或者不用提醒了）：清掉记录，下次有新的必须更新再从头提醒
					if (rec && ovNeed(rv, b.ver, true) === false) await this.ctx.storage.delete(k);
					if (want) out.skip++;
					continue;
				}
				if (await this.ctx.storage.get('ovoff:' + d.sub)) { out.skip++; continue; } // 主人点过「不再提醒」
				const same = !!rec && rec.to === rv.version, n = same ? rec.n || 1 : 0;
				if (same && !want && n >= OV_NMAX) { out.skip++; continue; } // 这个版本已经自动提醒满 3 次
				if (same && now - (rec.at || 0) < (want ? OV_GAP : OV_WAIT[Math.min(n, OV_NMAX - 1)])) { out.skip++; continue; }
				const r = await this.ovSend(d, b.ver, rv);
				await this.ctx.storage.put(k, { at: now, to: rv.version, from: clean(b.ver), n: n + 1, push: r.push, mail: r.mail, by: want ? 'admin' : 'auto' });
				out.sent++; out.list.push(d.sub);
			}
			return out;
		},
		// 发一次提醒：推送到这台路由器登记过的手机（和微信推送），再给主账号发邮件（邮箱验证过的才发）
		async ovSend(d, ver, rv) {
			const v = clean(ver), self = ovSelf(v), host = this.env.BASE_DOMAIN, nm = String(d.name || d.sub).slice(0, 40);
			const cur = v ? 'v' + v : '很旧的版本', must = ovNeed(rv, v, false);
			const title = (must ? '路由器面板必须更新到 v' : '路由器面板可以更新到 v') + rv.version;
			const body = self
				? `「${nm}」还是 ${cur}${must ? '，这次是必须更新' : ''}。打开面板，在弹出的提示里点「一键更新」，一两分钟就好，网址和设置都保留。`
				: `「${nm}」还是 ${cur}，太旧了，一键更新用不了：在官网「我的路由器」里点「要手动升级一次」复制升级命令，到路由器后台的终端里运行一次就好，网址和设置都保留。`;
			let push = 0;
			try { push = (await this.watch(d.sub).push({ title, body, tag: 'upd', lvl: 'warn', url: './?p=home&ask=update', force: true })) || 0; } catch (e) {}
			let mail = false;
			const own = this.famOf(d).owner, u = own ? await this.ctx.storage.get('u:' + own) : null;
			if (u && u.email && u.verified) {
				const steps = self
					? `<ol><li>打开 <a href="https://${esc(host)}/app">官网「我的路由器」</a>，点这台路由器的「打开面板」</li><li>在弹出的提示里点「一键更新」，等一两分钟</li></ol>`
					: `<p>这台路由器的版本太旧，面板里的「一键更新」用不了，要手动升级一次：</p><ol><li>手机连上家里的 Wi-Fi，打开路由器后台「服务 → 终端」（或者用电脑 SSH 登录路由器，用户名 root）</li><li>粘贴下面这条命令，回车：<pre style="white-space:pre-wrap;word-break:break-all;background:#f4f4f5;padding:8px;border-radius:6px">${esc(ovCmd(host))}</pre></li><li>问「装哪个版本」时直接回车（默认就是现在装的），等它装完</li></ol><p>命令也可以在 <a href="https://${esc(host)}/app">官网「我的路由器」</a>里点「要手动升级一次」复制。</p>`;
				const html = `<p>你好，</p><p>你的路由器「<b>${esc(nm)}</b>」上的路由器面板还是 <b>${esc(cur)}</b>，最新是 <b>v${esc(rv.version)}</b>${must ? '，这次是<b>必须更新</b>' : ''}。</p>${steps}<p>升级不会断网，网址、登录着的手机和所有设置都保留。</p><p style="color:#71717a">升级好就不会再收到。这个版本最多提醒 3 次。<br><a style="color:#71717a" href="https://${esc(host)}/app?ovoff=${encodeURIComponent(d.sub)}">不再提醒这台路由器</a></p>`;
				try { mail = await this.mail(u.email, title, html); } catch (e) {}
			}
			return { push, mail };
		},
	});
}
// 官网账号：主人点邮件里的「不再提醒这台路由器」，登录后确认（只有这台路由器的主账号能关）
export async function ovAccount(a, H, me, b) {
	if (a !== 'ov_off') return null;
	// 路由代码拿到的 H 是远程句柄：只能调方法（不能读 H.ctx，famOf 这种同步方法也会变成 Promise）
	const sub = String((b && b.sub) || '').slice(0, 40), peek = !!(b && b.peek);
	const r = await H.ovSet(sub, { uid: me.uid, peek, off: true });
	const J = (o, st) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json' } });
	if (r.st !== 200) return J({ error: r.st === 404 ? '只有这台路由器的主账号能关掉提醒' : r.error }, 403);
	if (!peek) await H.alog('ov_off', sub, '主人关掉了升级提醒', me.uid);
	const { st, ...o } = r;
	return J(o, 200);
}
// 定时任务（每小时一次）里调用：发了新版本时马上看一遍，平时每 6 小时看一遍
export async function ovScheduled(H, rv) {
	if (!rv || !num(rv.version)) return;
	const now = Date.now(), last = await H.meta('ovScan');
	if (last && last.ver === rv.version && now - (last.at || 0) < OV_SCAN) return;
	await H.setMeta('ovScan', { at: now, ver: rv.version });
	await H.ovTick(rv);
}
