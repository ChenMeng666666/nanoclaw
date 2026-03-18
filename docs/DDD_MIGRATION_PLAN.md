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

- [x] [P2] 定义 evolution 领域边界：策略、评分、晋升、审核
- [x] [P2] 迁移 evolution 领域服务：按能力拆到 domain services
- [x] [P2] 迁移 evolution 用例：提交、选择、反馈、指标归入 application
- [x] [P2] 迁移 evolution 接口：runtime API evolution handlers 归入 interfaces
- [x] [P2] 建立上下文契约：仅通过 application 接口对外暴露能力

### Phase 5 迭代执行增量（2026-03-17）

- evolution context 分层落位：新增 `src/contexts/evolution/{domain,application,infrastructure,interfaces}` 与 `src/contexts/evolution/index.ts`，形成 evolution 子域导出边界。
- application 契约收口：新增 `contexts/evolution/application/evolution-application-service.ts` 与 `index.ts`，统一暴露 `evolutionApplicationService` 作为对外调用入口。
- domain services 归位：在 `contexts/evolution/domain/index.ts` 聚合导出策略、评分、命令安全、capsule、evolution 领域服务。
- interfaces 归位：将 evolution HTTP handlers 实现迁移到 `contexts/evolution/interfaces/http/evolution-handlers.ts`，旧入口 `src/interfaces/http/handlers/evolution-handlers.ts` 收敛为兼容 facade 转发。
- runtime 接线收敛：`contexts/runtime/interfaces/http/handlers/evolution-handlers.ts` 改为依赖 evolution context 接口层入口。
- 上下文契约生效：`app-lifecycle`、`reflection-executor`、`search-learning-execution` 的 evolution 调用改为经 `contexts/evolution/application` 入口，减少对旧路径直连。

## Phase 6（P2）Security Context 迁移

- [x] [P2] 定义 security 子域：鉴权、输入校验、挂载策略、命令安全
- [x] [P2] 迁移安全策略实现：mount-policy/command-safety 等收敛
- [x] [P2] 迁移接口防线：API 参数校验与限流规则归位
- [x] [P2] 建立统一安全服务入口：供各 context 通过契约调用
- [x] [P2] 去除散落实现：清理多点重复校验逻辑

### Phase 6 迭代执行增量（2026-03-17）

- security context 分层落位：新增 `src/contexts/security/{domain,application,infrastructure,interfaces}` 与 `src/contexts/security/index.ts`，形成 security 子域导出边界。
- 统一安全服务入口：新增 `contexts/security/application/security-application-service.ts`，集中承接 Runtime 鉴权、限流、命令安全与挂载校验能力。
- runtime 接线收敛：`runtime-api-router` 改为依赖 security application 入口处理鉴权与限流，移除路由内散落安全分支。
- 参数校验入口归位：memory/evolution/learning/collaboration handlers 的 runtime parser 引用统一改为 `contexts/security/interfaces/http/runtime-api-parsers`。
- 命令与挂载策略收敛：`main-evolution-applier` 与 `mount-builder` 改为通过 security application 契约调用，减少对旧散落实现的直连。

## Phase 7（P2）巨型文件拆分与去耦

- [x] [P2] 拆分 runtime-api-parsers：按资源类型拆分 parser 模块
- [x] [P2] 拆分 ipc：按协议、握手、消息路由、鉴权分离
- [x] [P2] 拆分 evolution-service：按策略/评分/审核/编排解耦
- [x] [P2] 拆分仓储巨型实现：读写职责分离、查询对象化
- [x] [P2] 建立文件尺寸阈值：新增“单文件行数与 import 数”治理门槛

### Phase 7 迭代执行增量（2026-03-17）

- runtime-api-parsers 按资源类型拆分：`shared/memory/learning/evolution/release-control` 子模块落位；`runtime-api-parsers.ts` 保持兼容 facade 导出。
- IPC 主流程拆分：`ipc.ts` 收敛为 facade，新增 `ipc/{protocol,auth,task-router,watcher,types}`，将协议解析、鉴权判定、路由分发与 watcher 协同拆开。
- evolution-service 去耦：提取评分/相似度与审核规则到 `evolution-service-math.ts`、`evolution-service-review.ts`，服务类保留编排职责并复用 Strategy/Scoring/Review 组件。
- evolution 仓储拆分：读仓储拆为 `evolution-read/{entries,capsules,chains,reports,metrics}`，写仓储拆为 `evolution-write/{entries,capsules,chains,reports,metrics}`，原 read/write 文件改兼容导出。
- 查询对象化与治理门槛：在 read 仓储引入 `ApprovedEvolutionEntriesQuery` 内部查询对象；ESLint 增加 `max-lines` 与 `import/max-dependencies` 规则作为文件规模治理基线。

