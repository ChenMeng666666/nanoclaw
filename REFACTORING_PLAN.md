# Clean Architecture 重构计划（V2.0 预备）

## 0. 静态扫描结果：God Objects 清单（src/）

> 识别标准：文件行数显著过大 + 同时承担多层职责（接口层/应用编排/领域规则/基础设施细节混杂）。

- `src/runtime-api.ts`（约 3134 行）
- `src/db.ts`（约 2235 行）
- `src/db-agents.ts`（约 1999 行）
- `src/evolution-manager.ts`（约 1733 行）
- `src/memory-manager.ts`（约 1580 行）
- `src/index.ts`（约 1261 行）
- `src/signal-extractor.ts`（约 1101 行）
- `src/context-engine/default-engine.ts`（约 1075 行）
- `src/config.ts`（约 735 行）
- `src/types.ts`（约 842 行）
- `src/container-runner.ts`（约 757 行）

---

## Phase 1：底层契约与配置基建拆分（先打地基）

- [x] [P0] 将 `src/types.ts` 的 `GEP 核心协议类型（L17-L207）` 抽离到 `src/types/gep.ts`
- [x] [P0] 将 `src/types.ts` 的 `容器/通道/调度基础类型（L210-L302）` 抽离到 `src/types/core-runtime.ts`
- [x] [P0] 将 `src/types.ts` 的 `智能体与记忆域类型（L309-L460）` 抽离到 `src/types/agent-memory.ts`
- [x] [P0] 将 `src/types.ts` 的 `协作域类型（L478-L569）` 抽离到 `src/types/collaboration.ts`
- [x] [P0] 将 `src/types.ts` 的 `学习与进化条目类型（L571-L708）` 抽离到 `src/types/evolution.ts`
- [x] [P0] 将 `src/types.ts` 的 `安全审计类型（L710-L842）` 抽离到 `src/types/security.ts`
- [x] [P0] 将 `src/types.ts` 保留为兼容出口，改为仅聚合导出到上述 `src/types/*.ts`
- [x] [P0] 将 `src/config.ts` 的 `校验器工具（L7-L57, L194-L196）` 抽离到 `src/config/validators.ts`
- [x] [P0] 将 `src/config.ts` 的 `基础运行配置（L62-L223）` 抽离到 `src/config/runtime.ts`
- [x] [P0] 将 `src/config.ts` 的 `记忆系统配置（L225-L405）` 抽离到 `src/config/memory.ts`
- [x] [P0] 将 `src/config.ts` 的 `安全配置（L427-L565）` 抽离到 `src/config/security.ts`
- [x] [P0] 将 `src/config.ts` 的 `协作配置（L567-L637）` 抽离到 `src/config/collaboration.ts`
- [x] [P0] 将 `src/config.ts` 的 `进化配置与命令安全（L639-L735）` 抽离到 `src/config/evolution.ts`

---

## Phase 2：Persistence 层拆分（数据库解耦）

- [x] [P0] 将 `src/db.ts` 的 `schema 初始化（L36-L430）` 抽离到 `src/infrastructure/persistence/sqlite/schema.ts`
- [x] [P0] 将 `src/db.ts` 的 `JSON 状态迁移（L1266-L1319）` 抽离到 `src/infrastructure/persistence/sqlite/migrations/json-state.ts`
- [x] [P0] 将 `src/db.ts` 的 `任务与运行日志访问（L993-L1124）` 抽离到 `src/infrastructure/persistence/repositories/task-repository.ts`
- [x] [P0] 将 `src/db.ts` 的 `路由/会话/群组访问（L1128-L1262）` 抽离到 `src/infrastructure/persistence/repositories/routing-repository.ts`
- [x] [P0] 将 `src/db.ts` 的 `协作与身份访问（L1567-L2218）` 拆分到 `src/infrastructure/persistence/repositories/bot-identity-repository.ts`、`collaboration-task-repository.ts`、`team-state-repository.ts`
- [x] [P0] 将 `src/db.ts` 收敛为 `连接工厂 + 事务门面`，移除跨域查询细节
- [x] [P0] 将 `src/db-agents.ts` 的 `事务与句柄管理（L29-L74）` 抽离到 `src/infrastructure/persistence/sqlite/transaction-manager.ts`
- [x] [P0] 将 `src/db-agents.ts` 的 `safeJsonParse 映射逻辑（如 L518-L545）` 抽离到 `src/infrastructure/persistence/mappers/*.ts`
- [x] [P0] 将 `src/db-agents.ts` 的 `agents/channel/memory/reflection/learning/evolution/audit 访问逻辑（L76-L1968）` 拆分到 `src/infrastructure/persistence/repositories/agent/*.ts`

