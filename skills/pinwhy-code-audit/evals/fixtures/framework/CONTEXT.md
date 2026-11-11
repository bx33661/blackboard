# Sable Documents 合成源码契约

本目录是独立编写的只读评估输入，不是实际目标，不执行。认证层建立 ctx.user，普通用户不能修改该对象。user 含 id、teamId、role、groups。团队内存在用户不是所有者且不属于其 group 的私有文档；普通用户只可读其所有或所属组的文档，只能删除自有文档。管理员只在本团队拥有删除权限。请求 params、body、文件原始名称和文件内容由用户控制。

registry.mjs 的路由元数据来自受信注册表，框架按 dispatch 执行，不由请求覆盖。store.get(id) 取得完整文档，findByIds(ids) 精确取出存在的完整记录；数据库没有额外权限过滤。store.remove 只删除已给定 ID。导出返回完整的文档私有字段。

文件发送的响应对象契约由 response.mjs 实现，设置与调用依源代码顺序生效，send 不另改头。config.mjs 是当前配置；其他 storage 模式只用于范围对照。本输入没有浏览器测试、客户端嵌入方式、真实部署或用户操作记录。
