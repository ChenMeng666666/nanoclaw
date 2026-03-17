# src 目录 DDD 迁移方案（规划 + 分阶段执行）

## 目标与范围

- 本轮仅执行两件事：创建目标目录；输出迁移方案。
- 本轮不迁移任何业务代码、不改 import、不改运行逻辑。
- 采用“限界上下文（Bounded Context）+ 分层（Domain/Application/Infrastructure/Interfaces）”组织方式。

## 目标目录蓝图（后续 Phase 渐进落位）

```text
src/
  app/
    bootstrap/
  shared/
    kernel/
    config/
  platform/
    persistence/
    integration/
  contexts/
    messaging/
      domain/
      application/
      infrastructure/
      interfaces/
    runtime/
      domain/
      application/
      infrastructure/
      interfaces/
    memory/
      domain/
      application/
      infrastructure/
      interfaces/
    evolution/
      domain/
      application/
      infrastructure/
      interfaces/
    security/
      domain/
      application/
      infrastructure/
      interfaces/
```

## 优先级定义

- P0：先决约束与安全网，不完成不得迁移。
- P1：主干迁移（高价值、低破坏顺序）。
- P2：深度解耦与巨型文件拆分。
- P3：治理、收敛与长期演进能力。

## Phase 0（P0）基线治理与防护网

- [x] [P0] 冻结迁移边界：确认“仅迁移结构，不改变外部行为”验收标准
- [x] [P0] 建立依赖规则：定义 contexts 间引用白名单与禁止方向
- [x] [P0] 建立兼容策略：约定旧入口文件保留 facade 转发期
- [x] [P0] 补齐回归基线：锁定关键测试集（runtime-api/container/channels/db）
- [x] [P0] 建立迁移看板：为每个 context 定义 owner、完成标准、回滚条件

### Phase 0 迭代执行增量（2026-03-16）

- 边界冻结验收标准：本阶段仅新增治理规则与测试护栏，不迁移业务实现、不改外部 API 行为、不改运行时语义。
- 依赖规则落地：在 ESLint 增加 `src/contexts` 分层限制（domain/application/interfaces）与跨 context 禁向规则。
- 依赖白名单：允许 `shared/*`、`platform/*`、同 context 的合法分层依赖、以及跨 context 的 `application` 契约调用。
- 兼容策略落地：旧入口在迁移期保留 facade 转发，迁移顺序固定为“新实现先落位 -> 旧入口转发 -> 调用方渐进切换 -> 稳定后移除 facade”。
- 回归基线落地：新增 `test:ddd-baseline` 并接入 CI，锁定 runtime-api/container/channels/db 关键测试子集。

### Phase 0 迭代迁移看板（基线）

| Context | Owner | 完成标准 | 回滚条件 |
| --- | --- | --- | --- |
| messaging | 待指派（架构负责人） | 分层目录齐备；跨层/跨 context 依赖通过规则校验；关键回归通过 | 出现行为偏差、消息路由异常、回归失败即回退到 facade 转发前 |
| runtime | 待指派（运行时负责人） | 启停/调度/IPC 路径通过基线回归；旧入口可转发 | 启动失败、API 退化、容器执行异常即回退 |
| memory | 待指派（记忆负责人） | 读写检索与生命周期语义不变；数据库相关回归通过 | 检索质量明显下降、写入失败、DB 回归失败即回退 |
| evolution | 待指派（进化负责人） | 提交/选择/反馈路径契约不变；评审链路可用 | 评分或审核流程异常、关键接口失败即回退 |
| security | 待指派（安全负责人） | 鉴权/校验/命令安全规则仍生效；安全回归通过 | 出现绕过鉴权、校验失效或策略降级即回退 |

## Phase 1（P1）共享层与平台层归位

- [x] [P1] 识别 shared/kernel 候选：logger、errors、utils、核心类型
- [x] [P1] 识别 shared/config 候选：配置模型、校验器、装配入口
- [x] [P1] 识别 platform/persistence 候选：sqlite、transaction、schema、通用仓储
- [x] [P1] 识别 platform/integration 候选：外部依赖适配器与 provider 注册
- [x] [P1] 设计别名与导出策略：统一 barrel/export 边界，避免跨层直连

### Phase 1 迭代执行增量（2026-03-16）

- shared/kernel 落地：新增 `src/shared/kernel`，收口 logger/errors/utils/core-runtime 类型导出；`src/logger.ts` 保留兼容门面并转发到 shared/kernel。
- shared/config 落地：新增 `src/shared/config` 聚合导出；`src/config.ts` 继续作为稳定入口并转发到 shared/config。
- platform/persistence 落地：新增 `src/platform/persistence`（sqlite/facades/repositories/index）；`src/db.ts`、`src/db-agents.ts` 通过 platform 层导入与导出，保持外部 API 不变。
- platform/integration 落地：新增 `src/platform/integration`（channels/providers/index 与默认 channel 注册入口）；启动编排改由 platform/integration 入口接入注册中心。
- 别名与导出策略：本轮采用“新目录聚合导出 + 旧入口 facade 转发”统一边界；路径别名先保留为后续阶段策略项，避免影响当前运行时解析链路。

