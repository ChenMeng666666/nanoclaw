# 代码质量整改报告（2026-03-12）

## 整改目标

- 修复消息处理主链路中会导致漏处理的游标问题
- 修复内容安全清洗失效与输入校验误杀问题
- 修复任务调度 `update_task` 对 `once` 类型更新不完整问题
- 修复技能引擎测试在 Windows 下的跨平台失败点
- 补齐针对上述问题的回归测试
- 同步更新 `agent-flow-tester` 技能文档（`.claude` 与 `.trae`）

## 已完成整改项

### 1) 消息游标与重试链路

- `processGroupMessagesWithTimeout` 在失败且未输出时恢复 `previousCursor`
- `startMessageLoop` 中仅在消息分组处理后更新 `lastTimestamp`
- 活跃容器写入失败时不推进 `lastAgentTimestamp`，避免消息被提前跳过
- `GroupQueue` 新增 `hasActiveContainer()` 用于区分“无活跃容器”与“活跃容器写入失败”

涉及文件：

- `src/index.ts`
- `src/group-queue.ts`

### 2) 安全清洗与输入校验

- 修复 `sanitizeWebContent`：移除 `javascript:` 与内联事件属性
- 收敛 `validateUserInput` SQL 注入规则，减少普通文本误杀（如连字符场景）
- 移除对 `data:` 的一刀切拦截，保留高风险 XSS 特征拦截
- 消息主循环在校验前先执行 Web 内容清洗

涉及文件：

- `src/security.ts`
- `src/index.ts`
- `src/security.test.ts`（新增）

### 3) IPC 任务边界与一致性

- `schedule_task` 新增 prompt 安全校验，不安全请求直接拒绝
- `update_task` 新增 prompt 安全校验，不安全更新直接拒绝
- `update_task` 在 `schedule_type=once` 更新时重算 `next_run`

涉及文件：

- `src/ipc.ts`
- `src/ipc-auth.test.ts`

### 4) 跨平台测试稳定性（Windows）

- `container-runner.test.ts` 补齐 `CONTAINER_NETWORK_MODE` mock 导出
- `run-migrations.test.ts` 按平台选择 `tsx`/`tsx.cmd`
- `scripts/run-migrations.ts` 增加 Windows `tsx` 查找分支（`tsx.cmd`/`where tsx`）
- `skills-engine/rebase.ts` 移除对外部 `diff` 命令依赖，改为内建统一补丁生成
- `skills-engine/path-remap.ts` 统一相对路径为 `/` 风格，消除路径分隔符导致的断言抖动

涉及文件：

- `src/container-runner.test.ts`
- `skills-engine/__tests__/run-migrations.test.ts`
- `scripts/run-migrations.ts`
- `skills-engine/rebase.ts`
- `skills-engine/path-remap.ts`

### 5) 测试技能文档迭代

- 为 `agent-flow-tester` 增加“质量整改专项回归”命令与检查点
- 同步更新 `.claude` 与 `.trae` 两套技能文档，保证执行口径一致

涉及文件：

- `.claude/skills/agent-flow-tester/SKILL.md`
- `.claude/skills/agent-flow-tester/USAGE.md`
- `.trae/skills/agent-flow-tester/SKILL.md`
- `.trae/skills/agent-flow-tester/USAGE.md`

## 回归验证

已执行：

- `npm test -- --runInBand`
- `npm test -- src/security.test.ts src/ipc-auth.test.ts src/container-runner.test.ts skills-engine/__tests__/path-remap.test.ts skills-engine/__tests__/rebase.test.ts skills-engine/__tests__/run-migrations.test.ts`

- 专项回归结果：`6` 个测试文件、`76` 个用例，全部通过
- 全量回归结果：当前环境仍有历史失败项（与本次整改无直接关系），主要集中在 `skills-engine/apply|customize|file-ops|merge` 与 `setup/platform` 的跨平台与超时问题

说明：

- 本次重点验证整改相关回归；完整全量回归建议在 CI 上补充 Linux + Windows 双平台矩阵执行。

## 后续建议

- 把“质量整改专项回归”加入 PR 必跑项
- 继续把 `index.ts` 与 `ipc.ts` 的主流程拆分成更细粒度可测单元
- 为关键流程补充端到端场景：活跃容器写入失败、任务更新重算、安全拦截与重试闭环
