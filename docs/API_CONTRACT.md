# Cloud Function API Contract

所有云函数返回给小程序端的数据都应保持可序列化，并优先使用下面的轻量结构：

```js
{
  success: true,
  code: 'OK',
  message: '',
  data: {}
}
```

失败时：

```js
{
  success: false,
  code: 'VALIDATION_ERROR',
  message: '请填写必填字段',
  data: {}
}
```

## 字段约定

- `success`: 必填布尔值。前端以此区分业务成功和业务失败。
- `code`: 推荐字符串。用于区分校验失败、权限不足、重复提交、并发冲突等机器可读状态。
- `message`: 必填字符串。用于展示给用户或写入前端错误日志。
- `data`: 推荐对象。承载列表、详情、统计、创建后的 ID 等业务数据。

## 兼容约定

当前项目已有不少云函数直接把业务字段放在顶层，例如 `list`、`readingLogId`、`activityId`。后续改造时可以渐进兼容：

1. 保留现有顶层字段，避免一次性改前端。
2. 新增或重构的云函数同时提供 `code` 和 `message`。
3. 新增复杂返回值时优先放入 `data`。

## 错误约定

云函数不能直接返回原始 `error` 对象。推荐做法：

```js
console.error('submitReadingLog error:', error)

return {
  success: false,
  code: 'INTERNAL_ERROR',
  message: error && error.message ? error.message : '服务暂时不可用',
  data: {}
}
```

## 核心链路

核心链路至少覆盖这些返回规则：

- 报名 / 取消报名：`registerActivity`、`cancelActivityRegistration`
- 打卡 / 奖励资格：`submitReadingLog`、`getMonthlyGiftProgress`
- 申请审核：`reviewApplication`
- 诗饼占格 / 提交：`reservePoemPancakeCell`、`submitPoemPancakeCell`
