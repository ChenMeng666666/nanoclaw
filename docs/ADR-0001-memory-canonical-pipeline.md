# ADR-0001：记忆系统唯一主链路与退役策略

## 状态

Accepted

## 决策

- 当前阶段将 `ContextEngine` 作为生产主消息流记忆编排的唯一主链路
- 主进程消息处理统一通过 `ContextEngine.assemble/ingest/afterTurn` 完成记忆注入与上下文构建
- `MemoryManager` 收敛为基础服务层，负责 Runtime API、L1 持久化与生命周期迁移调度
- 迁移规则参数收敛到统一配置源 `MEMORY_CONFIG.migration`
- 迁移时默认不改写原始语义内容，仅更新层级与重要性
- 主链路通过 `MEMORY_CONFIG.runtime.mainPipeline=context_engine` 冻结

## 背景

- 历史阶段存在 `MemoryManager` 与 `ContextEngine` 双轨并行，文档与运行时事实发生偏差
- 主流程消息链路已由 `ContextEngine` 承担，需在 ADR 中显式冻结并给出回退控制面
- 迁移规则与文档曾存在不一致，且缺少统一配置来源

## 影响

- 生产消息链路只保留 `ContextEngine` 单一编排入口，减少双轨分叉
- `MemoryManager` 与 Runtime API 共享统一迁移与检索配置，保障治理口径一致
- session 作用域在主流程与引擎内部保持一致，避免 chatJid/sessionId 混用造成召回偏差

## 退役计划

- 阶段一：冻结 `MEMORY_CONFIG.runtime.mainPipeline=context_engine`，阻止主链路漂移
- 阶段二：继续下沉 `MemoryManager` 为基础服务层，逐步移除重复编排逻辑
- 阶段三：补齐主链路回归矩阵并将文档与运行手册纳入发布门禁

## 回滚策略

- 如主链路异常，可通过 `MEMORY_MAIN_PIPELINE=memory_manager` 启动降级模式并跳过 ContextEngine 注入
- 如迁移调度引发异常，可临时关闭迁移定时器并保留持久化定时器
- 保持 `MEMORY_CONFIG` 参数可配置，以快速下调阈值与迁移频率
