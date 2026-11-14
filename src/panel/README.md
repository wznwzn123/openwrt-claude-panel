# 面板源文件

路由器上的面板是一个文件 `src/www/panel/index.html`，由这里的文件按文件名顺序拼成（拼出来和拆开前一模一样）：

| 文件 | 内容 |
|---|---|
| 00-head.html | 页头、深色模式提前判断 |
| 10-style.css | 全部样式 |
| 20-body.html | 页面结构 |
| 30-core.js | 公共函数、请求、导航、通用组件 |
| 31-form.js | 通用表单（OpenClash 选项） |
| 32-home.js | 概览 |
| 33-proxy.js | 节点 |
| 34-subs.js | 订阅 |
| 35-files.js | 配置文件 / 代理集 / 规则集 / 备份 |
| 36-settings.js | 插件设置 / 覆写设置 |
| 37-rules.js | 规则 |
| 38-log.js | 日志 |
| 39-system.js | 设备、连接、系统、看门狗、通知、对话、更新等 |
| 40-luci.js | 原版页面 |
| 41-slog.js | 系统日志 |
| 42-proc.js | 进程、启动 |
| 90-tail.html | 结尾 |

改完运行 `node tools/build-src.mjs` 重新拼；测试：`sh tests/panel/run-all.sh`。
