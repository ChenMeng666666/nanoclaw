# Evolution + Memory Governance (P3)

## 1) 统一观测看板

统一看板通过 Runtime API 输出，支持同一时间窗查看进化与记忆链路：

- `GET /api/evolution/metrics/dashboard?timelineLimit=30`
- `GET /api/memory/metrics/dashboard?timelineLimit=24`
- `GET /api/governance/metrics/dashboard?timelineLimit=30`

建议将以下指标作为默认展示项：

- 进化链路：`totalGenes`、`promotedGenes`、`promotionRate`、`avgGDIScore`、`shannonDiversity`
- 记忆链路：`recallRate`、`hitRate`、`falseRecallRate`、`migrationSuccessRate`、`cacheHitRate`
- 统一健康信号：进化晋升率、记忆误召回率、检索延迟 P95、迁移成功率

## 2) 外部规范镜像与版本冻结

当外部规范不可用或变更频繁时，采用本地镜像与冻结机制：

1. 在 `docs/spec-mirror/` 维护镜像副本（按来源与日期命名）。
2. 每次评审冻结一个 `BASELINE_VERSION`，记录到 `docs/spec-mirror/VERSIONS.md`。
3. 对比新旧镜像，生成差异审计条目：
   - 破坏性变化
   - 行为语义变化
   - 新增可选能力
4. 将差异结论同步到季度审查文档与任务池。

## 3) 季度演进审查机制

每季度至少一次，输出 `docs/governance/quarterly-review-YYYYQX.md`，包含：

- 阈值复核：duplicate 阈值、GDI 晋升阈值、检索阈值
- 误报/漏报：重复检测误报率、自动审核误判率
- 召回质量：召回率、命中率、误召回率、延迟分位
- 晋升质量：晋升率、回退率、反馈均分、低分重审占比
- 结论动作：保持/收紧/放宽，附变更理由

## 4) 故障演练清单

每月至少完成一次演练，覆盖以下场景：

- 晋升失败：模拟审核通过后无法创建 Capsule
- 检索退化：模拟向量检索异常与回退路径
- 迁移异常：模拟 L1/L2/L3 迁移失败与重试
- 回滚演练：验证 release control 与回滚快照恢复

演练输出要求：

- 触发条件
- 观测信号
- 处置步骤
- 回滚步骤
- 复盘结论与后续改进项