## Phase 8（P3）收敛、治理与文档

- [x] [P3] 清理遗留入口：移除过渡期 facade 并完成 import 收敛
- [x] [P3] 统一依赖方向校验：CI 增加层级依赖静态检查
- [x] [P3] 更新架构文档：输出 context map、依赖图、迁移后约束
- [x] [P3] 统一测试布局：测试按 context 就近放置并规范命名
- [x] [P3] 形成长期机制：新模块准入模板与 DDD 代码评审清单

### Phase 8 迭代执行增量（2026-03-17）

- 遗留入口清理：删除 `src/runtime-api.ts`、`src/ipc.ts`、`src/interfaces/http/runtime-api-router.ts`、`src/interfaces/http/parsers/runtime-api-parsers.ts`、`src/interfaces/http/handlers/evolution-handlers.ts`、`src/application/bootstrap/message-orchestrator.ts`、`src/application/message/message-pipeline.ts` 等过渡 facade；对应测试与 runtime 基础设施改为直接引用目标实现路径。
- 依赖方向校验落地：新增 `scripts/check-ddd-dependencies.ts` 与 `npm run lint:ddd-deps`，并在 CI 增加 `DDD dependency check` 阶段；对既有迁移白名单场景保持显式例外，形成可演进门禁。
- 架构文档补齐：新增 `docs/DDD_CONTEXT_MAP.md`、`docs/DDD_DEPENDENCY_GRAPH.md`、`docs/DDD_CONSTRAINTS.md`，并更新 `docs/ARCHITECTURE.md` 的 DDD 结构索引与治理文档入口。
- 测试布局收敛：将 runtime helper 与 reflection 触发契约测试迁移至 `src/contexts/runtime/**` 下就近目录（`runtime-api-service.test.ts`、`runtime-api-reflection-trigger.test.ts`），`test:ddd-baseline` 同步改为 context 就近路径。
- 长期机制建立：新增 `docs/DDD_MODULE_TEMPLATE.md` 与 `docs/DDD_REVIEW_CHECKLIST.md`，并在 `.github/PULL_REQUEST_TEMPLATE.md` 增加 DDD 治理核对项。

## Phase 9（P3）反模式治理与结构收敛

- [ ] [P3] 治理 learning domain 跨层反向依赖（domain 直连 db/application）
- [ ] [P3] 治理 evolution domain 反向依赖 use case（domain 直连 application）
- [x] [P3] 治理 memory/messaging/runtime 贫血模型（domain 仅类型转发）
- [ ] [P3] 拆分 Bootstrap 上帝对象（启动编排职责下沉）
- [ ] [P3] 拆分 MessageOrchestrator/MessagePipeline 上帝对象（策略与流程解耦）
- [ ] [P3] 治理协作接口跨层直连（handler 直连 db/team/scheduler）

### Phase 9 治理清单（模板化）

#### 9.1 learning domain 跨层反向依赖治理

- 问题描述：`domain/learning/services/learning-scheduler.ts` 存在 domain 直连 `db.js` 与应用执行器，违反 DDD 依赖方向。
- 目标结构：`interfaces -> application -> domain -> infrastructure`，domain 仅依赖仓储/执行端口接口。
- 迁移步骤：
  - 在 learning context 定义 `LearningTaskRepositoryPort` 与 `ReflectionExecutionPort`。
  - 将 `db.js` 与 `reflectionExecutor` 调用下沉到 application/infrastructure 适配器。
  - domain 服务改为依赖注入端口，移除对具体实现 import。
- 验收标准：
  - `src/domain/**` 不再直接 import `db.js` 或 `application/**`。
  - `lint:ddd-deps` 通过，学习相关回归测试通过。
- 责任人：学习域负责人（主责）+ 持久化负责人（协作）。

#### 9.2 evolution domain 反向依赖 use case 治理

- 问题描述：`domain/evolution/services/evolution-service.ts` 直接依赖 `application/evolution/use-cases`。
- 目标结构：application 组合 domain，domain 仅保留策略/规则/评分能力。
- 迁移步骤：
  - 将 use case 组合逻辑上移到 `contexts/evolution/application/*`。
  - `EvolutionService` 暴露纯领域能力接口。
  - 替换调用方为 application service 入口。
- 验收标准：
  - `domain/evolution/**` 内无 `application/**` import。
  - evolution API 与自动评审链路回归通过。
