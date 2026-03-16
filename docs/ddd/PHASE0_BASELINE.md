# Phase 0 基线治理与防护网

## 1) 冻结迁移边界

- 本阶段只允许结构治理与防护能力建设，不允许业务行为变更。
- 禁止修改外部接口语义、返回结构与持久化数据语义。
- 迁移期间允许保留旧入口作为 facade 转发层，禁止在 facade 中引入新业务逻辑。
- 每次变更必须通过 `typecheck`、`ddd:deps-check`、`test:phase0`。

## 2) 依赖规则（contexts 间白名单）

- 同一 context 内依赖方向：`interfaces -> application -> domain`，`infrastructure -> domain`，禁止反向依赖。
- 跨 context 默认禁止直接依赖。
- 例外白名单：仅允许 `application -> 其他 context 的 application/contracts|application/ports`。
- 校验入口：`npm run ddd:deps-check`。

## 3) 兼容策略（Facade 转发期）

- 旧入口文件在迁移过渡期保留，仅负责转发到新结构。
- 旧入口导出集合需保持兼容，不新增跨上下文聚合职责。
- 移除条件：调用方完成切换、回归通过、迁移看板对应条目关闭。

## 4) 回归基线（Phase0）

- Runtime API：`src/runtime-api.test.ts`、`src/runtime-api.memory-validation.test.ts`
- Container：`src/container-runner.test.ts`
- Channels：`src/channels/registry.test.ts`
- DB：`src/db.test.ts`
- 执行入口：`npm run test:phase0`
