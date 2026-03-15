# Phase A 执行基线与风险护栏

## 1. 指标字典与命名规范

- 命名格式：`<domain>.<metric_name>`
- 域范围：`runtime`、`memory`、`evolution`
- 核心口径：
  - `runtime.startup_latency_ms`
  - `memory.compression_gain_ratio`
  - `runtime.error_rate`
  - `runtime.rollback_recovery_seconds`

## 2. 核心指标门槛

| 指标 | 通过阈值 |
| --- | --- |
| runtime.startup_latency_ms | <= 1500ms |
| memory.compression_gain_ratio | >= 0.20 |
| runtime.error_rate | <= 0.02 |
| runtime.rollback_recovery_seconds | <= 120s |

## 3. 基线快照模板

- 固定对比口径：`phase`
- 必填字段：
  - `phase`
  - `capturedAt`
  - `window`
  - `metrics`
  - `alerts`
  - `rollbackReadiness`

## 4. Feature Flag 制度

- 命名模板：`NC_<DOMAIN>_<ABILITY>_ENABLED`
- 高风险默认：关闭
- 高风险能力清单：
  - `NC_MEMORY_RELEASE_CANARY_ENABLED`
  - `NC_EVOLUTION_SHADOW_ENABLED`
  - `NC_EVOLUTION_PROMOTE_ENABLED`
  - `NC_RUNTIME_FALLBACK_ENABLED`

## 5. 四阶段发布规范

- 阶段顺序：Canary -> Shadow -> Promote -> Fallback
- Canary：小流量验证
- Shadow：并行评估不切主流量
- Promote：达标后切主路径
- Fallback：触发熔断后自动回退到 stable

## 6. 熔断与回退

- 触发条件：
  - `runtime.error_rate > 0.05` 持续 5 分钟
  - `runtime.rollback_recovery_seconds > 180`
  - `memory.search_error_rate > 0.08`
- 人工接管条件：
  - 30 分钟内连续两次熔断
  - 检测到安全相关失败
- 自动回退动作：
  - 发布模式切回 stable
  - 禁用 canary/shadow flags
  - 记录 rollback 快照

## 7. 验收门禁

- DoD 必须同时满足：
  - `contract_ready`
  - `verification_passed`
  - `rollback_proven`
- 阻塞条件：
  - `critical_test_failed`
  - `core_metrics_below_threshold`
  - `rollback_path_not_verified`
- 规则：门禁未通过不得进入下一 Phase

## 8. 变更记录模板

- 目标
- 范围
- 风险
- 验证
- 回退

## 9. Runtime API 查询

- 路径：`GET /api/governance/phase-a/guardrails`
- 返回内容：指标字典、阈值、发布策略、熔断规则、门禁策略、变更模板
