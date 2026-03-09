# ContextEngine 与路由持久化迭代 - 完成总结

## 阶段 1: 基础架构 (ContextEngine)

- [x] 创建 `src/context-engine/types.ts` - 类型定义
- [x] 创建 `src/context-engine/interface.ts` - ContextEngine 接口
- [x] 创建 `src/context-engine/registry.ts` - 插件注册表
- [x] 创建 `src/context-engine/default-engine.ts` - 默认引擎骨架

## 阶段 2: 路由持久化

- [x] 修改 `src/db.ts` - 添加 routing_bindings 表
- [x] 创建 `src/db-routing.ts` - 路由绑定 CRUD
- [x] 创建 `scripts/migrate-add-routing-bindings.ts` - 迁移脚本

## 阶段 3: 混合检索

- [x] 安装依赖：`npm install natural @types/natural`
- [x] 创建 `src/hybrid-search.ts` - BM25 + 向量融合
- [x] 实现 `DefaultContextEngine.assemble()` 混合检索

## 阶段 4: DefaultContextEngine 完整实现

- [x] 实现 5 个生命周期钩子完整逻辑
- [x] 迁移原有 MemoryManager 逻辑

## 阶段 5: Topic 级路由

- [x] 修改 `src/channels/telegram.ts` - Topic 检测和 /bind 命令
- [x] 修改 `src/agent-router.ts` - 集成绑定查找（Topic 优先）
- [x] 修改 `src/index.ts` - 启动时加载 routing_bindings

## 阶段 6: 集成与测试

- [x] 修改 `src/index.ts` - 注册默认 ContextEngine
- [x] 编写单元测试
  - [x] `src/context-engine/__tests__/registry.test.ts` - 6 tests ✅
  - [x] `src/__tests__/hybrid-search.test.ts` - 14 tests ✅
  - [x] `src/__tests__/db-routing.test.ts` - 8 tests ✅
  - [x] `src/channels/telegram.test.ts` - 50 tests ✅
- [x] 更新文档
  - [x] `docs/CONTEXT_ENGINE.md` - ContextEngine 开发指南
  - [x] `docs/ROUTING_BINDINGS.md` - 路由绑定使用手册

---

## 测试结果

### 完整测试套件
```
✅ Test Files: 35 passed (35)
✅ Tests: 404 passed (404)
```

### 新增测试
```
✅ ContextEngineRegistry (6 tests)
✅ BM25Index & RRF Fusion (14 tests)
✅ Routing Bindings CRUD (8 tests)
✅ TelegramChannel (50 tests)

总计：78/78 新增测试通过
```

### 编译状态
```
✅ TypeScript 编译成功
```

### 数据库迁移
```
✅ routing_bindings 表创建成功
```

---

## 交付清单

### 新增文件 (14 个)

| 文件 | 说明 |
|------|------|
| `src/context-engine/types.ts` | Context、CompactResult、TurnResult 类型定义 |
| `src/context-engine/interface.ts` | ContextEngine 接口（5 个生命周期钩子） |
| `src/context-engine/registry.ts` | 插件注册表 |
| `src/context-engine/default-engine.ts` | 默认引擎实现 |
| `src/hybrid-search.ts` | BM25 + RRF 融合检索 |
| `src/db-routing.ts` | 路由绑定 CRUD 操作 |
| `scripts/migrate-add-routing-bindings.ts` | 数据库迁移脚本 |
| `src/context-engine/__tests__/registry.test.ts` | Registry 单元测试 |
| `src/__tests__/hybrid-search.test.ts` | 混合检索单元测试 |
| `src/__tests__/db-routing.test.ts` | 路由绑定单元测试 |
| `docs/CONTEXT_ENGINE.md` | ContextEngine 开发指南 |
| `docs/ROUTING_BINDINGS.md` | 路由绑定使用手册 |
| `src/channels/telegram.ts` | Telegram Channel 实现 |
| `src/channels/telegram.test.ts` | Telegram Channel 单元测试 |

### 修改文件 (5 个)

| 文件 | 修改内容 |
|------|------|
| `src/db.ts` | 添加 routing_bindings 表及索引 |
| `src/db-agents.ts` | 添加 getDatabase()、getUserMemories() 函数 |
| `src/agent-router.ts` | 支持 Topic 级路由（优先查绑定表） |
| `src/channels/telegram.ts` | 添加 /bind 命令、Topic 检测 |
| `src/index.ts` | 集成 ContextEngine、替换 memoryManager |

---

## 核心功能

### 1. ContextEngine 插件化

- 5 个生命周期钩子：bootstrap、ingest、assemble、compact、afterTurn
- 插件注册表支持多引擎
- 默认引擎实现完整记忆管理

### 2. 混合检索

- 自定义 BM25 实现（支持英文分词）
- 向量语义搜索（Xenova transformers）
- RRF 倒数排名融合算法

### 3. 路由持久化

- SQLite 存储绑定信息
- 重启后绑定依然有效
- Topic 级细粒度路由

### 4. Telegram 集成

- `/bind @agent` 命令绑定 Topic
- 自动检测 Forum Topic
- Session 隔离支持

---

## 技术栈

- **TypeScript**: 4.6+
- **测试框架**: Vitest
- **数据库**: better-sqlite3
- **BM25**: 自定义实现
- **向量嵌入**: @xenova/transformers (all-MiniLM-L6-v2)

