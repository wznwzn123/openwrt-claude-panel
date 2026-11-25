'use strict';
'require view';
'require rpc';
// 6.0 第 82 项：原版后台（新版 LuCI）「服务 → 路由器面板」：拿一张票，跳到家里局域网的面板（http://路由器地址:906），不用再输密码
var getTicket = rpc.declare({ object: 'cmcp', method: 'ticket' });
return view.extend({
	load: function () { return getTicket().catch(function () { return null; }); },
	render: function (r) {
		if (r && r.ticket) {
			var h = window.location.hostname;
			if (h.indexOf(':') >= 0) h = '[' + h + ']';
			window.location.href = 'http://' + h + ':' + r.port + '/panel/#lopen=' + r.ticket;
			return E('p', {}, '正在打开路由器面板…');
		}
		return E('p', {}, (r && r.error) || '打不开路由器面板：面板服务没有运行，在终端里运行 /etc/init.d/claude-mcp restart 再试');
	},
	handleSaveApply: null, handleSave: null, handleReset: null
});
