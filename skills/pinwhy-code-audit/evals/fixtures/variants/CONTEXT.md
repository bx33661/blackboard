# Ledger Export 合成源码契约

只读评估输入，不执行。before.mjs 是已经修复的旧版问题，用于说明历史种子；current.mjs、preferences.mjs、query.mjs 是当前完整相关实现。普通登录用户只可访问自己的发票，其 user.id 受信，query/body 可控。

db.exec 的第一个参数是完整 SQL 文本，第二个数组按占位符绑定值。db.adapter.execute 的 text 同样被当作完整 SQL 语句解释，bindings 仅绑定问号位置；适配器没有额外转义或策略。数据库连接有读取多用户发票的权限，业务隔离由查询负责。prefs.write 以独立绑定值保存文本，不解析内容；prefs.read 返回用户以前写入的同一字符串。

worker 的 job.ownerId 来自受信队列，指向创建者；不会赋予客户端伪造身份的能力。query-model.json 是给定的静态扫描配置与结果，未代表本轮实际运行。没有访问真实数据库、完整扫描或漏洞执行观察。