---

## Agent-Learning 技能问题修复

### 问题描述
- 用户让 Mimi 建立了学习计划，但问"有哪些定时任务"时 Mimi 不懂
- 完成了一个学习计划但没有进行反思
- 需要验证进化库提交是否正常

### 已完成的修复

- [x] **修复 `/api/learning/task/complete` 端点**
  - 修改 `src/runtime-api.ts` 中的完成任务逻辑
  - 调用 `reflectionScheduler.completeLearningTask()` 完整流程
  - 确保反思记录和 evolution_id 正确更新

- [x] **添加定时任务查询 API**
  - 新增 `/api/scheduled/tasks` 端点
  - 支持按 groupFolder 和 status 过滤
  - 导入 `getAllTasks` 和 `getTasksForGroup` 函数

- [x] **更新 SKILL.md 文档**
  - 添加定时任务查询说明
  - 说明学习任务和定时任务的区别
  - 更新 API 参考表格

- [x] **修复已有数据**
  - 创建 `scripts/fix-missing-reflection-ids.ts` 迁移脚本
  - 修复 2 个已完成任务的 reflection_id（#30, #31）

- [x] **添加 Agent 提示词**
  - 在 SKILL.md 中添加 FAQ 章节，包含 3 个常见问题
  - 说明定时任务 vs 学习任务的区别
  - 提供完整的 API 调用示例和回答模板

### 待执行的任务

- [ ] **端到端测试**：在真实环境中测试完整的学习任务完成流程

---

## Agent-Learning 技能深度修复（新增）

### 问题分析（2026-03-09）

#### 问题 1: Mimi 重复响应相同内容

**症状**: 用户和米米对话一句，她同样的回复了几次

**根本原因分析**：
- `startMessageLoop()` (line 365-376) 和 `processGroupMessages()` (line 186-188) 分别维护两个 cursor
- `GroupQueue.scheduleRetry()` (line 263-284) 在容器失败时重试，可能重新处理已发送的消息
- 当容器在发送部分响应后失败，虽然 `outputSentToUser` 阻止 cursor 回滚，但重试逻辑仍可能触发

**修复方案**：
1. 在 `processGroupMessages()` 中添加消息去重逻辑
2. 或修改重试逻辑，只在完全失败（未发送任何输出）时才重试

#### 问题 2: 学习计划不会自动定时学习，也没有定时反思总结

**OpenClaw 对比分析**：

| 功能 | OpenClaw | NanoClaw (当前) |
|------|----------|-----------------|
| 定时学习任务 | ✅ 每小时自动安装技能 + 知识提取 | ❌ 只创建学习任务记录，不自动执行 |
| 学习反思触发 | ✅ 每 30 分钟 heartbeat 自动反思 | ⚠️ 只在完成任务时触发，无定时反思 |
| 知识自动提取 | ✅ 安装技能后自动调用 extract-skill-knowledge | ❌ 无自动知识提取机制 |
| 学习时段调度 | ✅ 24 小时分 6 个时段定向学习 | ❌ 无学习时段概念 |
| 每日进化报告 | ✅ 每天 22:00 生成 | ⚠️ 只有 weekly/monthly 反思 |

**OpenClaw 核心机制**：
1. **24 小时定向学习** - `config/skill-learning-schedule.json` 配置不同时段学习关键词
2. **每小时技能学习** - `install-skills-infinite` 任务自动安装新技能
3. **知识提取脚本** - `extract-skill-knowledge.py` 在安装后自动提取知识点
4. **每 30 分钟 heartbeat** - 反思最近学习的技能，记录经验教训
5. **每天 22:00 daily-evolution** - 分析今日学习的技能，生成进化报告

**NanoClaw 需要添加的功能**：
1. [ ] 学习计划创建时自动在 `scheduled_tasks` 表中创建定时学习任务
2. [ ] 添加学习进度定时反思（如每周日检查进度）
3. [ ] 可选：添加学习时段配置，类似 OpenClaw 的 24 小时定向学习

### 待办任务

- [x] **修复重复响应问题**
  - [x] 分析消息去重的可行性（基于消息 ID 或时间戳）
  - [x] 实现去重逻辑或优化重试机制
  - [x] 测试修复效果

- [x] **实现学习计划自动调度**
  - [x] 修改 `/api/learning/plan/create`，创建计划时自动创建定时任务
  - [x] 为每个学习阶段创建独立的定时任务
  - [x] 添加学习进度反思定时任务（每周日）

- [ ] **更新文档**
  - [x] 更新 SKILL.md 说明自动调度机制
  - [x] 添加使用示例和预期行为说明

---

## 后续建议

1. **端到端测试**: 在真实 Telegram 环境中测试完整流程
2. **性能优化**: 对大量记忆的检索进行性能测试和优化
3. **中文分词**: 集成中文分词库提升 BM25 对中文的支持
4. **记忆压缩**: 实现基于 LLM 的智能会话压缩
5. **用户级记忆**: 增强 getUserMemories 功能实现个性化记忆

---

## 相关文档

- [ContextEngine 开发指南](docs/CONTEXT_ENGINE.md)
- [路由绑定使用手册](docs/ROUTING_BINDINGS.md)
- [任务计划](tasks/todo.md)
