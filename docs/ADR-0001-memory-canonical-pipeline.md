# ADR-0001：记忆系统唯一主链路与退役策略

## 状态

Accepted

## 决策

- 当前阶段将 `MemoryManager` 作为运行时记忆的唯一主链路
- 主进程定时任务统一调用 `MemoryManager.persistL1Memories` 与 `MemoryManager.migrateMemories`
- `DefaultContextEngine` 保留为能力模块，不作为当前生产主消息流入口
- 迁移规则参数收敛到统一配置源 `MEMORY_CONFIG.migration`
- 迁移时默认不改写原始语义内容，仅更新层级与重要性

## 背景

- 运行时存在 `MemoryManager` 与 `ContextEngine` 双轨并行
- 主流程中的记忆定时器曾为空实现，迁移调度未真实生效
- 迁移规则与文档存在不一致，且缺少统一配置来源

## 影响

- 记忆持久化与迁移行为可预测，可观测日志可用于排障
- 迁移语义修复后，L1→L2→L3 路径与数据状态保持一致
- ContextEngine 的主流程接入推迟到后续阶段任务（T1-1）

## 退役计划

- 阶段一：继续保留 ContextEngine 模块与注册能力，不挂入主流程
- 阶段二：完成 T1-1 后，将消息链路切换为统一 ContextEngine pipeline
- 阶段三：将 `MemoryManager` 收敛为存储/基础服务层，移除重复编排逻辑

## 回滚策略

- 如迁移调度引发异常，可临时关闭迁移定时器并保留持久化定时器
- 保持 `MEMORY_CONFIG` 参数可配置，以快速下调阈值与迁移频率
