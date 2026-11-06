# 合成源码契约

本目录是为 Skill 评估独立编写的虚构服务，不是实际产品、历史漏洞或可联网测试目标。评估只读文件，不执行目标源码，不安装依赖。

## fixture-v1

`service.mjs` 是已知服务的完整 HTTP 注册与业务实现。`registerRoutes` 在该合成系统启动时调用，框架按顺序调用每个 guard，通过后执行 handler。没有文件外的租户检查、响应过滤或额外授权。`requireSession` 接收的 `ctx.session` 由受信认证器建立，普通账户只能代表自己的 tenant；请求不能修改 session。

`req.query` 与 `req.params` 完全由请求者控制。普通租户用户可调用全部注册路由。`db.invoices.findOne` 与 `db.attachments.findOne` 按查询对象逐字段精确匹配，跨租户已有不同记录；查询命中后把完整的私有记录返回给请求者。系统要求普通用户只能读取本租户记录，平台管理员才获授权执行维护命令。

受信 `runner.execFile` 是常规不使用 shell 的程序／参数数组接口，不会把参数字符串重新解释为命令；程序固定为 printf。`runner.exec` 则将单一字符串交给 shell 解释。

`extension.mjs` 是另一个供应给外部宿主的扩展模块。仓库里没有它的调用方、外部宿主实现、默认配置或网络路由挂载记录。它可能由受信管理员调用，也可能被某宿主挂为网络入口；两种情况都尚无依据。不能把 `service.mjs` 的注册契约移用到这个扩展上。

## fixture-v2

`service-fixed.mjs` 表示替换 `service.mjs` 后的当前完整实现；认证、框架与数据库契约保持以上规则。文件名差异只是同时保存两个源码快照的评估安排。黑板里的 fixture-v1 结论仍只适用于旧快照。
