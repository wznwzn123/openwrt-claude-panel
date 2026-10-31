-- 把 OpenClash 的一行日志翻译成中文（和 OpenClash 网页上开关旁边那行提示一样）。从标准输入读一行
local i = require "luci.i18n"
i.setlanguage("zh_cn")
local last = io.read("*l") or ""
local res = { t = "", lv = "", msg = "" }
if last:match("%S") then
	local t, lv, msg = last:match("^(%d+%-%d+%-%d+ %d+:%d+:%d+) %[([^%]]+)%] ?(.*)$")
	if not t then
		res.msg = i.translate(last)
	else
		local pre, rest = msg:match("^(【[^】]*】)(.*)$")
		res.t, res.lv = t, i.translate(lv)
		res.msg = pre and (pre .. i.translate(rest)) or i.translate(msg)
	end
end
print(require("luci.jsonc").stringify(res))
