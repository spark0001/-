# Cloud Function SDK Upgrade Notes

本轮统一云函数依赖：

- `wx-server-sdk`: `~3.0.4`

## 验证点

升级后需要在微信开发者工具或测试云环境中回归：

1. `login`: 能正常拿到 `OPENID`。
2. `registerActivity` / `cancelActivityRegistration`: 双击和并发操作后报名人数、报名列表一致。
3. `submitReadingLog`: 打卡成功，奖励资格幂等记录不重复。
4. `getMonthlyGiftProgress`: 月度进度、奖励活动入口展示正确。
5. `reviewApplication`: 审核申请时 `applications` 和 `users` 状态一致。
6. `reservePoemPancakeCell` / `submitPoemPancakeCell`: 占格、释放、提交在多人同时操作时不覆盖。
7. 管理统计页：奖励管理、数据中心、诗饼统计、海报统计能正常加载。

## 发布建议

1. 先部署测试云环境的云函数。
2. 跑核心链路手工回归。
3. 再部署生产云函数。
4. 生产部署后优先观察云函数错误日志中的事务冲突、集合不存在和权限错误。
