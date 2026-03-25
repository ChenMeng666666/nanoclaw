# 阶段 1：Agent 独立运行单元 - 设计文档

**日期**：2026-03-25
**阶段**：阶段 1（Agent 独立运行单元）
**方案**：B（部分集成，渐进式重构）

---

## 1. 概述

### 1.1 与 ARCHITECTURE.md 的对应关系

本设计文档直接对应 `ARCHITECTURE.md` 的第 12 节（阶段 1 入口），实现了以下目标：

| ARCHITECTURE.md 第 12 节要求 | 本设计文档的对应章节 |
|------------------------------|---------------------|
| 身份模型（agent 身份边界清晰） | 第 2 节（身份模型设计） |
| 配置模型（agent 配置与 group 上下文解耦） | 第 3 节（配置模型设计） |
| 运行模型（agent 拥有独立运行容器与独立模型配置能力） | 第 4 节（运行模型设计） |
| 后续记忆、进化、社会能力都能绑定到明确 agent | 第 8 节（预期结果）、第 10 节（后续阶段展望） |

### 1.2 设计目标

根据 `ARCHITECTURE.md`，阶段 1 的目标是把 "agent 作为独立主体" 正式立住。具体包括：

- **身份模型**：建立 agent 作为最小能力主体的身份边界
- **配置模型**：agent 配置与 group 上下文解耦
- **运行模型**：agent 拥有独立运行容器与独立模型配置能力

### 1.2 设计原则

1. **非侵入式扩展**：不直接重写或大面积修改上游核心代码，新增功能放在 `src/custom/` 目录
   - 对核心文件的修改必须使用 `// [CUSTOM: <模块功能>] 开始` 与 `// [CUSTOM] 结束` 注释包裹
   - 新增代码优先通过中间件、钩子或事件监听模式接入
2. **渐进式重构**：保留现有功能兼容，不破坏用户使用习惯
3. **安全优先**：遵循 CLAUDE.md 的安全准则，agent 无法接触到真实 API 密钥
4. **主体优先**：agent 是最小能力主体，所有记忆、任务、经验都能追溯到明确 agent

### 1.3 阶段范围边界

**阶段 1 仅包含**：
- agent 身份模型（数据库表、基础属性）
- agent 配置模型（模型、容器配置）
- 容器运行逻辑改造（接受 agent 参数）
- 消息路由改造（使用 agent 配置）

**阶段 1 不包含（后续阶段实现）**：
- 容灾机制（fallback_config）
- agent 与 channel 绑定
- 复杂的 agent 身份配置（appearance、quotes 等）
- `/setup-agent` skill

---

## 2. 身份模型设计

### 2.1 数据表结构

**新增 `agents` 表**：

```sql
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  description TEXT,
  system_prompt TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**字段说明**：
- `id`：agent 唯一标识符（UUID）
- `name`：显示名称（如 "Mimi"）
- `role`：角色定位（如 "首席决策辅助 / 团队大姐大"）
- `type`：类型，`system`（内置）或 `user`（用户创建）
- `status`：状态，`active`、`paused`、`archived`
- `description`：简短描述

**新增 `agent_group_associations` 表**：

```sql
CREATE TABLE IF NOT EXISTS agent_group_associations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  group_folder TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (group_folder) REFERENCES registered_groups(folder)
);
```

**字段说明**：
- `agent_id`：关联的 agent ID
- `group_folder`：关联的 group 文件夹
- `is_primary`：是否是该 group 的默认 agent

### 2.2 Agent 工作区结构

每个 agent 有独立的工作区，完全隔离：

```
data/agents/
├── <agent-id>/
│   ├── identity.json          # 身份信息（基础）
│   ├── config.json            # 模型和运行配置
│   ├── workspace/             # agent 专属工作区
│   │   ├── files/             # 文件操作目录
│   │   └── temp/              # 临时文件
│   └── logs/                  # 容器日志
```

**identity.json 示例（阶段 1 简化版）**：

```json
{
  "name": "Mimi",
  "role": "首席决策辅助 / 团队大姐大",
  "system_prompt": "你是米米（Mimi），我的精神领袖与决策后盾..."
}
```

---

## 3. 配置模型设计

### 3.1 config.json 结构

```json
{
  "model_config": {
    "model": "claude-3-sonnet-20250219",
    "base_url": "https://api.anthropic.com",
    "auth_mode": "proxy"
  },
  "runtime_config": {
    "container_timeout": 1800000,
    "memory_limit": "4g",
    "mount_strategy": "group_inherit",
    "additional_mounts": []
  }
}
```

### 3.2 配置说明

**model_config**：
- `model`：模型名称（必填），默认值：`claude-3-sonnet-20250219`
- `base_url`：API 端点（必填），默认值：`https://api.anthropic.com`
- `auth_mode`：认证模式（必填），默认值：`proxy`
  - `proxy`：使用凭证代理（agent 无法接触真实密钥）
  - `direct`：直接模式（仅用于特定场景）