---

## Phase 3：Interface 层拆分（Runtime API 解耦）

- [x] [P0] 将 `src/runtime-api.ts` 的 `路由分发主干（L186-L1736）` 抽离到 `src/interfaces/http/runtime-api-router.ts`
- [x] [P0] 将 `src/runtime-api.ts` 的 `memory 端点簇（L235-L545）` 抽离到 `src/interfaces/http/handlers/memory-handlers.ts`
- [x] [P0] 将 `src/runtime-api.ts` 的 `evolution 端点簇（L565-L1314）` 抽离到 `src/interfaces/http/handlers/evolution-handlers.ts`
- [x] [P0] 将 `src/runtime-api.ts` 的 `learning/collaboration 端点簇（L1416-L1736）` 抽离到 `src/interfaces/http/handlers/learning-collaboration-handlers.ts`
- [x] [P1] 将 `src/runtime-api.ts` 的 `参数解析逻辑（L2507-L3127 中 parse*）` 抽离到 `src/interfaces/http/parsers/*.ts`
- [x] [P1] 将 `src/runtime-api.ts` 的 `限流逻辑（L2507-L3127 中限流相关）` 抽离到 `src/interfaces/http/middleware/rate-limit.ts`
- [x] [P1] 将 `src/runtime-api.ts` 的 `错误与响应封装（L2507-L3127 中 send*）` 抽离到 `src/interfaces/http/response.ts`

---

## Phase 4：Application + Domain（Evolution 纵向分层）

- [x] [P1] 将 `src/evolution-manager.ts` 的 `GDI 评分/晋升判定规则（L608-L1187）` 抽离到 `src/domain/evolution/services/scoring-service.ts`
- [x] [P1] 将 `src/evolution-manager.ts` 的 `命令安全校验规则（L939-L982）` 抽离到 `src/domain/evolution/services/command-safety-service.ts`
- [x] [P1] 将 `src/evolution-manager.ts` 的 `提交用例（L1223-L1481 中 submit 相关）` 抽离到 `src/application/evolution/use-cases/submit-experience.ts`
- [x] [P1] 将 `src/evolution-manager.ts` 的 `选择/审核用例（L1223-L1481 中 select/review 相关）` 抽离到 `src/application/evolution/use-cases/select-and-review.ts`
- [x] [P1] 将 `src/evolution-manager.ts` 收敛为门面，保留兼容 API，仅做编排与依赖注入

---

## Phase 5：Memory 子系统纵向拆分（检索/治理/迁移分治）

- [x] [P1] 将 `src/memory-manager.ts` 的 `发布控制类型与解析（L29-L155, L1564-L1577）` 抽离到 `src/memory-manager/release-control-types.ts`
- [x] [P1] 将 `src/memory-manager.ts` 的 `嵌入适配函数（L157-L171）` 抽离到 `src/memory-manager/embedding.ts`
- [x] [P1] 将 `src/memory-manager.ts` 的 `检索主流程（L619-L795）` 抽离到 `src/memory-manager/retrieval.ts`
- [x] [P1] 将 `src/memory-manager.ts` 的 `查询改写（L909-L990）` 抽离到 `src/memory-manager/query-variants.ts`
- [x] [P1] 将 `src/memory-manager.ts` 的 `生命周期治理（L992-L1134）` 抽离到 `src/memory-manager/lifecycle-governance.ts`
- [x] [P1] 将 `src/memory-manager.ts` 的 `迁移决策与执行（L1119-L1261）` 抽离到 `src/memory-manager/migration.ts`
- [x] [P1] 将 `src/memory-manager.ts` 的 `指标统计（L61-L113, L1309-L1561）` 抽离到 `src/memory-manager/metrics.ts`
- [x] [P1] 将 `src/memory-manager.ts` 的 `重排/热度工具（L1161-L1227, L1263-L1279）` 抽离到 `src/memory-manager/ranking-utils.ts`

---

