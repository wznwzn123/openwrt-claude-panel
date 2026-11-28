// 官网「更新日志」（/changelog）：从 GitHub 的发布记录里取每个版本自己的「这个版本的更新」那一节，整理成结构化数据。
// 内容全部来自真实的发布说明，不另外写；新版本发布后几分钟内自动出现（官网缓存 5 分钟）。
// 每个版本：{ v: 'v5.2.1', at: 毫秒时间, must: 是否必须更新, major: x.0.0, sec: 有没有安全相关, groups: [{ t: '小标题', items: ['…'] }], note: '更新后用法…' }
// 文字里只保留两种标记：**加粗**、`代码`（页面上先转义再换成标签）；链接只留文字

const clean = (s) => String(s || '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();

// 「这个版本的更新」那一节：到下一个版本的「vX 的更新：」、「怎么升级」或下一个二级标题为止
export function sectionOf(body) {
	const b = String(body || '').replace(/\r/g, '');
	const m = /## 这个版本的更新\n([\s\S]*?)(?=\nv\d+\.\d+\.\d+ 的更新|\n\*\*怎么升级|\n## |$)/.exec(b);
	return m ? m[1].trim() : null;
}

export function parseNotes(body) {
	const sec = sectionOf(body);
	const groups = [];
	let note = '';
	const cur = () => { if (!groups.length) groups.push({ t: '', items: [] }); return groups[groups.length - 1]; };
	if (sec != null) {
		for (const raw of sec.split('\n')) {
			const line = raw.trim();
			if (!line) continue;
			const h = /^\*\*([^*]+?)[：:]\*\*$/.exec(line);
			if (h) { groups.push({ t: clean(h[1]), items: [] }); continue; }
			const li = /^(?:[-*•]|\d+\.)\s+(.*)$/.exec(line);
			if (li) { const x = clean(li[1]); if (x) cur().items.push(x); continue; }
			if (/^更新后/.test(line)) { note = clean(line); continue; }
			const x = clean(line); if (x) cur().items.push(x);
		}
	} else {
		// 首个版本没有「这个版本的更新」：取第一段说明和「下载哪个」表格里每个版本包含什么
		const b = String(body || '').replace(/\r/g, '');
		const first = clean((b.split('\n\n')[0] || '').trim());
		if (first) cur().items.push(first);
		for (const row of b.split('\n')) {
			const c = row.split('|').map((x) => x.trim());
			if (c.length >= 5 && /^\*\*[^*]+\*\*$/.test(c[1]) && c[3] && !/^-+$/.test(c[3])) cur().items.push(clean(c[1]).replace(/\*\*/g, '') + '：' + clean(c[3]));
		}
	}
	return { groups: groups.filter((g) => g.items.length).map((g) => ({ t: g.t, items: g.items.slice(0, 40).map((x) => x.slice(0, 600)) })), note: note.slice(0, 200) };
}

// 补丁说明 → 一行一条（去掉最后「只给 vX 的路由器」那行）
export function hotItems(body) {
	return String(body || '').replace(/\r/g, '').split('\n').map((x) => clean(x.replace(/^(?:[-*•]|\d+\.)\s+/, ''))).filter((x) => x && !/^只给 v\d/.test(x)).slice(0, 10).map((x) => x.slice(0, 300));
}
// GitHub 发布列表（/releases 接口的结果）→ 更新日志（新的在前）
export function changelogOf(list) {
	const out = [], hot = {};
	// 热补丁（预发布 hot-<版本>-<编号>）：挂到那个版本下面「修复补丁」，说明取发布说明里写的（去掉最后「只给 vX 的路由器」那行）
	for (const r of Array.isArray(list) ? list : []) {
		const m = r && !r.draft && /^hot-(\d+\.\d+\.\d+)-(\d{1,4})$/.exec(String(r.tag_name || ''));
		if (!m || +m[2] === 0) continue; // V0 = 正式版原样（只用来退回），不列
		(hot['v' + m[1]] = hot['v' + m[1]] || []).push({ n: +m[2], at: Date.parse(r.published_at || r.created_at || '') || 0, items: hotItems(r.body) });
	}
	for (const r of Array.isArray(list) ? list : []) {
		if (!r || r.draft || r.prerelease) continue;
		const v = String(r.tag_name || '');
		if (!/^v\d+\.\d+\.\d+$/.test(v)) continue;
		const body = String(r.body || '');
		const { groups, note } = parseNotes(body);
		if (!groups.length) continue;
		const all = groups.flatMap((g) => [g.t, ...g.items]).join('\n');
		out.push({
			v, at: Date.parse(r.published_at || r.created_at || '') || 0,
			must: new RegExp('最低版本[:：]\\s*' + v.replace(/\./g, '\\.') + '\\s*【必须更新】').test(body),
			major: /^v\d+\.0\.0$/.test(v),
			sec: groups.some((g) => /安全/.test(g.t)) || /安全更新/.test(all),
			first: /^首个版本/.test(body.trim()),
			groups, note,
			...(hot[v] ? { hot: hot[v].sort((a, b) => b.n - a.n).slice(0, 30) } : {}),
		});
	}
	const num = (v) => v.slice(1).split('.').map(Number);
	out.sort((a, b) => { const x = num(a.v), y = num(b.v); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; });
	return out;
}
// 在 tar 流里找一个文件（只认名字，忽略开头的 ./）：{ data, mtime }；文件太大、读超过 limit 字节、没找到都回 null
export async function tarFind(stream, want, maxSize, limit) {
	const rd = stream.getReader(), chunks = [];
	let have = 0, read = 0;
	const fill = async (n) => { while (have < n) { const { value, done } = await rd.read(); if (done) return false; read += value.length; if (read > limit) return false; chunks.push(value); have += value.length; } return true; };
	const take = (n) => { const out = new Uint8Array(n); let p = 0; while (p < n) { const c = chunks[0], m = Math.min(c.length, n - p); out.set(c.subarray(0, m), p); p += m; if (m === c.length) chunks.shift(); else chunks[0] = c.subarray(m); } have -= n; return out; };
	const skip = async (n) => { while (n > 0) { if (!have && !(await fill(1))) return false; const c = chunks[0], m = Math.min(c.length, n); n -= m; have -= m; if (m === c.length) chunks.shift(); else chunks[0] = c.subarray(m); } return true; };
	const str = (b) => new TextDecoder().decode(b).replace(/\0[\s\S]*$/, '');
	try {
		for (;;) {
			if (!(await fill(512))) return null;
			const h = take(512);
			if (h.every((b) => b === 0)) return null;
			const name = (str(h.subarray(345, 500)) ? str(h.subarray(345, 500)) + '/' : '') + str(h.subarray(0, 100));
			const size = parseInt(str(h.subarray(124, 136)).trim() || '0', 8) || 0, mtime = parseInt(str(h.subarray(136, 148)).trim() || '0', 8) || 0;
			const pad = Math.ceil(size / 512) * 512;
			if (name.replace(/^\.\//, '') === want && (h[156] === 48 || h[156] === 0)) {
				if (size > maxSize || !(await fill(pad))) return null;
				const data = take(size);
				return { data, mtime };
			}
			if (!(await skip(pad))) return null;
		}
	} finally { try { await rd.cancel(); } catch (e) {} }
}