**runtime_config**：
- `container_timeout`：容器超时时间（毫秒），默认值：`1800000`（30 分钟）
- `memory_limit`：内存限制，默认值：`4g`
- `mount_strategy`：挂载策略，默认值：`group_inherit`
  - `group_inherit`：继承自 group 的挂载配置
  - `custom`：使用 agent 的自定义挂载配置
- `additional_mounts`：额外挂载列表，默认值：`[]`

### 3.3 与现有 group 配置的关系

- 保留现有 `registered_groups` 表的 `container_config` 属性（兼容）
- 当 agent 配置与 group 配置冲突时，优先使用 agent 配置
- 支持 `group_inherit` 策略，简化配置管理

---

## 4. 运行模型设计

### 4.1 容器与 Agent 的关系

**一个容器就是一个 agent**，工作区完全隔离：
- 容器挂载 `data/agents/<id>/workspace` 到 `/workspace`
- 容器无法访问其他 agent 的工作区
- group 的共享资源需要明确授权后才能访问
- 会话状态与 agent 绑定，而非 group

### 4.2 容器运行逻辑改造

**对 `src/container-runner.ts` 的修改方式**：
- 使用 `// [CUSTOM: agent-support] 开始` 和 `// [CUSTOM] 结束` 包裹所有修改
- 通过新增函数和中间件模式接入，不修改现有核心逻辑

```typescript
// [CUSTOM: agent-support] 开始

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  agentId?: string;
  agentConfig?: AgentConfig;
}

/**
 * 获取 agent 配置（新增函数）
 */
async function getAgentConfig(agentId?: string, groupFolder?: string): Promise<AgentConfig> {
  // 实现逻辑...
}

/**
 * 使用 agent 配置构建容器选项（新增函数）
 */
function buildContainerOptionsForAgent(
  input: ContainerInput,
  config: AgentConfig
): ContainerOptions {
  // 实现逻辑...
}

// [CUSTOM] 结束

async function runContainerAgent(input: ContainerInput) {
  // [CUSTOM: agent-support] 开始
  let config: AgentConfig | null = null;
  if (input.agentId || input.agentConfig) {
    config = input.agentConfig || await getAgentConfig(input.agentId, input.groupFolder);
  }
  // [CUSTOM] 结束

  // 现有代码...

  // [CUSTOM: agent-support] 开始
  const containerOptions = config
    ? buildContainerOptionsForAgent(input, config)
    : buildContainerOptions(input);
  // [CUSTOM] 结束

  return await executeContainer(input, containerOptions);
}
```

### 4.3 消息路由改造

**对 `src/index.ts` 的修改方式**：
- 使用 `// [CUSTOM: agent-support] 开始` 和 `// [CUSTOM] 结束` 包裹所有修改
- 通过新增函数和中间件模式接入，不修改现有核心逻辑

```typescript
// [CUSTOM: agent-support] 开始

/**
 * 获取 group 的默认 agent（新增函数）
 */
async function getPrimaryAgentByGroup(groupFolder: string): Promise<Agent | null> {
  // 实现逻辑...
}

/**
 * 使用 agent 上下文格式化 prompt（新增函数）
 */
function formatPromptWithAgentContext(
  messages: Message[],
  agent: Agent | null
): string {
  // 实现逻辑...
}

// [CUSTOM] 结束

async function processGroupMessages(groupFolder: string) {
  // 现有代码...

  // [CUSTOM: agent-support] 开始
  const primaryAgent = await getPrimaryAgentByGroup(groupFolder);
  const formattedPrompt = formatPromptWithAgentContext(messages, primaryAgent);
  // [CUSTOM] 结束

  // [CUSTOM: agent-support] 开始
  const response = await runContainerAgent({
    prompt: formattedPrompt,
    groupFolder,
    chatJid,
    isMain,
    agentId: primaryAgent?.id,
    agentConfig: primaryAgent?.config
  });
  // [CUSTOM] 结束

  // 现有代码...
}
```