### Phase 1 迭代执行增量（2026-03-16）

- shared/kernel 落地：新增 `src/shared/kernel`，收口 logger/errors/utils/core-runtime 类型导出；`src/logger.ts` 保留兼容门面并转发到 shared/kernel。
- shared/config 落地：新增 `src/shared/config` 聚合导出；`src/config.ts` 继续作为稳定入口并转发到 shared/config。
- platform/persistence 落地：新增 `src/platform/persistence`（sqlite/facades/repositories/index）；`src/db.ts`、`src/db-agents.ts` 通过 platform 层导入与导出，保持外部 API 不变。
- platform/integration 落地：新增 `src/platform/integration`（channels/providers/index 与默认 channel 注册入口）；启动编排改由 platform/integration 入口接入注册中心。
- 别名与导出策略：本轮采用“新目录聚合导出 + 旧入口 facade 转发”统一边界；路径别名先保留为后续阶段策略项，避免影响当前运行时解析链路。

## Phase 2（P1）Messaging Context 迁移

- [x] [P1] 定义 messaging 领域模型：消息、会话、路由、队列等聚合边界
- [x] [P1] 迁移应用编排：消息编排与恢复流程归入 application
- [x] [P1] 迁移通道接口：channels 与路由适配归入 interfaces
- [x] [P1] 迁移基础设施实现：队列、持久化适配、外部调用归入 infrastructure
- [x] [P1] 建立反腐层：旧入口保留转发到 contexts/messaging

### Phase 2 迭代执行增量（2026-03-16）

- messaging 分层落位：新增 `src/contexts/messaging/{domain,application,interfaces,infrastructure}`，并新增 `src/contexts/messaging/index.ts` 统一导出。
- 领域模型归位：在 `contexts/messaging/domain/models.ts` 收敛消息、会话、通道相关核心类型边界。
- 应用编排归位：在 `contexts/messaging/application` 提供 `group-utils` 实现与编排入口（message-pipeline/state-recovery/message-orchestrator）导出面。
- 通道与路由接口归位：在 `contexts/messaging/interfaces` 落地 channel registry 与 router 实现；旧入口 `src/channels/registry.ts`、`src/router.ts` 保留为转发门面。
- 基础设施归位：在 `contexts/messaging/infrastructure` 收敛 `group-queue`、`db-routing` 与 message 持久化相关导出；启动编排改为从 messaging context 接入 queue/router。

### Phase 2 迭代执行增量（2026-03-17）

- 应用核心实现实搬：`MessagePipeline`、`MessageOrchestrator`、`StateRecoveryService` 的实现体迁移到 `contexts/messaging/application/*`，降低新旧路径双向桥接复杂度。
- 旧路径兼容门面收口：`src/application/message/message-pipeline.ts`、`src/application/bootstrap/message-orchestrator.ts`、`src/application/message/state-recovery-service.ts` 改为仅转发到 messaging context。
- 依赖方向收敛：`contexts/messaging/application` 内部改为优先引用 context 自身的 interfaces/infrastructure/application 入口（router/group-queue/group-utils/state-recovery），减少跨目录耦合。

## Phase 3（P1）Runtime Context 迁移

- [x] [P1] 定义 runtime 子域：容器生命周期、执行器、IPC、运行时安全
- [x] [P1] 迁移运行时应用服务：启动编排、恢复、调度触发归入 application
- [x] [P1] 迁移 runtime API 接口层：HTTP handlers/parsers/router 边界收敛
- [x] [P1] 迁移运行基础设施：container/ipc 命令构建与执行归入 infrastructure
- [x] [P1] 保留兼容 facade：旧 runtime 入口文件仅做转发

### Phase 3 迭代执行增量（2026-03-17）

- runtime context 分层落位：新增 `src/contexts/runtime/{domain,application,interfaces,infrastructure}` 与 `src/contexts/runtime/index.ts` 聚合导出，形成 runtime 子域边界。
- 运行时应用服务归位：新增 `contexts/runtime/application/runtime-api-service.ts` 承接 Runtime API 启动编排；`bootstrap` 改为优先依赖 runtime context 应用层入口。
- runtime API 接口层归位：新增 `contexts/runtime/interfaces/http/runtime-api-router.ts` 并在接口层统一接入 memory/evolution/learning/collaboration 路由处理。
- 基础设施能力归位：新增 `contexts/runtime/infrastructure/container-runtime.ts` 与 `contexts/runtime/infrastructure/ipc-watcher.ts`，容器运行时与 IPC watcher 通过 runtime context 基础设施入口暴露。
- 兼容门面收口：`src/runtime-api.ts`、`src/container-runtime.ts`、`src/interfaces/http/runtime-api-router.ts` 改为转发到 runtime context 新实现，保持外部调用契约稳定。

## Phase 4（P2）Memory Context 迁移

