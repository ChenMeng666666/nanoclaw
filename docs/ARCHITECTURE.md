# NanoClaw 完整架构文档

> 最后更新: 2026-03-15 12:00

## 目录

- [项目概述](#项目概述)
- [架构升维路线-v2](#架构升维路线-v2)
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

| 组件     | 技术                                                   |
| -------- | ------------------------------------------------------ |
| 运行时   | Node.js 20+                                            |
| 容器     | Docker (跨平台) / Apple Container (macOS 原生)         |
| 数据库   | SQLite (better-sqlite3)                                |
| 向量嵌入 | @xenova/transformers + all-MiniLM-L6-v2                |
| 定时任务 | node-cron                                              |
| 密钥存储 | keytar (系统 keychain) + AES-256-GCM 加密文件 fallback |
| 协议标准 | GEP 1.5.0 (Genome Evolution Protocol)                  |

---

## 架构升维路线 V2

为支撑“学习体系 + 进化体系 + 记忆体系”的下一阶段迭代，当前架构增加 V2 升维蓝图，强调从能力点增强升级为系统级闭环。

### V2 架构目标

1. **认知连续性**：跨通道、跨会话、跨模态统一身份与记忆语义  
2. **进化闭环性**：从内部协作评审到主控反哺形成自动晋升回路  
3. **运行实时性**：高频协作下通过热池与分级隔离保障低延迟  
4. **系统韧性**：断网可降级、多端可同步、安全可熔断

### 六大升维方向

| 维度 | 核心升级 | 主锚点组件 |
| --- | --- | --- |
| 1. Memory, Context & Identity | 身份解析 + 动态上下文压缩 + GraphRAG + 多模态记忆 | `cognition-manager` `context-engine` `db` |
| 2. Private Moltbook | 局域智能体社会、黑板模式、同行评审信号 | `db` `task-scheduler` `runtime-api` |
| 3. Upward Knowledge Flow | Capsule 高分成果反哺主控技能资产 | `main-evolution-applier` `evolution-manager` |
| 4. Runtime & Concurrency | Warm Container Pooling + 分级隔离执行面 | `group-queue` `container-runner` |
| 5. Edge & Sync | CRDT 多端同步 + Local LLM Fallback | `agent-router` `store` |
| 6. WebUI & Security | Observer 控制台 + 多模态注入防线 + 硬件级密钥隔离 | `index` `keystore` `security` |

### V2 执行分期

- **Phase 0 (P0)**: 护栏与观测基线（灰度、影子、熔断、回滚）  
- **Phase 1 (P0/P1)**: 记忆引擎升维与上下文压缩  
- **Phase 2 (P1)**: Private Moltbook 与闲时协作机制  
- **Phase 3 (P1)**: 向上知识反哺与 Shadow Promote  
- **Phase 4 (P0/P1)**: 热池化与并发执行模型重构  
- **Phase 5 (P2)**: 离线降级与多端一致性同步  
- **Phase 6 (P1/P2)**: Observer WebUI 与安全纵深

### 版本化文档关联

- V2 详细任务清单、优先级与复选跟踪见 `docs/ROADMAP_V2.md`  
- 现有架构文档保留“当前态”，V2 章节承担“目标态与迁移路径”定义  
- 后续每个 Phase 完成后，同步更新本节与对应 ADR/运行手册

---

## 核心架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                    消息通道层（Skill 按需安装）                     │
│  ┌──────────┐  ┌──────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Telegram │  │ WhatsApp │  │  Slack  │  │  Gmail  │  ...    │
│  └────┬─────┘  └────┬─────┘  └────┬────┘  └────┬────┘        │
└───────┼──────────────┼─────────────┼─────────────┼─────────────┘
        │              │             │             │
        └──────────────┴─────────────┴─────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      主进程 (Node.js)                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  消息路由 & 调度层                                          │  │
│  │  ┌──────────────┐  ┌──────────────────┐  ┌─────────────┐│  │
│  │  │ Agent Router │  │  Task Scheduler  │  │  Group Queue││  │
│  │  └──────┬───────┘  └────────┬─────────┘  └──────┬──────┘│  │
│  └─────────┼────────────────────┼─────────────────────┼─────────┘  │
│  ┌─────────┼────────────────────┼─────────────────────┼─────────┐  │
│  │  ┌──────▼───────┐  ┌────────▼────────┐  ┌───────▼──────┐  │  │
│  │  │  数据库层    │  │  运行时 API     │  │  IPC 监视     │  │  │
│  │  │  (SQLite)    │  │  (HTTP Server)  │  │  (File Watch) │  │  │
│  │  └──────┬───────┘  └────────┬────────┘  └───────┬──────┘  │  │
│  └─────────┼────────────────────┼─────────────────────┼─────────┘  │
└────────────┼────────────────────┼─────────────────────┼─────────────┘
             │                    │                     │
             └────────────────────┴─────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                        容器隔离层                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  每个 Agent 一个独立容器 (Linux VM)                         │  │
│  │                                                             │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │  Agent 1     │  │  Agent 2     │  │  Agent 3     │   │  │
│  │  │  (container) │  │  (container) │  │  (container) │  │  │
│  │  │              │  │              │  │              │   │  │
│  │  │  ┌────────┐  │  │  ┌────────┐  │  │  ┌────────┐ │   │  │
│  │  │  │Claude  │  │  │  │Claude  │  │  │  │Claude  │ │   │  │
│  │  │  │Agent   │  │  │  │Agent   │  │  │  │Agent   │ │   │  │
│  │  │  │SDK     │  │  │  │SDK     │  │  │  │SDK     │ │   │  │
│  │  │  └────────┘  │  │  └────────┘  │  │  └────────┘ │   │  │
│  │  │              │  │              │  │              │   │  │
│  │  │  隔离文件系统 │  │  隔离文件系统 │  │  隔离文件系统 │   │  │
│  │  │  groups/andy/│  │  groups/beth/│  │  groups/chad/│   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 核心模块说明

| 模块       | 文件                                        | 职责                           |
| ---------- | ------------------------------------------- | ------------------------------ |
| 主调度器   | `src/index.ts`                              | 状态管理、消息循环、Agent 调用 |
| 通道注册表 | `src/channels/registry.ts`                  | 通道自注册（启动时）           |
| IPC 处理   | `src/ipc.ts`                                | IPC 监视器和任务处理           |
| 消息路由   | `src/router.ts`                             | 消息格式化和出站路由           |
| 智能体路由 | `src/agent-router.ts`                       | 根据消息 JID 路由到对应 Agent  |
| 容器运行器 | `src/container-runner.ts`                   | 生成流式 Agent 容器            |
| 任务调度器 | `src/task-scheduler.ts`                     | 运行定时任务                   |
| 协作调度器 | `src/collaboration-scheduler.ts`            | 协作任务调度和分配             |
| 团队管理   | `src/team-manager.ts`                       | 智能体团队管理                 |
| 智能体通信 | `src/agent-communication.ts`                | 智能体间消息传递               |
| 数据库     | `src/db.ts`, `src/db-agents.ts`             | SQLite 操作                    |
| 运行时 API | `src/runtime-api.ts`                        | HTTP API 供容器内 Agent 调用   |
| 记忆管理   | `src/memory-manager.ts`                     | 分层记忆系统                   |
| 上下文引擎 | `src/context-engine/default-engine.ts`      | 记忆组装、摄取与作用域检索     |
| 认知管理   | `src/cognition-manager.ts`                  | 认知文件生成                   |
| 反思调度   | `src/reflection-scheduler.ts`               | 定时反思调度                   |
| 进化管理   | `src/evolution-manager.ts`                  | 进化库管理                     |
| 密钥存储   | `src/keystore.ts`                           | 加密密钥管理                   |
| 安全系统   | `src/security.ts`, `src/security-alerts.ts` | 安全事件检测和处理             |

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
┌─────────────────────────────────────────────────────────────────┐
│                      部署架构                                      │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Systemd / Launchd                        │  │
│  │                    (服务管理器)                               │  │
│  └──────────────────────────────┬────────────────────────────┘  │
│                                 │                                 │
│                                 ▼                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  Node.js 主进程 (PID 1234)                 │  │
│  │                                                             │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │  Thread Pool (libuv)                                │   │  │
│  │  │  - I/O 操作                                          │   │  │
│  │  │  - 定时任务                                          │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  │                                                             │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │  │
│  │  │  Channels│ │ Scheduler│ │ Runtime  │ │   IPC    │   │  │
│  │  │  (事件)  │ │  (定时)  │ │  API     │ │ (Watcher) │   │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                 │                                 │
│         ┌───────────────────────┼───────────────────────┐        │
│         ▼                       ▼                       ▼        │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────┐│
│  │  Container  │         │  Container  │         │  Container  ││
│  │  Agent 1    │         │  Agent 2    │         │  Agent 3    ││
│  │  (PID 4567) │         │  (PID 5678) │         │  (PID 6789) ││
│  └─────────────┘         └─────────────┘         └─────────────┘│
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    数据存储                                  │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │  SQLite Database (nanoclaw.db)                     │   │  │
│  │  │  - 消息、记忆、进化库、任务                          │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  │                                                             │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │  文件系统                                            │   │  │
│  │  │  - groups/{name}/CLAUDE.md (每个组)                 │   │  │
│  │  │  - groups/CLAUDE.md (全局)                          │   │  │
│  │  │  - .claude/ / .trae/ (会话、缓存、技能)             │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 目录结构

```
nanoclaw/
├── src/                          # 源代码
│   ├── index.ts                  # 主入口
│   ├── channels/                 # 消息通道
│   ├── container-runner.ts       # 容器运行器
│   ├── db.ts                     # 数据库
│   ├── memory-manager.ts         # 记忆管理
│   ├── evolution-manager.ts      # 进化管理
│   ├── agent-router.ts           # 智能体路由
│   ├── team-manager.ts           # 团队管理
│   ├── collaboration-scheduler.ts # 协作调度
│   ├── agent-communication.ts    # 智能体通信
│   ├── runtime-api.ts            # 运行时 API
│   ├── security.ts               # 安全系统
│   └── ...
├── container/                    # 容器相关
│   ├── build.sh                  # 容器构建脚本
│   ├── Dockerfile                # Docker 镜像
│   └── skills/                   # 容器内可用技能
├── groups/                       # 组目录
│   ├── CLAUDE.md                 # 全局记忆
│   ├── andy/                     # Agent 1 目录
│   │   ├── CLAUDE.md             # Agent 1 认知
│   │   ├── .claude/              # Agent 1 会话
│   │   └── files/                # Agent 1 文件
│   ├── beth/                     # Agent 2 目录
│   └── ...
├── .claude/                      # Claude 兼容目录
│   ├── sessions/                 # 会话
│   ├── cache/                    # 缓存
│   └── skills/                   # 技能
├── .trae/                        # Trae 主目录（技能、会话、缓存）
│   └── skills/
├── nanoclaw.db                   # SQLite 数据库
├── .env                          # 环境变量
├── package.json                  # 依赖
└── ...
```

### 环境变量

| 变量                      | 说明                                  | 必填 |
| ------------------------- | ------------------------------------- | ---- |
| `ANTHROPIC_AUTH_TOKEN`    | Anthropic API Token                   | 是   |
| `ANTHROPIC_BASE_URL`      | Anthropic API URL (可选代理)          | 否   |
| `NANOCLAW_ENCRYPTION_KEY` | 加密密钥 (32字节 hex)                 | 是   |
| `RUNTIME_API_KEY`         | 运行时 API 密钥（请求头 `X-API-Key`） | 是   |
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

## 关键文件索引

### 核心文件

| 文件               | 行数  | 功能               |
| ------------------ | ----- | ------------------ |
| `src/index.ts`     | ~500  | 主调度器、消息循环 |
| `src/types.ts`     | ~800  | 类型定义           |
| `src/config.ts`    | ~200  | 配置管理           |
| `src/db.ts`        | ~1500 | 数据库操作         |
| `src/db-agents.ts` | ~650  | 智能体数据库操作   |

### 智能体系统

| 文件                          | 行数 | 功能                 |
| ----------------------------- | ---- | -------------------- |
| `src/agent-router.ts`         | ~190 | 智能体路由           |
| `src/memory-manager.ts`       | ~320 | 分层记忆系统         |
| `src/cognition-manager.ts`    | ~100 | 认知文件生成         |
| `src/reflection-scheduler.ts` | ~330 | 反思调度器           |
| `src/evolution-manager.ts`    | ~500 | 进化系统 (GEP 1.5.0) |
| `src/keystore.ts`             | ~220 | 密钥管理             |

### 多智能体协作

| 文件                             | 行数 | 功能         |
| -------------------------------- | ---- | ------------ |
| `src/agent-communication.ts`     | ~200 | 智能体间通信 |
| `src/team-manager.ts`            | ~310 | 团队管理     |
| `src/collaboration-scheduler.ts` | ~280 | 协作任务调度 |

### 容器和运行时

| 文件                       | 行数 | 功能            |
| -------------------------- | ---- | --------------- |
| `src/container-runner.ts`  | ~800 | 容器运行器      |
| `src/container-runtime.ts` | ~400 | 容器运行时      |
| `src/ipc.ts`               | ~600 | IPC 处理        |
| `src/runtime-api.ts`       | ~800 | 运行时 HTTP API |

### 消息和调度

| 文件                       | 行数 | 功能          |
| -------------------------- | ---- | ------------- |
| `src/channels/registry.ts` | ~150 | 通道注册表    |
| `src/channels/telegram.ts` | ~600 | Telegram 通道 |
| `src/router.ts`            | ~300 | 消息路由      |
| `src/group-queue.ts`       | ~200 | 组队列        |
| `src/task-scheduler.ts`    | ~360 | 任务调度器    |

### 安全系统

| 文件                     | 行数 | 功能     |
| ------------------------ | ---- | -------- |
| `src/security.ts`        | ~300 | 安全核心 |
| `src/security-alerts.ts` | ~200 | 安全告警 |
| `src/secret-scanner.ts`  | ~200 | 秘密扫描 |
| `src/skill-verifier.ts`  | ~150 | 技能验证 |
| `src/keystore-audit.ts`  | ~150 | 密钥审计 |
| `src/mount-security.ts`  | ~150 | 挂载安全 |

### 总计

- **TypeScript 代码**: 约 15,000 行
- **核心模块**: 30+ 个
- **数据库表**: 20+ 个

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

**文档版本**: 1.3.0
**最后更新**: 2026-03-15 12:00
**维护者**: NanoClaw Team
