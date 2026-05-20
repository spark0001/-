# Engineering Checklist

新增一个内容类型或互动玩法前，先完成这份清单：

1. 在唯一真源里补齐枚举、字段池、默认模板配置。
2. 前端页面只消费 shared schema，不再本地复制字段定义。
3. 保存云函数、读取云函数、统计云函数都识别新内容类型。
4. 需要时间判断的链路统一使用 shared poem pancake 时间工具。
5. 新云函数优先使用 `cloudfunctions/*/shared/db.js` 的集合和分页 helper。
6. 新增或修改云函数后运行 `npm run sync:cloud-shared`。
7. 提交前运行 `npm run verify:engineering`。
8. 手工回归至少覆盖：保存 -> 读取 -> 编辑 -> 统计/导出。