- [x] [P2] 定义 memory 领域模型：记忆条目、检索策略、生命周期规则
- [x] [P2] 迁移 memory 用例：写入、检索、评分、治理流程归入 application
- [x] [P2] 迁移 persistence 映射：mappers/repositories 按 memory 边界收敛
- [x] [P2] 迁移 context-engine 适配：作为 memory 基础设施能力接入
- [x] [P2] 清理跨域耦合：移除 memory 对无关 context 的直接依赖

### Phase 4 迭代执行增量（2026-03-17）

- memory context 分层落位：新增 `src/contexts/memory/{domain,application,interfaces,infrastructure}` 与 `src/contexts/memory/index.ts`，形成 memory 子域统一导出边界。
- memory 用例入口收敛：新增 `contexts/memory/application/memory-application-service.ts`，统一暴露 memory 应用服务；原 `src/memory-manager.ts` 继续作为兼容实现入口。
- persistence 映射收敛：新增 `contexts/memory/infrastructure/persistence/{memory-repository,memory-mapper}.ts` 与 `index.ts`，将 memory 仓储与 mapper 通过 memory context 基础设施出口统一转发。
- context-engine 适配接入：新增 `contexts/memory/infrastructure/context-engine-adapter.ts`，由 memory 基础设施统一暴露 `contextEngineRegistry` 与 `ContextEngine` 能力。
- 跨域依赖清理：application/domain/http/messaging 侧 memory 访问改为依赖 `contexts/memory/application` 与 `contexts/memory/infrastructure` 入口，移除对 `memory-manager` 与 `context-engine` 旧路径的直接耦合。
- 本次迭代提交：`0efe606`，完成 Phase 4 迁移入口收敛与兼容边界落地。
- Phase 4 技术债后半段收敛：`contexts/memory/application/memory-application-service.ts` 从兼容别名升级为真实实现承载；`src/memory-manager.ts` 收敛为兼容 facade。
- domain 规则下沉：新增 `contexts/memory/domain/memory-domain-rules.ts`，并通过 `contexts/memory/domain/index.ts` 统一导出生命周期治理与评分规则。
- 接口层用例收口：`/api/memory/list` 改为经 `memoryApplicationService.listMemories` 访问，避免接口层直连仓储实现。
- memory 子模块语义映射：在 `contexts/memory/application/{contracts,services,support}` 与 `contexts/memory/infrastructure/{adapters,observability}` 新增适配导出，按语义承接 `memory-manager/*` 子模块入口。
- 依赖路径收敛：`memory-application-service` 与 `memory-domain-rules` 改为优先依赖 `contexts/memory` 语义路径，减少新实现对旧目录的直接引用。

## Phase 5（P2）Evolution Context 迁移

- [ ] [P2] 定义 evolution 领域边界：策略、评分、晋升、审核
- [ ] [P2] 迁移 evolution 领域服务：按能力拆到 domain services
- [ ] [P2] 迁移 evolution 用例：提交、选择、反馈、指标归入 application
- [ ] [P2] 迁移 evolution 接口：runtime API evolution handlers 归入 interfaces
- [ ] [P2] 建立上下文契约：仅通过 application 接口对外暴露能力

## Phase 6（P2）Security Context 迁移

- [ ] [P2] 定义 security 子域：鉴权、输入校验、挂载策略、命令安全
- [ ] [P2] 迁移安全策略实现：mount-policy/command-safety 等收敛
- [ ] [P2] 迁移接口防线：API 参数校验与限流规则归位
- [ ] [P2] 建立统一安全服务入口：供各 context 通过契约调用
- [ ] [P2] 去除散落实现：清理多点重复校验逻辑

## Phase 7（P2）巨型文件拆分与去耦

- [ ] [P2] 拆分 runtime-api-parsers：按资源类型拆分 parser 模块
- [ ] [P2] 拆分 ipc：按协议、握手、消息路由、鉴权分离
- [ ] [P2] 拆分 evolution-service：按策略/评分/审核/编排解耦
- [ ] [P2] 拆分仓储巨型实现：读写职责分离、查询对象化
- [ ] [P2] 建立文件尺寸阈值：新增“单文件行数与 import 数”治理门槛

## Phase 8（P3）收敛、治理与文档

- [ ] [P3] 清理遗留入口：移除过渡期 facade 并完成 import 收敛
- [ ] [P3] 统一依赖方向校验：CI 增加层级依赖静态检查
- [ ] [P3] 更新架构文档：输出 context map、依赖图、迁移后约束
- [ ] [P3] 统一测试布局：测试按 context 就近放置并规范命名
- [ ] [P3] 形成长期机制：新模块准入模板与 DDD 代码评审清单

## 执行策略（建议）

- 小步迁移：每次只迁一个 context 的一个层次。
- 兼容优先：先 facade 转发，再逐步替换调用方。
- 测试护栏：每个 Task 完成后跑对应子集回归，Phase 结束跑全量。
- 可回滚：每个 Phase 保持可独立回退，避免大爆炸式重构。
