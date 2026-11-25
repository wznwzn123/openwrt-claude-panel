-- 6.0 第 82 项：原版后台（老版 LuCI，Lua 控制器）「服务 → 路由器面板」：拿一张票，跳到家里局域网的面板（http://路由器地址:906），不用再输密码
module("luci.controller.cmcp", package.seeall)

function index()
	entry({"admin", "services", "cmcp"}, call("action_open"), "路由器面板", 1).leaf = true
end

function action_open()
	local http = require "luci.http"
	local f = io.popen("/usr/libexec/rpcd/cmcp call ticket </dev/null 2>/dev/null")
	local out = f and f:read("*a") or ""
	if f then f:close() end
	local t = out:match('"ticket": "([a-z2-9]+)"')
	local port = out:match('"port": (%d+)') or "906"
	local host = (http.getenv("HTTP_HOST") or ""):gsub(":%d+$", "")
	if t and host ~= "" then
		http.redirect("http://" .. host .. ":" .. port .. "/panel/#lopen=" .. t)
	else
		http.prepare_content("text/plain; charset=utf-8")
		http.write(out:match('"error": "([^"]+)"') or "打不开路由器面板：面板服务没有运行，在终端里运行 /etc/init.d/claude-mcp restart 再试")
	end
end