## Phase 6：Context Engine 与 Signal 引擎拆分（算法层内聚）

- [x] [P1] 将 `src/context-engine/default-engine.ts` 的 `嵌入缓存与淘汰（L30-L115）` 抽离到 `src/context-engine/embedding-cache.ts`
- [x] [P1] 将 `src/context-engine/default-engine.ts` 的 `ingest 分块链路（L152-L457）` 抽离到 `src/context-engine/ingest-pipeline.ts`
- [x] [P1] 将 `src/context-engine/default-engine.ts` 的 `assemble 检索链路（L459-L547, L839-L943, L985-L1001）` 抽离到 `src/context-engine/assemble-retrieval.ts`
- [x] [P1] 将 `src/context-engine/default-engine.ts` 的 `查询扩展（L588-L762）` 抽离到 `src/context-engine/query-expansion.ts`
- [x] [P1] 将 `src/context-engine/default-engine.ts` 的 `重排策略（L764-L820, L864-L930）` 抽离到 `src/context-engine/rerank.ts`
- [x] [P1] 将 `src/context-engine/default-engine.ts` 的 `provider 工厂（L1014-L1075）` 抽离到 `src/context-engine/providers.ts`
- [x] [P1] 将 `src/signal-extractor.ts` 的 `信号类型定义（L21-L59）` 抽离到 `src/signal-extractor/types.ts`
- [x] [P1] 将 `src/signal-extractor.ts` 的 `多语言模式库（L71-L685）` 抽离到 `src/signal-extractor/patterns.ts`
- [x] [P1] 将 `src/signal-extractor.ts` 的 `工具函数（L689-L759）` 抽离到 `src/signal-extractor/utils.ts`
- [x] [P1] 将 `src/signal-extractor.ts` 的 `提取流程（L769-L852）` 抽离到 `src/signal-extractor/extractor.ts`
- [x] [P1] 将 `src/signal-extractor.ts` 的 `分类与动作映射（L857-L947）` 抽离到 `src/signal-extractor/action-mapping.ts`
- [x] [P1] 将 `src/signal-extractor.ts` 的 `主项目增强逻辑（L952-L1101）` 抽离到 `src/signal-extractor/main-signals.ts`

---

## Phase 7：Container/IPC 基础设施拆分（运行时边界清晰化）

- [x] [P2] 将 `src/container-runner.ts` 的 `挂载策略与安全校验（L65-L241）` 抽离到 `src/domain/container/mount-policy.ts` 与 `src/infrastructure/container/mount-builder.ts`
- [x] [P2] 将 `src/container-runner.ts` 的 `命令参数构建（L258-L693 中构建部分）` 抽离到 `src/infrastructure/container/runtime-command-builder.ts`
- [x] [P2] 将 `src/container-runner.ts` 的 `进程执行与流处理（L258-L693 中执行部分）` 抽离到 `src/infrastructure/container/container-process-runner.ts`
- [x] [P2] 将 `src/container-runner.ts` 的 `IPC 快照写入（L695-L757）` 抽离到 `src/infrastructure/ipc/snapshot-writer.ts`

---

## Phase 8：入口文件极简瘦身（最终收口）

- [x] [P0] 将 `src/index.ts` 的 `依赖检查与端口探测（L73-L119）` 抽离到 `src/infrastructure/system/dependency-check.ts`
- [x] [P0] 将 `src/index.ts` 的 `状态恢复与去重（L151-L188, L866-L967）` 抽离到 `src/application/message/state-recovery-service.ts`
- [x] [P0] 将 `src/index.ts` 的 `应用启停生命周期（L1019-L1139）` 抽离到 `src/application/bootstrap/app-lifecycle.ts`
- [x] [P0] 将 `src/index.ts` 的 `消息路由与主流程编排（其余业务主干）` 下沉到 `src/application/bootstrap/message-orchestrator.ts`
- [x] [P0] 将 `src/index.ts` 收敛为极简入口，仅保留 `main()`、DI 装配、启动与致命错误兜底

---

## 执行约束（本计划适用）

- 本计划仅针对 `src/` 的结构重构，不涉及业务行为变更。
- 每个 Task 实施后必须补充契约测试/回归测试，确保对外 API 与行为保持兼容。
- 按 Phase 顺序推进，优先完成所有 `[P0]` 再推进 `[P1]/[P2]/[P3]`。
