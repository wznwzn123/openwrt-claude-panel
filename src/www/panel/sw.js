// 面板网页先从手机缓存打开（路由器断电、断网、隧道掉线时也能看），同时在后台取新版本，下次打开生效。
// 接口请求和下载永远直连路由器。
const CACHE = 'router-panel-v9';
const BASE = new URL('./', self.location).href;
const SHELL = ['./', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon.svg'];

self.addEventListener('install', (e) => {
	// 一个一个缓存：某个文件取不到不影响其它文件（addAll 只要错一个就全部作废）
	e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) =>
		fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? c.put(u, r) : null)).catch(() => {})))));
	self.skipWaiting();
});
self.addEventListener('activate', (e) => {
	e.waitUntil((async () => {
		const c = await caches.open(CACHE);
		for (const k of await caches.keys()) {
			if (k === CACHE) continue;
			// 新缓存没取到的文件，从旧缓存搬过来，保证升级途中断线也不会丢掉面板
			const old = await caches.open(k);
			for (const req of await old.keys()) if (!(await c.match(req, { ignoreSearch: true }))) await c.put(req, await old.match(req));
			await caches.delete(k);
		}
		await self.clients.claim();
	})());
});
// 面板发现路由器升级了：重新下载一遍面板放进缓存，下载好再告诉它刷新
self.addEventListener('message', (e) => {
	if (!e.data || e.data.t !== 'refresh') return;
	e.waitUntil((async () => {
		const c = await caches.open(CACHE);
		await Promise.all(SHELL.map((u) => fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? c.put(u, r) : null)).catch(() => {})));
		if (e.ports && e.ports[0]) e.ports[0].postMessage('ok');
	})());
});
self.addEventListener('fetch', (e) => {
	const req = e.request, u = new URL(req.url);
	if (req.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/cgi-bin/') || u.pathname.includes('/dl/')) return;
	// 打开网页（不管网址是 /panel/、/panel/index.html 还是带参数）都用同一份面板
	const nav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
	const key = nav ? BASE : req;
	e.respondWith((async () => {
		const c = await caches.open(CACHE);
		const hit = await c.match(key, { ignoreSearch: true }) || (nav ? await c.match(BASE + 'index.html', { ignoreSearch: true }) : null);
		// 打开网页的请求不能带额外参数（浏览器会直接报错），所以按网址重新请求
		const net = fetch(nav ? req.url : req, { cache: 'no-cache' }).then((r) => {
			// 只缓存真正的面板；Cloudflare 的 1033/502 错误页不缓存
			if (r.ok && (!nav || (r.headers.get('content-type') || '').includes('text/html'))) c.put(key, r.clone());
			return r;
		});
		if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
		try { return await net; } catch (x) { return Response.error(); }
	})());
});

// 手机推送：路由器出问题时，Cloudflare 推过来，这里显示成系统通知
self.addEventListener('push', (e) => {
	let d = {};
	try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
	e.waitUntil((async () => {
		let shown = true, err = null;
		try {
			await self.registration.showNotification(d.title || '我的路由器', { body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag, icon: 'icon-192.png', badge: 'icon-192.png', timestamp: d.t || Date.now(), requireInteraction: d.lvl === 'err', data: { url: d.url || './?p=wd' } });
		} catch (x) { shown = false; err = String((x && x.message) || x); }
		// 告诉云端「这台手机收到了」，面板上能看到推送到底有没有送达
		if (d.id) {
			let perm = '';
			try { perm = self.Notification ? self.Notification.permission : ''; } catch (x) {}
			try { await fetch(new URL('../cloud/push/ack', self.registration.scope).href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id, shown, err, perm }), cache: 'no-store' }); } catch (x) {}
		}
		try { for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) c.postMessage({ pushed: { id: d.id, shown, err } }); } catch (x) {}
	})());
});
self.addEventListener('notificationclick', (e) => {
	e.notification.close();
	const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
	const p = new URL(url).searchParams.get('p');
	e.waitUntil((async () => {
		const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
		for (const c of cs) {
			if (c.url.startsWith(BASE)) { if (p) c.postMessage({ go: p }); return c.focus(); }
		}
		return self.clients.openWindow(url);
	})());
});
