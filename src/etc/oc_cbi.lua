-- 面板辅助：用 LuCI 自己的 CBI 加载 OpenClash 页面定义
-- lua oc_cbi.lua schema <page> [sid]        导出全部选项（标题、可选值、依赖、默认值、对应文件）
-- lua oc_cbi.lua press  <page> <option> [sid]  按原版逻辑执行页面上的按钮
local mode, page, a3, a4 = arg[1], arg[2], arg[3], arg[4]
local PAGES = {
	["settings"] = true, ["config-overwrite"] = true, ["config-subscribe"] = true,
	["config-subscribe-edit"] = true, ["custom-dns-edit"] = true,
}
local J = require "luci.jsonc"
local function out(t) io.write(J.stringify(t)) io.write("\n") os.exit(0) end
local function fail(m) out({ error = m }) end
if not PAGES[page or ""] then fail("unknown page") end
local sid
if mode == "press" then sid = a4 else sid = a3 end
if sid and not sid:match("^[%w_]+$") then fail("bad sid") end

_G.L = {
	http = setmetatable({}, { __index = function() return function() end end }),
	ctx = { request_path = { "admin", "services", "openclash" }, request_args = {} },
	dispatcher = {
		lang = "zh_cn",
		build_url = function(...) return "/" .. table.concat({ ... }, "/") end,
		menu_json = function() return {} end,
		error404 = function() end, error500 = function() end,
		is_authenticated = function() return nil end,
	},
}
require "luci.i18n"
luci.i18n.setlanguage("zh_cn")
require "luci.dispatcher"
local http = require "luci.http"
http.redirect = function() end
http.formvalue = function() return nil end
http.write = function() end
http.prepare_content = function() end
http.write_json = function() end

local ocfs = require "luci.openclash"
local orig_read = ocfs.readfile
ocfs.readfile = function(p, ...) _G.__OC_LASTREAD = p return orig_read(p, ...) end

local cbi = require "luci.cbi"
local ok, maps = pcall(cbi.load, "openclash/" .. page, sid)
if not ok then fail(tostring(maps)) end

local function strip(s)
	if type(s) ~= "string" then return s end
	s = s:gsub("<br%s*/?>", "\n"):gsub("<[^>]+>", ""):gsub("&nbsp;", " "):gsub("&gt;", ">"):gsub("&lt;", "<"):gsub("&amp;", "&")
	return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function first_sid(s)
	if s.section then return s.section end
	local ok2, list = pcall(s.cfgsections, s)
	if ok2 and list and list[1] then return list[1] end
	return nil
end

if mode == "press" then
	local opt = a3
	for _, m in ipairs(maps) do
		for _, s in ipairs(m.children or {}) do
			for _, o in ipairs(s.children or {}) do
				if o.option == opt and o.template == "cbi/button" and type(o.write) == "function" then
					local ok3, err = pcall(o.write, o, first_sid(s) or "config")
					if not ok3 then fail(tostring(err)) end
					pcall(m.uci.commit, m.uci, "openclash")
					out({ ok = true })
				end
			end
		end
	end
	fail("找不到这个按钮：" .. tostring(opt))
end

local res = {}
for _, m in ipairs(maps) do
	for _, s in ipairs(m.children or {}) do
		local st = s.sectiontype
		if st and st ~= "table" and st ~= "null" then
			local sec = {
				stype = st, named = s.section ~= nil, title = strip(s.title), desc = strip(s.description),
				addremove = s.addremove and true or false, taborder = s.tab_names, tabs = {}, opts = {},
			}
			local tabof = {}
			if s.tabs then
				for k, t in pairs(s.tabs) do
					sec.tabs[k] = strip(t.title)
					for _, c in ipairs(t.childs or {}) do tabof[c] = k end
				end
			end
			local csid = first_sid(s)
			for _, o in ipairs(s.children or {}) do
				local e = {
					o = o.option, cls = (o.template or ""):gsub("^cbi/", ""), t = strip(o.title), d = strip(o.description),
					def = o.default, tab = tabof[o], dt = o.datatype, ph = o.placeholder, rm = o.rmempty,
				}
				if e.def ~= nil then e.def = tostring(e.def) end
				if o.keylist and #o.keylist > 0 then
					e.k, e.v = {}, {}
					for i, k in ipairs(o.keylist) do e.k[i] = tostring(k) e.v[i] = strip(o.vallist[i]) end
				end
				if o.deps and #o.deps > 0 then
					e.dep = {}
					for _, dd in ipairs(o.deps) do
						local x, n = {}, 0
						for kk, vv in pairs(dd) do
							if type(kk) == "string" then x[(kk:gsub("^cbid%.[^.]+%.[^.]+%.", ""))] = tostring(vv) n = n + 1 end
						end
						if n > 0 then table.insert(e.dep, x) end
					end
				end
				if o.enabled then e.en = tostring(o.enabled) e.dis = tostring(o.disabled) end
				if e.cls == "tvalue" and csid then
					_G.__OC_LASTREAD = nil
					pcall(o.cfgvalue, o, csid)
					if _G.__OC_LASTREAD then e.file = _G.__OC_LASTREAD end
				end
				table.insert(sec.opts, e)
			end
			table.insert(res, sec)
		end
	end
end
out({ page = page, sections = res })