- 责任人：进化域负责人。

#### 9.3 memory/messaging/runtime 贫血模型治理

- 问题描述：部分 context 的 domain 层以类型聚合/转发为主，领域行为未充分承载。
- 目标结构：domain 持有实体、值对象与不变量；application 仅编排流程。
- 迁移步骤：
  - 为 memory/messaging/runtime 建立最小可测领域对象（策略、规则、状态转移）。
  - 将评分、触发判定、生命周期规则由 application 下沉至 domain。
  - application 改为调用 domain policy/aggregate。
- 验收标准：
  - 各 context/domain 至少落地 1 个可测试行为对象。
  - application 规则分支数下降，核心行为单测覆盖增加。
- 责任人：各 context 负责人（memory/messaging/runtime）。

#### 9.4 Bootstrap 上帝对象拆分

- 问题描述：`application/bootstrap/bootstrap.ts` 同时承载配置、依赖检查、DB、通道、调度、IPC、API 启停等职责。
- 目标结构：`StartupPipeline + RuntimeBootstrap + ChannelBootstrap + SchedulerBootstrap` 分层编排。
- 迁移步骤：
  - 按启动阶段拆分子启动器并定义统一生命周期接口。
  - `Bootstrap` 收敛为 orchestrator，仅串联步骤和失败回滚策略。
  - 副作用逻辑下沉至 infrastructure adapters。
- 验收标准：
  - `bootstrap.ts` 复杂度显著下降（职责单一化）。
  - 启停链路回归、容器与 runtime API 相关测试通过。
- 责任人：应用启动链路负责人。

#### 9.5 MessageOrchestrator/MessagePipeline 上帝对象拆分

- 问题描述：消息编排类集中处理策略判定、队列游标、容器调用、上下文注入与持久化，职责过载。
- 目标结构：`InboundPolicy + TriggerPolicy + CursorService + AgentExecutionService + ContextAssemblyService`。
- 迁移步骤：
  - 先提取纯策略模块（可单测），再抽取外部依赖端口（queue/db/container/channel）。
  - 编排类仅保留流程 orchestration。
  - 完成调用方与测试迁移。
- 验收标准：
  - orchestrator/pipeline 圈复杂度下降。
  - 消息路由、恢复、执行链路回归通过。
- 责任人：消息域负责人（主责）+ 运行时负责人（协作）。

#### 9.6 协作接口跨层直连治理

- 问题描述：`interfaces/http/handlers/learning-collaboration-handlers.ts` 存在接口层直连 db、team-manager、scheduler 的跨层耦合。
- 目标结构：接口层仅解析与响应；协作能力经 application façade 暴露。
- 迁移步骤：
  - 按 `messages/tasks/teams/identity` 拆分协作应用服务。
  - handler 改为调用 application use case，DB 访问下沉 repository。
  - 统一 DTO 与参数校验入口。
- 验收标准：
  - interfaces 层不再直接 import `db.js`、`team-manager.js`、`collaboration-scheduler.js`。
  - 协作 API 契约测试通过。
- 责任人：接口层负责人（主责）+ 协作域负责人（协作）。

### Phase 9 迭代执行增量（2026-03-17）

- 过渡文件清理：移除 `src/contexts/**` 下纯转发/纯聚合 `index` 与 façade 文件（含 runtime/security/memory/evolution/messaging 多个过渡入口），并清理 `barrel-export-contract` 测试资产。
- import 路径收敛：将业务引用改为直接指向真实实现文件（如 `memory-application-service`、`evolution-application-service`、`security-application-service`、`runtime-api-parsers/index`）。
- 依赖门禁复核：`npm run lint:ddd-deps` 通过，继续维持跨 context 依赖方向约束。
- 领域行为下沉（memory/messaging/runtime）：新增 `memoryDomainRules`、`TriggerPolicy`、`RuntimeApiSecurityPolicyService` 三个可测试领域对象；应用层改为调用 domain policy，减少 domain 类型转发。
- 领域测试补齐：新增 `memory-domain-rules.test.ts`、`trigger-policy.test.ts`、`runtime-api-security-policy.test.ts`，覆盖评分/生命周期合并、触发判定与运行时鉴权策略。

## 执行策略（建议）

- 小步迁移：每次只迁一个 context 的一个层次。
- 兼容优先：先 facade 转发，再逐步替换调用方。
- 测试护栏：每个 Task 完成后跑对应子集回归，Phase 结束跑全量。
- 可回滚：每个 Phase 保持可独立回退，避免大爆炸式重构。
