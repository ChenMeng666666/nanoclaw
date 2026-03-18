# NanoClaw 完整架构文档

> 最后更新: 2026-03-18 10:30

## 目录

- [项目概述](#项目概述)
- [核心架构](#核心架构)
- [记忆系统](#记忆系统)
- [进化系统 (GEP 1.5.0)](#进化系统-gep-150)
- [学习体系](#学习体系)
- [多智能体协作](#多智能体协作)
- [安全系统](#安全系统)
- [部署架构](#部署架构)
- [工程质量与ci](#工程质量与-ci)
- [关键文件索引](#关键文件索引)

---

## 项目概述

### 核心理念

NanoClaw 是一个个人 Claude 助手，其设计哲学是：

1. **小到可理解** - 单一 Node.js 进程，少量源文件，无微服务
2. **通过隔离实现安全** - Agent 在真实的 Linux 容器中运行，而不是仅仅依靠应用层权限检查
3. **为个人用户打造** - 不是框架或平台，而是针对特定需求的工作软件
4. **自定义 = 代码更改** - 无配置泛滥，想要不同的行为就修改代码
5. **AI 原生开发** - 假设你有 AI 协作者，代码不需要过度自文档化或自调试
6. **技能胜于功能** - 贡献者应该贡献技能而非功能

### 技术栈

| 组件     | 技术                                                                 |
| -------- | -------------------------------------------------------------------- |
| 运行时   | Node.js 20+                                                          |
| 容器     | Docker（默认）+ Apple Container（通过 skill 切换）                   |
| 数据库   | SQLite（better-sqlite3）+ sqlite-vec（向量检索）                    |
| 向量嵌入 | @xenova/transformers（默认）+ node-llama-cpp（本地模型补充能力）     |
| 定时任务 | node-cron                                                            |
| 密钥存储 | keytar（系统 keychain）+ AES-256-GCM 加密文件 fallback               |
| 协议标准 | GEP 1.5.0（Genome Evolution Protocol）                               |

---

## 核心架构

### 整体架构图

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 消息通道层（WhatsApp / Telegram / Slack / Gmail ...）                        │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ app/bootstrap (Bootstrap)                                                   │
│ 负责配置校验、依赖检查、通道连接、调度与 Runtime API 启停                        │
└───────────────┬──────────────────────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ DDD Context 层（interfaces → application → domain → infrastructure）         │
│ - messaging: 路由、消息流水线、状态恢复                                        │
│ - runtime: Runtime API、容器运行时、IPC                                       │
│ - memory: 记忆检索/治理/生命周期规则                                           │
│ - evolution: Gene 提交/评审/反馈与治理                                         │
│ - security: 鉴权、限流、参数校验、命令/挂载安全                                │
└───────────────┬──────────────────────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ shared + platform                                                            │
│ - shared/kernel & shared/config: 核心类型、日志、错误与配置                   │
│ - platform/persistence: SQLite 与仓储装配                                    │
│ - platform/integration: 通道注册与外部 provider 适配                          │
└───────────────┬──────────────────────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 数据与执行层                                                                   │
│ - SQLite: store/messages.db                                                  │
│ - 容器执行: Docker 默认，按能力可切换 Apple Container                          │
│ - Agent 隔离运行: 每个 group 独立容器与文件系统                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 核心模块说明

| 模块 | 文件 | 职责 |
| --- | --- | --- |
| 启动编排 | `src/application/bootstrap/bootstrap.ts` | 系统启动、依赖检查、通道接线、子系统装配 |
| 主入口 | `src/index.ts` | 最小入口，委托 Bootstrap |
| messaging context | `src/contexts/messaging/**` | 消息路由、编排、状态恢复、队列基础设施 |
| runtime context | `src/contexts/runtime/**` | Runtime API 服务、HTTP 路由、容器运行时、IPC watcher |
| memory context | `src/contexts/memory/**` | 记忆应用服务、领域规则、仓储与 context-engine 适配 |
| evolution context | `src/contexts/evolution/**` | 提交/选择/反馈用例、评审与治理链路 |
| security context | `src/contexts/security/**` | 鉴权、限流、参数校验、挂载与命令安全 |
| platform/persistence | `src/platform/persistence/**` | SQLite 接入、事务与仓储装配 |
| platform/integration | `src/platform/integration/**` | 通道 provider 注册与接线 |
| shared/kernel+config | `src/shared/**` | 核心类型、错误、日志、配置聚合 |
| 兼容 facade | `src/logger.ts`, `src/config.ts`, `src/router.ts`, `src/channels/registry.ts`, `src/memory-manager.ts` | 迁移期兼容导出与转发，避免一次性破坏调用方 |

---

## 记忆系统

### 分层记忆架构

NanoClaw 实现了三级分层记忆系统，并将 `ContextEngine` 冻结为唯一主消息链路，`MemoryManager` 作为治理与服务层：

- **主消息链路（唯一）**: `ContextEngine` 执行 `assemble -> ingest -> afterTurn`
- **治理与运行时链路**: `MemoryManager` 提供增删查、迁移、指标、发布控制与回滚
- **链路开关策略**: `MEMORY_MAIN_PIPELINE=context_engine` 为默认生产值；`memory_manager` 仅用于降级兼容
- **迁移方向**: 单向 L1 -> L2 -> L3

```
┌───────────────────────────────────────────────────────────────┐
│                        记忆流转过程                               │
│                                                                   │
│  ┌─────────────┐    达到迁移条件     ┌─────────────┐             │
│  │  L1 工作记忆 │ ────────────────> │  L2 短期记忆 │             │
│  │ (内存缓存)   │                   │  (数据库)    │             │
│  │ - 当前对话   │    30 天未访问    │ - 中等速度    │             │
│  │ - 快速访问   │                   │ - 可过滤检索   │             │
│  └─────────────┘                   └──────┬──────┘             │
│                                              │                      │
│                                              │  30 天未访问        │
│                                              ▼                      │
│                                  ┌─────────────┐                   │
│                                  │  L3 长期记忆 │                   │
│                                  │ (数据库+向量)│                   │
│                                  │ - 永久存储   │                   │
│                                  │ - 语义检索   │                   │
│                                  └─────────────┘                   │
└───────────────────────────────────────────────────────────────┘
```

### 记忆层级详解

#### L1 - 工作记忆 (Working Memory)

- **存储位置**: 内存缓存 (Map)
- **容量**: 有限，最近对话
- **访问速度**: 极快
- **生命周期**: 当前会话
- **持久化语义**: 创建/更新时即时写入数据库，定时任务负责缓存清理
- **迁移条件**: 访问次数 ≥ `MEMORY_L1_TO_L2_MIN_ACCESS_COUNT` 且闲置天数 > `MEMORY_L1_TO_L2_MIN_IDLE_DAYS`

#### L2 - 短期记忆 (Short-term Memory)

- **存储位置**: SQLite 数据库
- **容量**: 中等规模（可长期保留并按条件迁移）
- **访问速度**: 中等
- **生命周期**: 30 天
- **迁移条件**:
  - 闲置天数 > `MEMORY_L2_TO_L3_MIN_IDLE_DAYS` → 迁移到 L3
  - 衰减后重要性 > `MEMORY_L2_TO_L3_MIN_IMPORTANCE` → 迁移到 L3

#### L3 - 长期记忆 (Long-term Memory)

- **存储位置**: SQLite 数据库 + 向量嵌入
- **容量**: 无限
- **访问速度**: 较慢（语义检索）
- **生命周期**: 永久
- **检索方式**:
  - 向量相似度搜索 (余弦相似度)
  - 关键词搜索
  - 混合搜索 (关键词 + 向量)

### 记忆数据结构

```typescript
interface Memory {
  id: string;
  agentFolder: string;
  userJid?: string; // 可选：绑定特定用户
  scope?: 'session' | 'user' | 'agent' | 'global';
  level: 'L1' | 'L2' | 'L3';
  content: string;
  embedding?: number[]; // 向量嵌入（可用于 L1/L2/L3）
  importance: number; // 重要性评分 (0-1)
  qualityScore?: number; // 质量评分 (0-1)
  accessCount: number; // 访问次数
  lastAccessedAt?: string;
  createdAt: string;
  updatedAt: string;

  // 元数据
  messageType?: 'user' | 'system' | 'bot' | 'code' | 'document';
  timestampWeight?: number; // 时间戳权重
  sessionId?: string; // 会话ID
  tags?: string[]; // 标签
  sourceType?: 'direct' | 'extracted' | 'summary';
}
```

### 记忆系统 API (运行时)

容器内 Agent 可通过 HTTP API 访问记忆系统：

| 端点                           | 方法     | 说明                                   |
| ------------------------------ | -------- | -------------------------------------- |
| `/api/memory/add`              | POST     | 添加记忆                               |
| `/api/memory/search`           | POST     | 搜索记忆（支持 explain、多维过滤）     |
| `/api/memory/list`             | GET      | 列出记忆（支持作用域与元数据过滤）     |
| `/api/memory/metrics/dashboard`| GET      | 记忆指标看板                           |
| `/api/memory/release/control`  | GET/POST | 检索发布控制（含 canary）              |
| `/api/memory/release/rollback` | POST     | 回滚发布控制                           |

### 记忆迁移调度

- **持久化调度**: 主进程每 5 分钟调用 `MemoryManager.persistL1Memories`
- **迁移调度**: 主进程每小时调用 `MemoryManager.migrateMemories`
- **固化调度**: 反思调度器每日 23:30 执行 L2 -> L3 记忆固化
- **向量嵌入**: 异步生成，不阻塞主流程

---

## 进化系统 (GEP 1.5.0)

### GEP 协议概述

NanoClaw 实现了 **Genome Evolution Protocol (GEP) 1.5.0** 标准，这是一个用于 AI 经验进化的开放协议。

### 核心概念

```
┌─────────────────────────────────────────────────────────────────┐
│                      GEP 1.5.0 生态系统                          │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    经验提交流程                               │  │
│  │                                                               │  │
│  │  Agent 执行任务 → 总结经验 → 生成 Gene → 提交审核           │  │
│  │                                          │                     │  │
│  │                              ┌───────────┴───────────┐         │  │
│  │                              ▼                       ▼         │  │
│  │                        高置信度自动通过          低置信度人工审核 │  │
│  │                              │                       │         │  │
│  │                              └───────────┬───────────┘         │  │
│  │                                          ▼                     │  │
│  │                                    Approved → 入库              │  │
│  │                                          │                     │  │
│  │                                          ▼                     │  │
│  │                                    其他 Agent 复用              │  │
│  │                                          │                     │  │
│  │                                          ▼                     │  │
│  │                                    收集使用反馈                 │  │
│  │                                          │                     │  │
│  │                    评分过低 ────────────┴───────────→ 再审核   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### GEP 1.5.0 数据模型

#### Gene (基因)

Gene 是经验的基本单位，包含完整的执行策略和验证方法。

```typescript
interface GEPGene extends GEPAsset {
  type: 'Gene';
  schema_version: '1.5.0';
  asset_id: string; // sha256:<hash>

  // 分类和匹配
  category: 'repair' | 'optimize' | 'innovate';
  signals_match: string[]; // 匹配的信号类型
  summary: string;

  // 执行策略
  preconditions: string[]; // 前置条件
  validation_commands: string[]; // 验证命令

  // 质量评分
  gdi_score?: GDIScore; // 全球期望指数
  status: 'promoted' | 'stale' | 'archived';

  // 能力链
  chain_id?: string;

  // 数据库字段
  id: number;
  ability_name: string;
  description?: string;
  source_agent_id: string;
  content: string;
  content_embedding?: number[];
  tags: string[];
  feedback: Array<{
    agent_id: string;
    comment: string;
    rating: number;
    used_at?: string;
  }>;
  created_at: string;
}
```

#### Capsule (胶囊)

Capsule 是验证后的执行结果，代表成功应用 Gene 的经验。

```typescript
interface GEPCapsule extends GEPAsset {
  type: 'Capsule';
  schema_version: '1.5.0';
  asset_id: string;

  trigger: string[];
  gene: string; // Gene 的 asset_id
  summary: string;
  confidence: number; // 0-1 置信度

  // 影响范围
  blast_radius: {
    files: number;
    lines: number;
  };

  // 执行结果
  outcome: {
    status: 'success' | 'partial' | 'failed';
    score: number;
  };

  // 环境指纹
  env_fingerprint: {
    platform: string;
    arch: string;
    runtime?: string;
    dependencies?: string[];
  };

  success_streak: number;
  gene_id: number;
  approved_at: string;
}
```

#### GDI Score (全球期望指数)

GDI 评分是 Gene 质量的综合评估，用于排序和筛选。

```typescript
interface GDIScore {
  intrinsicQuality: number; // 0-10 (35%) - 内在质量
  usageMetrics: number; // 0-10 (30%) - 使用指标
  socialSignals: number; // 0-10 (20%) - 社会信号
  freshness: number; // 0-10 (15%) - 新鲜度
  total: number; // 总分 (0-10)
}
```

#### Ability Chain (能力链)

Ability Chain 将多个 Gene 组织成一个工作流。

```typescript
interface AbilityChain {
  chain_id: string;
  genes: string[]; // Gene asset_id 列表，按顺序
  capsules: string[]; // Capsule asset_id 列表
  description?: string;
  created_at: string;
  updated_at: string;
}
```

### 进化系统 API

| 端点                               | 方法 | 说明                                   |
| ---------------------------------- | ---- | -------------------------------------- |
| `/api/evolution/query`             | POST | 查询进化库（支持标签与 limit）         |
| `/api/evolution/submit`            | POST | 提交经验（自动生成 Gene）              |
| `/api/evolution/select-gene`       | POST | 按类别/信号选择最优 Gene               |
| `/api/evolution/feedback`          | POST | 提交使用反馈                           |
| `/api/evolution/metrics/dashboard` | GET  | 获取进化看板指标（summary + timeline） |
| `/api/governance/metrics/dashboard`| GET  | 获取统一治理看板（进化 + 记忆）        |

### 审核流程

1. **自动初审**:
   - 检查格式正确性
   - 检查重复提交（信号去重）
   - 检查验证命令安全性
   - 高置信度自动通过

2. **人工审核**:
   - 低置信度提交给用户审核
   - 5个维度评分：safety, effectiveness, reusability, clarity, completeness

3. **再审核触发**:
   - 使用反馈评分过低
   - 长时间未使用
   - 安全问题报告

### 进化闭环与治理强化（P0/P1）

- **Capsule 晋升语义对齐**: 主流程只在有效成功结果下构建 `outcome.status='success'` 的晋升输入
- **冷启动晋升可达**: 晋升判定不再依赖 `capsules.length` 近似计数，首个 Capsule 可在受控条件下产生
- **配置驱动阈值**: duplicate 阈值、GDI 晋升阈值、metrics 快照间隔均由配置统一消费
- **API 防线增强**: evolution 路由补齐参数边界校验，并加入限流与并发保护，避免异常输入与资源放大
- **统一观测看板**: 提供 `evolution` 与 `governance` 指标看板，便于跨系统审计与回归排查

---

## 学习体系

### 学习架构

NanoClaw 的学习体系结合了反思、计划和执行三个环节：

```
┌─────────────────────────────────────────────────────────────────┐
│                         学习循环                                  │
│                                                                   │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   执行任务    │────>│    反思      │────>│   学习计划    │    │
│  │  (Execute)   │     │  (Reflect)   │     │   (Plan)     │    │
│  └──────────────┘     └──────────────┘     └──────┬───────┘    │
│         ^                                              │            │
│         └──────────────────────────────────────────────┘            │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    反思类型                                  │  │
│  │                                                             │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │  Hourly  │  │  Daily   │  │  Weekly  │  │  Monthly │ │  │
│  │  │  (每小时) │  │  (每天)   │  │  (每周)   │  │  (每月)   │ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │  │
│  │                                                             │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │              Task-based Reflection                   │   │  │
│  │  │           (任务完成后自动触发反思)                    │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 学习数据结构

#### 学习任务

```typescript
interface LearningTask {
  id: string;
  agentFolder: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  reflectionId?: number; // 完成后触发的反思
  resources?: string[];
  createdAt: string;
  completedAt?: string;
}
```

#### 反思总结

```typescript
interface DetailedReflection extends Reflection {
  id: number;
  agentFolder: string;
  type: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'task';
  content: string;
  triggeredBy?: string;
  createdAt: string;

  // 扩展字段
  taskId?: string;
  completionTime?: string;
  actualDuration?: number; // 分钟
  knowledgeGained?: string[];
  difficulties?: string[];
  solutions?: string[];
  suggestions?: string[];
  keyInsights?: string[];
  nextSteps?: string[];
  rating?: 1 | 2 | 3 | 4 | 5;
}
```

#### 每日学习计划

```typescript
interface DailyLearningPlan {
  id: string;
  date: string;
  agentFolder: string;
  tasks: LearningTask[];
  estimatedTime: number;
  priority: 'high' | 'medium' | 'low';
}
```

#### 每日学习总结

```typescript
interface DailyLearningSummary {
  id: string;
  date: string;
  agentFolder: string;
  tasksCompleted: number;
  totalTimeSpent: number; // 分钟
  knowledgePoints: string[];
  achievements: string[];
  challenges: string[];
  improvements: string[];
  tomorrowPlan: string[];
  mood: 'great' | 'good' | 'average' | 'bad';
  notes?: string;
}
```

### 学习调度

| 调度类型   | 频率         | 触发方式 |
| ---------- | ------------ | -------- |
| 每小时反思 | 每小时       | 定时任务 |
| 每日反思   | 每天指定时间 | 定时任务 |
| 每周反思   | 每周指定时间 | 定时任务 |
| 每月反思   | 每月指定时间 | 定时任务 |
| 每年反思   | 每年指定时间 | 定时任务 |
| 任务后反思 | 任务完成后   | 事件触发 |

### 学习系统 API

| 端点                                   | 方法 | 说明                                 |
| -------------------------------------- | ---- | ------------------------------------ |
| `/api/learning/analyze-needs`          | POST | 分析学习需求（SDK 优先，本地模型兜底） |
| `/api/learning/generate-daily-plan`    | POST | 生成每日学习计划                     |
| `/api/learning/analyze-outcome`        | POST | 分析学习任务结果                     |
| `/api/learning/extract-knowledge`      | POST | 抽取知识点                           |
| `/api/learning/orchestrate-intent`     | POST | 学习意图确定性编排（先校验反思任务） |
| `/api/learning/automation/start`       | POST | 启动学习自动化                       |
| `/api/learning/automation/stop`        | POST | 停止学习自动化                       |
| `/api/learning/automation/status`      | GET  | 查询学习自动化状态（desired/observed） |
| `/api/learning/reflection/generate`    | POST | 生成并落库反思                       |
| `/api/learning/generate-daily-summary` | POST | 生成每日学习总结                     |
| `/api/learning/tasks`                  | GET  | 查询学习任务                         |
| `/api/learning/task/create`            | POST | 创建学习任务                         |
| `/api/learning/plan/create`            | POST | 创建分阶段学习计划并自动排程         |
| `/api/learning/task/start`             | POST | 启动学习任务                         |
| `/api/learning/task/complete`          | POST | 完成学习任务并写入记忆               |
| `/api/learning/plans`                  | GET  | 查询学习计划（记忆检索）             |
| `/api/learning/result`                 | POST | 写入学习结果                         |
| `/api/learning/results`                | GET  | 查询学习结果历史                     |
| `/api/learning/system/version`         | GET  | 查询学习体系版本                     |
| `/api/learning/system/update`          | POST | 触发学习体系更新                     |
| `/api/learning/system/diff`            | GET  | 查询版本差异                         |
| `/api/scheduled/tasks`                 | POST | 写入定时任务（cron/interval/once）    |
| `/api/reflection/trigger`              | POST | 触发反思执行                         |
| `/api/signals/extract`                 | POST | 解析输入并提取信号                   |
| `/api/saturation/detect`               | POST | 识别饱和状态并产出治理信号           |

学习 API 以 [openapi.yaml](./openapi.yaml) 为准，`docs/RUNTIME_API.md` 为使用示例；学习体系版本信息以 Runtime API 与 OpenAPI 定义为准。

---

## 多智能体协作

### 协作架构

NanoClaw 支持多个智能体协同工作，每个智能体在独立容器中运行：

```
┌─────────────────────────────────────────────────────────────────┐
│                    多智能体协作架构                                │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    消息通道层                                  │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │  │
│  │  │ Bot A    │  │ Bot B    │  │ Bot C    │  ...              │  │
│  │  │ (Agent 1)│  │ (Agent 2)│  │ (Agent 3)│                   │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘                   │  │
│  └───────┼──────────────┼──────────────┼─────────────────────────┘  │
│          │              │              │                         │
│          └──────────────┴──────────────┘                         │
│                         │                                          │
│                         ▼                                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  主进程协作管理层                            │  │
│  │                                                             │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │ Agent Router │  │   Team Mgr   │  │  Collab Sched│   │  │
│  │  │ (智能体路由) │  │  (团队管理)   │  │  (协作调度)   │   │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │  │
│  │         │                   │                   │            │  │
│  │  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐   │  │
│  │  │Agent Comm    │  │  Per-chat Bot │  │  Task Queue  │   │  │
│  │  │(智能体通信)   │  │  Identity     │  │  (任务队列)   │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                         │                                          │
│         ┌───────────────┼───────────────┐                        │
│         ▼               ▼               ▼                        │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                  │
│  │ Agent 1  │    │ Agent 2  │    │ Agent 3  │  ...             │
│  │Container │    │Container │    │Container │                  │
│  └──────────┘    └──────────┘    └──────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

### 核心协作组件

#### 1. 智能体间通信 (Agent Communication)

智能体可以直接互相发送消息：

```typescript
interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  type: 'message' | 'task' | 'notification' | 'status';
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
}
```

**通信 API**:

- `/api/collaboration/messages/send` - 发送消息
- `/api/collaboration/messages/receive` - 接收消息
- `/api/collaboration/messages/status` - 查询消息状态

#### 2. Per-chat Bot 身份

每个聊天可以有独立的 Bot 身份：

```typescript
interface BotIdentity {
  id: string;
  chatJid: string;
  agentId: string;
  botName: string;
  botAvatar?: string;
  isActive: boolean;
  config?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
```

**路由优先级**:

1. Topic 级路由绑定（最高优先级）
2. Per-chat Bot 身份绑定
3. 普通 chatJid 路由（最低优先级）

#### 3. 团队管理 (Team Management)

创建和管理智能体团队：

```typescript
interface TeamState {
  id: string;
  name: string;
  description?: string;
  members: string[]; // 智能体 ID 列表
  leaderId?: string;
  status: 'active' | 'inactive' | 'dissolved';
  collaborationMode: 'hierarchical' | 'peer-to-peer' | 'swarm';
  createdAt: string;
  updatedAt: string;
}
```

**协作模式**:

- `hierarchical` - 层级模式：领导者分配任务
- `peer-to-peer` - 点对点模式：平等协作
- `swarm` - 蜂群模式：自组织协作

#### 4. 协作任务调度 (Collaboration Scheduler)

管理团队任务分配和依赖：

```typescript
interface CollaborationTask {
  id: string;
  title: string;
  description?: string;
  teamId?: string;
  assignedAgents: string[]; // 参与的智能体列表
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  progress: number; // 0-100
  dependencies?: string[]; // 依赖的任务 ID 列表
  context?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
```

**任务分配**:

- Leader 分配任务
- 智能体可以认领任务
- 支持任务依赖管理
- 任务超时自动标记失败
- 发送任务消息后主进程会创建一次性唤醒任务（`collab-wakeup-{taskId}-{agentId}`）
- 唤醒任务具备幂等去重，避免重复创建

#### 5. 团队协作状态

跟踪团队协作进度：

```typescript
interface TeamCollaborationState {
  id: string;
  teamId: string;
  taskId?: string;
  status: 'planning' | 'executing' | 'reviewing' | 'completed';
  progress: number; // 0-100
  activeAgents: string[];
  lastActivity: string;
  createdAt: string;
  updatedAt: string;
}
```

### 协作系统 API

| 端点                                | 方法 | 说明             |
| ----------------------------------- | ---- | ---------------- |
| `/api/collaboration/messages/*`     | \*   | 智能体间消息 API |
| `/api/collaboration/tasks/*`        | \*   | 协作任务 API     |
| `/api/collaboration/teams/*`        | \*   | 团队管理 API     |
| `/api/collaboration/bot-identity/*` | \*   | Bot 身份 API     |

---

## 智能体容器化

### 容器架构

每个智能体在独立的 Linux 容器中运行，完全隔离：

```
┌─────────────────────────────────────────────────────────────────┐
│                      智能体容器架构                                │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Host (主进程)                             │  │
│  │                                                             │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │            Container Runner                          │   │  │
│  │  │  - Spawns containers                                 │   │  │
│  │  │  - Manages mounts                                    │   │  │
│  │  │  - Handles IPC                                       │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           │                                      │
│         ┌─────────────────┼─────────────────┐                  │
│         ▼                 ▼                 ▼                  │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐            │
│  │ Container │      │ Container │      │ Container │  ...      │
│  │ Agent 1  │      │ Agent 2  │      │ Agent 3  │            │
│  │          │      │          │      │          │            │
│  │  ┌────┐  │      │  ┌────┐  │      │  ┌────┐  │            │
│  │  │Cla │  │      │  │Cla │  │      │  │Cla │  │            │
│  │  │ude │  │      │  │ude │  │      │  │ude │  │            │
│  │  │Agent│  │      │  │Agent│  │      │  │Agent│  │            │
│  │  │ SDK │  │      │  │ SDK │  │      │  │ SDK │  │            │
│  │  └────┘  │      │  └────┘  │      │  └────┘  │            │
│  │          │      │          │      │          │            │
│  │  ┌─────┐ │      │  ┌─────┐ │      │  ┌─────┐ │            │
│  │  │IPC  │ │      │  │IPC  │ │      │  │IPC  │ │            │
│  │  │FS   │ │      │  │FS   │ │      │  │FS   │ │            │
│  │  └─────┘ │      │  └─────┘ │      │  └─────┘ │            │
│  └──────────┘      └──────────┘      └──────────┘            │
│         │                 │                 │                  │
│  ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐       │
│  │ groups/andy/│   │ groups/beth/│   │ groups/chad/│       │
│  │  - CLAUDE.md│   │  - CLAUDE.md│   │  - CLAUDE.md│       │
│  │  - .claude/ │   │  - .claude/ │   │  - .claude/ │       │
│  │  - files/   │   │  - files/   │   │  - files/   │       │
│  └─────────────┘   └─────────────┘   └─────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 容器隔离特性

| 隔离层面     | 说明                                      |
| ------------ | ----------------------------------------- |
| **文件系统** | 每个 Agent 有独立的 `groups/{name}/` 目录 |
| **进程**     | 独立的容器进程，PID 命名空间隔离          |
| **网络**     | 可选的网络隔离（默认允许出站）            |
| **IPC**      | 基于文件系统的 IPC，独立命名空间          |
| **记忆**     | 独立的记忆数据库和向量索引                |
| **配置**     | 独立的 Anthropic API 配置                 |

### 容器挂载

```typescript
interface ContainerConfig {
  additionalMounts?: Array<{
    hostPath: string;
    containerPath?: string;
    readonly?: boolean;
  }>;
  timeout?: number;
  networkMode?: 'bridge' | 'none';
  allowHostGateway?: boolean;
}
```

**默认挂载**:

- `groups/{name}/` → `/home/claude/` (读写)
- `container/` → `/opt/nanoclaw/` (只读)
- 临时目录 → `/tmp/` (读写)

**网络策略**:

- 默认 `networkMode=bridge`，保持兼容
- 可按组或全局设置 `networkMode=none` 完全禁网
- Linux 且非禁网时，可通过 `allowHostGateway=true` 注入 `host.docker.internal:host-gateway`

### 容器生命周期

1. **创建**: 消息到达时创建容器
2. **初始化**: 加载记忆、配置、工具
3. **执行**: 处理消息，调用工具
4. **关闭**: 结果返回后关闭容器
5. **缓存**: 短时间内复用容器（可配置）

---

## 安全系统

### 安全架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        安全防护层                                  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  输入验证层                                                 │  │
│  │  - Prompt Injection 检测                                   │  │
│  │  - 敏感数据扫描                                             │  │
│  │  - 内容安全检查                                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           │                                       │
│  ┌────────────────────────▼──────────────────────────────────┐  │
│  │  操作安全层                                                 │  │
│  │  - 危险操作检查                                             │  │
│  │  - 操作快照记录                                             │  │
│  │  - 回滚机制                                                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           │                                       │
│  ┌────────────────────────▼──────────────────────────────────┐  │
│  │  密钥安全层                                                 │  │
│  │  - 系统 Keychain 加密存储                                  │  │
│  │  - AES-256-GCM 加密文件 fallback                          │  │
│  │  - 凭证访问审计                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           │                                       │
│  ┌────────────────────────▼──────────────────────────────────┐  │
│  │  容器安全层                                                 │  │
│  │  - 文件系统隔离                                             │  │
│  │  - 挂载白名单                                               │  │
│  │  - 非 Main 组只读限制                                       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           │                                       │
│  ┌────────────────────────▼──────────────────────────────────┐  │
│  │  技能安全层                                                 │  │
│  │  - 技能签名验证                                             │  │
│  │  - 技能权限检查                                             │  │
│  │  - 技能执行审计                                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           │                                       │
│  ┌────────────────────────▼──────────────────────────────────┐  │
│  │  安全告警和审计                                             │  │
│  │  - 安全事件日志                                             │  │
│  │  - 实时告警                                                 │  │
│  │  - 审计追踪                                                 │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 安全事件类型

```typescript
type SecurityEventType =
  | 'prompt_injection' // Prompt 注入攻击
  | 'sensitive_data_leak' // 敏感数据泄露
  | 'dangerous_operation' // 危险操作
  | 'unauthorized_access' // 未授权访问
  | 'skill_verification_failed' // 技能验证失败
  | 'rate_limit_exceeded' // 速率限制超限
  | 'credential_scan' // 凭证扫描
  | 'network_security' // 网络安全
  | 'vulnerability_detected'; // 漏洞检测
```

### 安全特性详解

#### 1. 密钥管理 (Keystore)

```typescript
// 加密存储敏感凭证
- 系统 Keychain (keytar) - 优先
- AES-256-GCM 加密文件 - Fallback
- 需要 NANOCLAW_ENCRYPTION_KEY 环境变量
```

**审计日志**:

```typescript
interface CredentialAccessAuditLog {
  id: number;
  credentialType: string;
  agentId?: string;
  accessedAt: string;
  accessedBy: string;
  operation: 'read' | 'write' | 'delete';
  success: boolean;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}
```

#### 2. 挂载安全

```typescript
interface MountAllowlist {
  allowedRoots: Array<{
    path: string;
    allowReadWrite: boolean;
    description?: string;
  }>;
  blockedPatterns: string[];
  nonMainReadOnly: boolean; // 非 Main 组默认只读
}
```

#### 3. 操作快照和回滚

```typescript
interface OperationSnapshot {
  id: number;
  operationId: string;
  operationType: string;
  groupFolder?: string;
  chatJid?: string;
  beforeState: string; // JSON 序列化的状态
  afterState?: string;
  timestamp: string;
  status: 'pending' | 'applied' | 'rolled_back';
  description?: string;
}
```

#### 4. 秘密扫描

自动检测代码和消息中的敏感数据：

- API 密钥
- 密码
- 私钥
- 令牌
- 个人身份信息 (PII)

#### 5. 速率限制

防止滥用：

```typescript
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
}
```

### 安全配置

所有安全功能可配置：

```typescript
const SECURITY_CONFIG = {
  promptInjection: {
    enabled: true,
    severity: 'high',
  },
  secretScanning: {
    enabled: true,
    scanOnMessage: true,
    scanOnCode: true,
  },
  mountSecurity: {
    enabled: true,
    nonMainReadOnly: true,
  },
  operationSnapshot: {
    enabled: true,
    retentionDays: 30,
  },
  rateLimiting: {
    enabled: true,
    defaultWindowMs: 60000,
    defaultMaxRequests: 100,
  },
};
```

---

## 部署架构

### 进程架构

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 服务管理层                                                                    │
│ - macOS: launchd                                                              │
│ - Linux: systemd-user / systemd-system                                        │
│ - 无 systemd（WSL/精简 Linux）: nohup wrapper fallback                        │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Node.js 主进程                                                                │
│ - Bootstrap 初始化 DDD contexts                                                │
│ - Runtime API（默认 3456，端口冲突自动探测后续可用端口）                      │
│ - Security Application Service 统一鉴权、限流、参数校验                        │
└───────────────┬──────────────────────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 容器层                                                                         │
│ - 每个 Agent 独立容器与挂载策略校验                                            │
│ - Docker 默认网络模式 bridge，可配置 none                                      │
└───────────────┬──────────────────────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 数据层                                                                         │
│ - SQLite: store/messages.db                                                    │
│ - groups/* 与 .trae/* 持久化认知、会话、技能                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 目录结构

```text
nanoclaw/
├── src/
│   ├── app/bootstrap/                  # 启动编排
│   ├── shared/{kernel,config}/         # 共享内核与配置
│   ├── platform/{persistence,integration}/
│   ├── contexts/
│   │   ├── messaging/{domain,application,interfaces,infrastructure}
│   │   ├── runtime/{domain,application,interfaces,infrastructure}
│   │   ├── memory/{domain,application,interfaces,infrastructure}
│   │   ├── evolution/{domain,application,interfaces,infrastructure}
│   │   └── security/{domain,application,interfaces,infrastructure}
│   ├── index.ts                         # 主入口
│   ├── db.ts                            # 数据库兼容入口
│   ├── logger.ts                        # 兼容 facade
│   ├── config.ts                        # 兼容 facade
│   └── ...
├── store/messages.db                    # SQLite 主库
├── groups/                              # 组目录与 Agent 认知
├── container/                           # 容器镜像与内置 skills
├── docs/                                # 架构、约束、OpenAPI
└── ...
```

### 环境变量

| 变量                      | 说明                                  | 必填 |
| ------------------------- | ------------------------------------- | ---- |
| `ANTHROPIC_AUTH_TOKEN`    | Anthropic API Token                   | 是   |
| `ANTHROPIC_BASE_URL`      | Anthropic API URL (可选代理)          | 否   |
| `NANOCLAW_ENCRYPTION_KEY` | 加密密钥 (32字节 hex)                 | 是   |
| `RUNTIME_API_KEY`         | 运行时 API 密钥（请求头 `X-API-Key`） | 是   |
| `RUNTIME_API_ALLOW_NO_AUTH` | 允许开发态无密钥访问 Runtime API       | 否   |
| `RUNTIME_API_TRUST_PROXY` | Runtime API 是否信任代理头             | 否   |
| `CONTAINER_NETWORK_MODE`  | 容器网络模式（bridge/none）            | 否   |
| `CONTAINER_ALLOW_HOST_GATEWAY` | 是否允许 host-gateway 映射        | 否   |
| `ASSISTANT_NAME`          | 触发词 (默认: @Andy)                  | 否   |
| `TIMEZONE`                | 时区 (默认: Asia/Shanghai)            | 否   |
| `NODE_ENV`                | 环境 (development/production)         | 否   |

### 服务管理

#### macOS (launchd)

```bash
# 加载服务
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist

# 卸载服务
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist

# 重启服务
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

#### Linux (systemd)

```bash
# 启动服务
systemctl --user start nanoclaw

# 停止服务
systemctl --user stop nanoclaw

# 重启服务
systemctl --user restart nanoclaw

# 查看状态
systemctl --user status nanoclaw
```

#### Linux / WSL（无 systemd）

```bash
# setup 会自动生成 start-nanoclaw.sh
bash ./start-nanoclaw.sh

# 停止
kill $(cat ./nanoclaw.pid)
```

运行时会优先探测 systemd（root 为 system-level，普通用户为 user-level）；若 user session 不可用或宿主缺失 systemd，则自动回退 nohup 模式。

### 运行环境说明

- **目标运行环境**: mac mini M1（16G 内存 + 1T 存储）
- **当前开发环境**: Windows（跨平台开发）
- **建议实践**:
  - 在 Windows 完成功能开发、单元测试和文档更新
  - 在 macOS 目标机执行容器、通道鉴权与端到端回归
  - 所有发布前验证以目标机（Apple Silicon）结果为准

---

## 工程质量与 CI

### CI 流程

- 主流程：安装依赖、Node 版本守卫、格式检查、类型检查、测试
- 镜像流程：`ci` 通过后自动构建并推送 Docker 镜像到 GHCR
- 触发条件：`pull_request(main)`、`push(main)`、`push(tag v*)`

### 镜像发布策略

- 镜像构建上下文：`container/`
- 自动标签：分支标签、语义化版本标签、commit sha
- 发布位置：`ghcr.io/<owner>/<repo>/agent`

---

## DDD 结构索引

### DDD 迁移执行状态（对齐 DDD_MIGRATION_PLAN）

| 阶段 | 状态 | 架构影响摘要 |
| --- | --- | --- |
| Phase 0 | 已完成 | 建立分层与跨 context 依赖门禁，接入 ddd-baseline 回归集 |
| Phase 1 | 已完成 | shared/platform 归位，旧入口通过 facade 保持兼容 |
| Phase 2-6 | 已完成 | messaging/runtime/memory/evolution/security 五大 context 分层落位 |
| Phase 7 | 已完成 | runtime-api-parsers、ipc、evolution 仓储与服务拆分去耦 |
| Phase 8 | 已完成 | 清理大量过渡 facade，CI 增加 `lint:ddd-deps` 门禁 |
| Phase 9 | 部分完成 | 已完成 memory/messaging/runtime 领域行为下沉；learning/evolution/Bootstrap/协作跨层治理仍待完成 |

### Context 索引

| Context | 目录 | 关键职责 |
| --- | --- | --- |
| runtime | `src/contexts/runtime/` | Runtime API 编排、容器运行时接线 |
| security | `src/contexts/security/` | 鉴权、限流、输入校验、命令与挂载安全 |
| memory | `src/contexts/memory/` | 记忆检索、迁移、发布控制、观测指标 |
| evolution | `src/contexts/evolution/` | Gene 生命周期、审核链路、治理指标 |
| messaging | `src/contexts/messaging/` | 消息路由、消息流水线、状态恢复 |

### DDD 治理文档

- `docs/DDD_CONTEXT_MAP.md`
- `docs/DDD_DEPENDENCY_GRAPH.md`
- `docs/DDD_CONSTRAINTS.md`
- `docs/DDD_MODULE_TEMPLATE.md`
- `docs/DDD_REVIEW_CHECKLIST.md`

---

## 附录

### 协议标准

- **GEP 1.5.0**: Genome Evolution Protocol
- **GEPAsset**: 基础资产接口
- **GEPGene**: 基因结构
- **GEPCapsule**: 胶囊结构
- **GDIScore**: 全球期望指数

### 相关文档

- [README.md](../README.md) - 项目说明
- [docs/REQUIREMENTS.md](REQUIREMENTS.md) - 需求文档
- [docs/AGENT_ARCHITECTURE.md](AGENT_ARCHITECTURE.md) - 智能体架构
- [docs/SECURITY.md](SECURITY.md) - 安全文档
- [docs/RUNTIME_API.md](RUNTIME_API.md) - 运行时 API 文档

---

## 架构版本历史

| 文档版本 | 日期 | 变更摘要 |
| --- | --- | --- |
| 1.5.0 | 2026-03-18 | 对齐 DDD_MIGRATION_PLAN（Phase0-9）：更新 DDD 分层主架构图、模块职责、API 契约、部署拓扑、技术栈与目录结构，补充迁移执行状态。 |
| 1.4.0 | 2026-03-17 | 纳入 DDD 结构索引与治理文档入口。 |

---

**文档版本**: 1.5.0
**最后更新**: 2026-03-18 10:30
**维护者**: NanoClaw Team
