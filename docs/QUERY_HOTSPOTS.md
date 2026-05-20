# Query Hotspots

这个项目里 `getAllRecords` 是历史上最常用的统计/管理页读取方式。它适合小规模数据，但数据量上来后会带来读取成本、冷启动时间和分页一致性风险。

## 第一批关注点

| 链路 | 文件 | 当前风险 | 后续方向 |
| --- | --- | --- | --- |
| 奖励管理 | `cloudfunctions/getRewardManageData/index.js` | 聚合用户、申请、打卡、活动、奖励记录，读取面大 | 按月份和活动 ID 分区读取，必要时维护月度汇总 |
| 我的中心 | `cloudfunctions/getMyCenterData/index.js` | 用户首页聚合多类个人数据 | 按用户 openid + 时间窗口查询 |
| 活动详情 | `cloudfunctions/getActivityDetail/index.js` | 活动详情混合报名、打卡、分享、奖励晒单 | 详情基础信息与统计拆开，统计按需加载 |
| 数据中心 | `pages/data-center/data-center.js` 与统计云函数 | 管理端一次性拉多类统计 | 预聚合日报/月报，前端分页加载明细 |
| 海报 / 诗饼统计 | `cloudfunctions/getPosterAnalytics/index.js`、`cloudfunctions/getPoemPancakeAnalytics/index.js` | 事件数据天然增长 | 默认时间窗口，导出场景再全量分页 |

## 改造原则

1. 面向用户页优先按 `openid`、`activityId`、`monthKey`、`dayKey` 缩小查询范围。
2. 面向管理统计页优先按时间窗口查询。
3. 高频统计不要每次实时全量扫描，必要时增加汇总集合。
4. 导出类需求可以保留分页全量读取，但不能阻塞普通页面首屏。
