# Frame Tool 合成调查契约

只读源码与合成历史记录，不执行。本次任务只允许读取本目录源码、runtime-notes.txt 和所分配黑板；没有实际部署物或构建清单。Input 的 frameBytes、field、value、mode 来自文件解析器输出的用户输入；frameBytes 是 uint32_t，field 是 int。frameBytes 已表示实际分配的完整帧长度，本输入不涉及伪造底层缓冲区。

字段编号 1 到 4 表示普通槽位，-1 是合法的元数据标记，应交给单独分支，不能当槽位使用。route.c 是相关完整分派；ENABLE_LEGACY_MAP 与 NDEBUG 是否用于待审交付物没有记录。提供的历史日志只针对当时的工具副本，不是本轮亲自执行，也不能证明另一交付物的编译配置。