### 4.4 边界条件处理

**默认 agent 创建策略**：
- 首次使用现有 group 时，自动创建一个默认 agent（`type: 'user'`）
- 默认 agent 的名称与 group 名称一致，角色为 "默认协作助手"
- 提供批量数据迁移脚本，可在阶段 1 完成后统一执行

**agent 不存在时的 fallback 机制**：
- 当指定的 agent 不存在或配置无效时，回退到现有 group 配置
- 记录警告日志，但不阻塞消息处理
- 提供 `/migrate-to-agent` 命令将现有 group 迁移为 agent

**agent 配置变更时的策略**：
- agent 配置变更后，下一次容器运行时自动使用新配置
- 正在运行的容器继续使用旧配置，直到完成
- 提供 `/reload-agent-config` 命令强制重载配置

**agent 工作区管理**：
- agent 创建时自动初始化工作区目录
- agent 归档时保留工作区（作为历史记录）
- agent 删除时提示确认，工作区可选保留或删除

**数据目录规范**：
- `data/agents/` 目录已包含在项目的 `.gitignore` 文件中（符合 CLAUDE.md 数据隔离原则）
- 每个 agent 的数据和工作区完全隔离，不进入版本控制

---

## 5. API 接口设计

### 5.1 Agent 管理 API

```typescript
interface CreateAgentInput {
  name: string;
  role: string;
  type?: 'system' | 'user';
  identity: Partial<AgentIdentity>;
  config: Partial<AgentConfig>;
}

interface ListAgentsInput {
  status?: 'active' | 'paused' | 'archived';
  type?: 'system' | 'user';
}

interface UpdateAgentInput {
  agentId: string;
  updates: Partial<CreateAgentInput>;
}

interface DeleteAgentInput {
  agentId: string;
  keepWorkspace?: boolean;
}

interface RunAgentInput {
  agentId: string;
  prompt: string;
  contextMode?: 'isolated' | 'group';
}
```

### 5.2 IPC 接口

```typescript
// Agent 管理
{ type: 'create_agent', payload: CreateAgentInput }
{ type: 'list_agents', payload: ListAgentsInput }
{ type: 'update_agent', payload: UpdateAgentInput }
{ type: 'delete_agent', payload: DeleteAgentInput }

// Agent 执行
{ type: 'run_agent', payload: RunAgentInput }

// 绑定管理
{ type: 'bind_agent_to_group', payload: { agentId, groupFolder, isPrimary } }
```

---

## 6. 实施步骤

### 阶段 1.1：基础架构（1-2 天）
1. 创建 `src/custom/` 目录
2. 创建 `src/custom/agent/types.ts`（类型定义）
3. 创建 `src/custom/agent/db.ts`（数据库操作）
4. 数据库迁移：新增 `agents`, `agent_group_associations` 表

### 阶段 1.2：配置管理（1 天）
1. 创建 `src/custom/agent/config.ts`（配置文件管理）
2. 实现 `data/agents/` 目录结构
3. 创建配置验证和合并逻辑

### 阶段 1.3：运行逻辑改造（2 天）
1. 改造 `src/container-runner.ts` 接受 agent 参数（使用 `// [CUSTOM]` 注释）
2. 改造 `src/index.ts` 的消息路由逻辑（使用 `// [CUSTOM]` 注释）
3. 测试容器运行和消息处理

### 阶段 1.4：API 接口（1 天）
1. 创建 `src/custom/agent/api.ts`（API 接口）
2. 创建 `src/custom/agent/ipc.ts`（IPC 接口）
3. 测试新增的 IPC 命令

### 阶段 1.5：兼容性维护（1 天）
1. 确保现有功能正常工作
2. 测试默认 agent 逻辑
3. 处理边界条件（如 agent 不存在时的 fallback）
4. 实现 agent 配置变更后的容器重建策略

---

## 7. 测试策略

### 单元测试
- `agent.types.test.ts`：类型验证
- `agent.db.test.ts`：数据库操作
- `agent.config.test.ts`：配置管理
- `agent.api.test.ts`：API 接口

### 集成测试
- `agent-integration.test.ts`：端到端测试
- 测试从消息接收 → agent 选择 → 响应发送的完整流程
- 测试边界条件（agent 不存在、配置无效等）

---

## 8. 预期结果

