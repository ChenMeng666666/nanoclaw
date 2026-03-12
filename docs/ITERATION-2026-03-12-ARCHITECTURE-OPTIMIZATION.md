# NanoClaw 架构优化迭代记录（2026-03-12 11:20）

- 记录日期：2026-03-12
- 记录时间：11:20

## 迭代背景

本次迭代基于 `docs/ARCHITECTURE.md` 审查结论，重点补全以下高优先级项：

- P0：学习体系 Runtime API 中的 Mock 返回替换为真实数据驱动逻辑
- P1：容器网络隔离能力落地（网络模式与 host-gateway 控制）
- P1：协作任务从“仅发消息”升级为“发消息 + 主动唤醒执行”

## 变更范围

### 1) 容器网络隔离与配置补全

- 在 `ContainerConfig` 增加网络相关配置：
  - `networkMode?: 'bridge' | 'none'`
  - `allowHostGateway?: boolean`
- 在全局配置增加：
  - `CONTAINER_NETWORK_MODE`（默认 `bridge`）
  - `CONTAINER_ALLOW_HOST_GATEWAY`（默认 `true`）
- 在容器启动参数中落地：
  - 始终显式传入 `--network <mode>`
  - Linux 且网络非 `none` 时，按配置注入 `--add-host=host.docker.internal:host-gateway`

目标效果：

- 默认保持兼容，不破坏现有运行
- 可按组或全局关闭容器网络（`none`）
- 对 Linux 文档中的 host-gateway 能力完成实现闭环

### 2) 学习 API 去 Mock 化（Runtime API）

替换以下接口中的硬编码模拟数据，改为基于数据库+记忆系统动态生成：

- `/api/learning/analyze-needs`
- `/api/learning/generate-daily-plan`
- `/api/learning/analyze-outcome`
- `/api/learning/extract-knowledge`
- `/api/learning/reflection/generate`
- `/api/learning/generate-daily-summary`

新增运行时辅助逻辑：

- `normalizeLearningNeeds`：规范化外部输入学习需求
- `inferPlanPriority`：按紧急度推导计划优先级
- `analyzeLearningNeeds`：基于任务状态、反思和记忆生成学习需求
- `analyzeLearningOutcome`：基于任务与反思分析学习结果
- `extractKnowledgePoints`：从任务描述/反思中抽取知识点
- `generateRuntimeReflection`：创建并落库真实反思记录
- `generateDailySummary`：基于任务、反思、记忆生成每日总结
- `splitToPoints`：文本切分工具

自动化状态管理改造：

- 新增内存态 `learningAutomationState`
- `automation/start|stop|status` 不再固定返回 `running`，而是随状态变化

目标效果：

- API 返回内容从“演示数据”升级为“实际运行数据聚合”
- 支持真实任务生命周期驱动学习分析与总结

### 3) 协作任务主动唤醒链路

在协作调度器中新增主动唤醒能力：

- `assignTaskToAgents` 发送协作消息后，调用 `scheduleAgentWakeup`
- `scheduleAgentWakeup` 根据 `agentId -> registered group` 映射创建一次性定时任务（`once`）
- 唤醒任务会在短延迟后触发目标 agent 执行“读取协作消息并推进任务”的 prompt

目标效果：

- 从“被动等待 agent 自己拉消息”升级为“主进程主动触发执行”
- 缩短协作任务分发到执行的时间

### 4) LLM 驱动学习需求分析器（增量）

- 在学习需求分析中新增可选 LLM 增强流程：
  - 环境变量 `LEARNING_NEEDS_LLM_ENABLED=true` 启用
  - 使用 `LEARNING_NEEDS_LLM_MODEL_PATH` 指定模型路径
  - 基于本地 LLM 生成学习需求主题并与规则结果合并
- 未开启时保持原有规则聚合逻辑，兼容现网

### 5) 协作唤醒幂等与去重（增量）

- 唤醒任务 ID 改为稳定键：`collab-wakeup-${taskId}-${agentId}`
- 若存在 active 唤醒任务则跳过重复创建
- 若存在历史任务则复用并重激活，避免无界增长

### 6) 测试覆盖与 CI 门禁（增量）

- 新增测试：
  - `src/runtime-api.test.ts`
  - `src/collaboration-scheduler.test.ts`
- 新增 Node 版本守卫脚本：`scripts/check-node-version.js`
- CI 强化：
  - 增加 `Verify Node version` 步骤
  - Typecheck 改为执行 `npm run typecheck`

## 文件级改动清单

- `src/types.ts`
- `src/config.ts`
- `src/container-runner.ts`
- `src/runtime-api.ts`
- `src/collaboration-scheduler.ts`

## 验证记录

### 已完成

- IDE 诊断检查：无新增 TypeScript 诊断错误
- 关键逻辑人工走查：
  - 容器参数拼接与网络开关
  - 学习 API 路由分支与辅助函数调用路径
  - 协作消息发送后唤醒任务创建路径

### 受环境限制未完成（已记录）

- 终端 Node 版本为 v14（项目要求 Node >=20）
- `npm run typecheck` 无法通过（`tsc` 不可用、node_modules 缺失）
- `npm install` 在当前终端环境未完成有效安装

建议补充验证动作（切换 Node 20 后执行）：

1. `npm install`
2. `npm run typecheck`
3. `npm run test -- runtime-api`
4. `npm run test -- task-scheduler collaboration`
5. 手工回归：
   - 设置 `CONTAINER_NETWORK_MODE=none`，确认容器隔离
   - 调用学习 API，确认返回不再是固定模拟值
   - 创建协作任务，确认自动生成一次性唤醒任务

## 风险与兼容性评估

- 兼容性：默认值保持旧行为（`bridge` + 允许 host-gateway）
- 风险点：
  - `agentId` 与 `group.folder` 映射不一致时，协作唤醒会被跳过并打日志
  - 学习分析为启发式聚合，质量依赖任务/反思数据完整性
- 安全增益：
  - 支持容器网络彻底关闭（`none`），缩小外连面

## 回滚方案

若线上出现回归，可按模块回滚：

1. 回滚 `src/collaboration-scheduler.ts` 的 `scheduleAgentWakeup` 相关改动
2. 回滚 `src/runtime-api.ts` 的学习辅助函数与路由替换
3. 回滚 `src/container-runner.ts`、`src/config.ts`、`src/types.ts` 的网络配置扩展

回滚后系统可恢复到“协作被动触发 + 学习 API 模拟返回 + 默认容器网络行为”的旧模式。

## 后续计划

- 引入 LLM 驱动的学习需求分析器，替代纯规则聚合
- 为协作唤醒链路增加幂等与去重机制（避免重复创建唤醒任务）
- 增加 runtime-api 与协作调度的单元测试覆盖
- 在 CI 增加 Node 版本守卫与类型检查门禁
