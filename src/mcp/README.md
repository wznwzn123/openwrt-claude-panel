# 路由器服务源文件

路由器上的服务是一个 ucode 文件 `src/www/cgi-bin/mcp`，由这里的文件按文件名顺序拼成（拼出来和拆开前一模一样）。
各文件是同一个程序的不同部分（共用变量），不能单独运行。

| 文件 | 内容 |
|---|---|
| 00-base.uc | 公共函数（命令、读写文件、uci、OpenClash 接口） |
| 10-tools.uc | 给 Claude 用的工具 |
| 20-panel-core.uc | 面板接口：概览 |
| 21-devices.uc | 设备 |
| 22-openclash.uc | OpenClash 设置、文件、配置切换、规则 |
| 23-forms.uc | 选项表单、覆写 |
| 24-watchdog.uc | 看门狗 |
| 25-traffic-speed.uc | 流量、测速 |
| 26-backup.uc | 备份和还原 |
| 27-update.uc | 版本、更新 |
| 28-proxy-plugins.uc | 各代理插件的节点 |
| 29-chat-notice.uc | 实时联系开发者、通知 |
| 30-plugin-switch.uc | 插件切换、节点测速、黑名单等 |
| 90-rpc.uc | 请求入口 |

改完运行 `node tools/build-src.mjs` 重新拼。