完成阶段 1 后：

✅ **agent 身份边界清晰**：每个 agent 有唯一身份和完整配置
✅ **配置与 group 解耦**：agent 配置独立于 group 上下文
✅ **独立运行容器**：每个 agent 可指定不同的容器配置
✅ **为阶段 2 奠定基础**：agent 抽象已建立，记忆系统可直接绑定
✅ **兼容性保留**：现有功能正常工作，用户无感知

**用户体验**：现有功能无感知，但可以通过 `/run_agent` 命令指定使用特定 agent，体验个性化的回复风格。

---

## 9. 决策记录

### 9.1 为什么选择方案 B（部分集成）而不是方案 C（完全替换）

| 维度 | 理由 |
|------|------|
| 风险控制 | 渐进式重构避免了大面积故障 |
| 价值平衡 | 获得 agent 抽象的核心价值，但保留现有功能稳定 |
| 技术债务 | 兼容性逻辑明确标注 `// [CUSTOM]` 标记，在阶段 2 记忆系统完成后清除 |
| 开发效率 | 代码复用更多，开发更快 |
| 与 upstream 同步 | 代码边界清晰，防冲突标记明确 |

**技术债务清除清单（阶段 2 后执行）**：

| 文件 | 位置 | 标记内容 | 说明 |
|------|------|----------|------|
| `src/container-runner.ts` | `// [CUSTOM: agent-support]` 开始 / 结束 | `agentId?` 和 `agentConfig?` 字段、`getAgentConfig()` 函数、`buildContainerOptionsForAgent()` 函数 | 重构为第一公民实现 |
| `src/index.ts` | `// [CUSTOM: agent-support]` 开始 / 结束 | `getPrimaryAgentByGroup()` 函数、`formatPromptWithAgentContext()` 函数 | 重构为第一公民实现 |
| `src/db.ts` | 待定 | `registered_groups` 表的 `container_config` 字段 | 迁移到 agent 配置 |

### 9.6 分层边界与 API 设计

**API 分层归属**：

| API | 分层 | 说明 |
|-----|------|------|
| `create_agent` | custom module | 在 `src/custom/agent/api.ts` 中实现 |
| `list_agents` | custom module | 在 `src/custom/agent/api.ts` 中实现 |
| `update_agent` | custom module | 在 `src/custom/agent/api.ts` 中实现 |
| `delete_agent` | custom module | 在 `src/custom/agent/api.ts` 中实现 |
| `run_agent` | custom module | 在 `src/custom/agent/api.ts` 中实现 |
| `bind_agent_to_group` | custom module | 在 `src/custom/agent/api.ts` 中实现 |
| `/setup-agent`（待定） | skill | 在阶段 1 完成后作为 skill 实现，用于用户友好的 agent 创建和配置 |

**核心原则**：
- 核心 API 放在 `src/custom/agent/` 目录（custom module 层）
- 用户友好的界面和命令作为 skill 实现（skill 层）
- core 层仅通过 `// [CUSTOM]` 标记进行最小化改造

### 9.2 为什么容器与 agent 一对一

符合 `ARCHITECTURE.md` 原则：
- agent 是最小能力主体
- container 是运行壳，不是主体
- agent 的工作区完全隔离，不能被其他 agent 访问

### 9.3 为什么模型配置简化

遵循极简主义原则：
- 现阶段只需要最基本的配置（model、base_url、auth_mode）
- 可以在后续阶段根据需求扩展

### 9.4 为什么某些功能移到后续阶段

严格控制阶段 1 范围：
- 避免功能过度膨胀
- 确保阶段 1 专注于核心目标（agent 独立运行单元）
- 减少风险，提高可执行性

---

## 10. 后续阶段展望

### 阶段 2：Agent 私有记忆系统
- 建立 agent 私有的记忆存储
- 支持记忆的读取、写入、检索
- 支持记忆的归档和摘要
- **清除阶段 1 的兼容性逻辑**

### 阶段 3：共同进化系统
- 支持多个 agent 协作
- 建立经验分享机制
- 支持知识的传递和继承
- **实现 agent 与 channel 绑定**

### 阶段 4：Private Moltbook
- 建立全局知识图谱
- 支持知识的可视化查询
- 建立知识反哺机制
- **实现容灾机制**

### 阶段 5：向上知识反哺
- 建立知识筛选和审核机制
- 支持知识上行到更高系统层
- 建立知识反哺的验证流程
