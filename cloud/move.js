// 6.0 第 29 项：换路由器一键搬家（官网这边）
// 旧路由器把面板的设置打成包、用随机钥匙加密后放这里（只存密文，钥匙只在「搬家码」里，官网解不开），24 小时内有效、用一次；
// 新路由器凭搬家码拿走：两台路由器的主账号必须是同一个人（只能搬到自己账号下的路由器）。
// 搬完：旧路由器的家人（子账号和权限）转到新路由器，旧路由器上的家人去掉（风险 15：一台路由器一个主账号），两边都记一笔。
const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const ABC = 'abcdefghijkmnpqrstuvwxyz23456789';
const rnd = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => ABC[x & 31]).join('');
const MV_RE = /^[a-z2-9]{8}$/, DAY = 86400e3;

export function installMove(Hub) {
	Object.assign(Hub.prototype, {
		moveOwner(d) { return d ? this.famOf(d).owner : ''; },
		// 旧路由器：放密文
		devMovePut(a) { return this.lock(() => this._devMovePut(a)); },
		async _devMovePut({ sub, rkey, blob }) {
			if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
			if (typeof blob !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(blob) || blob.length > 400000) return { st: 400, error: '搬家包不对（太大或者格式不对）' };
			const d = await this.ctx.storage.get('d:' + sub), owner = this.moveOwner(d);
			if (!owner) return { st: 400, error: '这台路由器还没有主账号' };
			if (!(await this.hit('mvp:' + sub, 10, 3600e3))) return { st: 429, error: '打包得太频繁了：一小时后再试' };
			// 重新打包：之前的搬家码作废
			const old = await this.ctx.storage.get('mvs:' + sub);
			if (old) await this.ctx.storage.delete('mv:' + old);
			const id = rnd(8);
			await this.ctx.storage.put({ ['mv:' + id]: { from: sub, owner, blob, exp: Date.now() + DAY }, ['mvs:' + sub]: id });
			return { st: 200, ok: true, id, exp: Date.now() + DAY };
		},
		// 新路由器：拿密文（主账号要是同一个人）
		devMoveGet(a) { return this.lock(() => this._devMoveGet(a)); },
		async _devMoveGet({ sub, rkey, id }) {
			if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
			if (!(await this.hit('mvg:' + sub, 20, 3600e3))) return { st: 429, error: '试得太多了：一小时后再试' };
			const m = MV_RE.test(id || '') ? await this.ctx.storage.get('mv:' + id) : null;
			if (!m || m.exp < Date.now()) return { st: 404, error: '搬家码不对或者过期了：在旧路由器上重新打包' };
			if (m.from === sub) return { st: 400, error: '这就是旧路由器：在新路由器上输搬家码' };
			const d = await this.ctx.storage.get('d:' + sub);
			if (this.moveOwner(d) !== m.owner) return { st: 403, error: '只能搬到你自己账号下的路由器（两台的主账号要是同一个人）' };
			const od = await this.ctx.storage.get('d:' + m.from);
			return { st: 200, ok: true, blob: m.blob, from: m.from, fromName: (od && od.name) || m.from };
		},
		// 新路由器搬完：家人转过来、搬家包删掉
		devMoveDone(a) { return this.lock(() => this._devMoveDone(a)); },
		async _devMoveDone({ sub, rkey, id, fam }) {
			if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
			const m = MV_RE.test(id || '') ? await this.ctx.storage.get('mv:' + id) : null;
			if (!m) return { st: 404, error: '搬家码不对或者过期了' };
			const d = await this.ctx.storage.get('d:' + sub), od = await this.ctx.storage.get('d:' + m.from);
			if (!d || this.moveOwner(d) !== m.owner) return { st: 403, error: '只能搬到你自己账号下的路由器' };
			let moved = 0;
			if (fam && od) {
				const f = this.famOf(od);
				for (const [uid, x] of Object.entries(f.subs || {})) {
					if (uid === m.owner) continue;
					const u = await this.ctx.storage.get('u:' + uid);
					if (!u) continue;
					d.users = [...new Set([...(d.users || []), uid])];
					d.subs = { ...(d.subs || {}), [uid]: { ...x, at: Date.now() } };
					u.devs = [...(u.devs || []).filter((y) => y.sub !== m.from && y.sub !== sub), { sub, at: Date.now() }];
					od.users = (od.users || []).filter((y) => y !== uid); delete od.subs[uid];
					await this.ctx.storage.put('u:' + uid, u);
					moved++;
				}
				await this.ctx.storage.put({ ['d:' + sub]: d, ['d:' + m.from]: od });
			}
			await this.ctx.storage.delete(['mv:' + id, 'mvs:' + m.from]);
			const nm = (od && od.name) || m.from;
			await this.rlog(sub, '📦', '从「' + nm + '」搬来了面板设置' + (moved ? '，家人 ' + moved + ' 个一起转过来了' : ''));
			if (od) await this.rlog(m.from, '📦', '面板设置搬到了「' + (d.name || sub) + '」' + (moved ? '，家人也转过去了' : ''));
			return { st: 200, ok: true, fam: moved };
		},
	});
}
// 路由器那边的接口（凭 RKEY）
export async function moveDev(p, H, b) {
	const s = (v) => String(v == null ? '' : v);
	let r = null;
	if (p === '/api/dev/move_put') r = await H.devMovePut({ sub: s(b.sub), rkey: s(b.rkey), blob: b.blob });
	else if (p === '/api/dev/move_get') r = await H.devMoveGet({ sub: s(b.sub), rkey: s(b.rkey), id: s(b.id) });
	else if (p === '/api/dev/move_done') r = await H.devMoveDone({ sub: s(b.sub), rkey: s(b.rkey), id: s(b.id), fam: b.fam === true });
	if (!r) return null;
	const { st, ...rest } = r;
	return J(rest, st);
}
