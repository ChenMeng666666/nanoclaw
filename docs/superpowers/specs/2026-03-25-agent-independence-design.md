# 阶段 1：Agent 独立运行单元 - 设计文档

**日期**：2026-03-25
**阶段**：阶段 1（Agent 独立运行单元）
**方案**：B（部分集成，渐进式重构）

---

## 1. 概述

### 1.1 设计目标

根据 `ARCHITECTURE.md`，阶段 1 的目标是把 "agent 作为独立主体" 正式立住。具体包括：

- **身份模型**：建立 agent 作为最小能力主体的身份边界
- **配置模型**：agent 配置与 group 上下文解耦
- **运行模型**：agent 拥有独立运行容器与独立模型配置能力

### 1.2 设计原则

1. **非侵入式扩展**：不直接重写或大面积修改上游核心代码，新增功能放在 `src/custom/` 目录
2. **渐进式重构**：保留现有功能兼容，不破坏用户使用习惯
3. **安全优先**：遵循 CLAUDE.md 的安全准则，agent 无法接触到真实 API 密钥
4. **主体优先**：agent 是最小能力主体，所有记忆、任务、经验都能追溯到明确 agent

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

**新增 `agent_channel_bindings` 表**：

```sql
CREATE TABLE IF NOT EXISTS agent_channel_bindings (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  settings TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);
```

**字段说明**：
- `agent_id`：关联的 agent ID
- `channel_name`：通道名称（如 "telegram"、"whatsapp"）
- `enabled`：是否启用
- `settings`：特定通道的配置（JSON 格式）

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
│   ├── identity.json          # 详细人设（JSON 格式）
│   ├── config.json            # 模型和运行配置
│   ├── workspace/             # agent 专属工作区
│   │   ├── files/             # 文件操作目录
│   │   └── temp/              # 临时文件
│   └── logs/                  # 容器日志
```

**identity.json 示例**：

```json
{
  "name": "Mimi",
  "role": "首席决策辅助 / 团队大姐大",
  "appearance": "极具视觉冲击力的极致沙漏身材...",
  "personality": "ENFJ，勇敢、睿智、热情...",
  "quotes": ["别怕，有米米在呢..."],
  "behavior_rules": ["绝对主见", "撕碎员工手册", "拒绝前摇"],
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
  "fallback_config": {
    "enabled": false,
    "strategy": "local",
    "local_config": {
      "provider": "ollama",
      "model": "llama3:8b"
    }
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
- `model`：模型名称（必填）
- `base_url`：API 端点（必填）
- `auth_mode`：认证模式，`proxy`（使用凭证代理）或 `direct`（直接模式）

**fallback_config**（可选，默认关闭）：
- `enabled`：是否启用容灾机制
- `strategy`：容灾策略，`local`（本地模型）或 `fallback_model`（备用模型）
- `local_config`：本地模型配置

**runtime_config**：
- `container_timeout`：容器超时时间（毫秒）
- `memory_limit`：内存限制
- `mount_strategy`：挂载策略，`group_inherit`（继承自 group）或 `custom`（自定义）
- `additional_mounts`：额外挂载列表

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

**src/container-runner.ts 改造**：

```typescript
interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  agentId?: string;
  agentConfig?: AgentConfig;
}

async function runContainerAgent(input: ContainerInput) {
  let config = getAgentConfig(input.agentId, input.groupFolder);

  const containerOptions = {
    env: {
      ANTHROPIC_MODEL: config.model_config.model,
      ANTHROPIC_BASE_URL: config.model_config.base_url,
      ANTHROPIC_AUTH_MODE: config.model_config.auth_mode,
    },
    timeout: config.runtime_config.container_timeout,
    // ... 其他选项
  };

  return await executeContainer(input, containerOptions);
}
```

### 4.3 消息路由改造

```typescript
async function processGroupMessages(groupFolder: string) {
  const primaryAgent = getPrimaryAgentByGroup(groupFolder);

  const formattedPrompt = formatPromptWithAgentContext(
    messages,
    primaryAgent.identity,
    primaryAgent.config
  );

  const response = await runContainerAgent({
    prompt: formattedPrompt,
    groupFolder,
    chatJid,
    isMain,
    agentId: primaryAgent.id,
    agentConfig: primaryAgent.config
  });

  await channel.sendMessage(chatJid, response);
}
```

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
{ type: 'bind_agent_to_channel', payload: { agentId, channelName } }
{ type: 'bind_agent_to_group', payload: { agentId, groupFolder, isPrimary } }
```

---

## 6. 实施步骤

### 阶段 1.1：基础架构（1-2 天）
1. 创建 `src/custom/` 目录
2. 创建 `src/custom/agent/types.ts`（类型定义）
3. 创建 `src/custom/agent/db.ts`（数据库操作）
4. 数据库迁移：新增 `agents`, `agent_channel_bindings`, `agent_group_associations` 表

### 阶段 1.2：配置管理（1 天）
1. 创建 `src/custom/agent/config.ts`（配置文件管理）
2. 实现 `data/agents/` 目录结构
3. 创建配置验证和合并逻辑

### 阶段 1.3：运行逻辑改造（2 天）
1. 改造 `src/container-runner.ts` 接受 agent 参数
2. 改造 `src/index.ts` 的消息路由逻辑
3. 测试容器运行和消息处理

### 阶段 1.4：API 接口（1 天）
1. 创建 `src/custom/agent/api.ts`（API 接口）
2. 创建 `src/custom/agent/ipc.ts`（IPC 接口）
3. 测试新增的 IPC 命令

### 阶段 1.5：兼容性维护（1 天）
1. 确保现有功能正常工作
2. 测试默认 agent 逻辑
3. 处理边界条件（如 agent 不存在时的 fallback）

### 阶段 1.6：Skill 开发（可选，阶段 1 完成后）
1. 创建 `/setup-agent` skill
2. 实现 agent 创建和配置界面

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

---

## 8. 预期结果

完成阶段 1 后：

✅ **agent 身份边界清晰**：每个 agent 有唯一身份和完整配置
✅ **配置与 group 解耦**：agent 配置独立于 group 上下文
✅ **独立运行容器**：每个 agent 可指定不同的容器配置
✅ **为阶段 2 奠定基础**：agent 抽象已建立，记忆系统可直接绑定

**用户体验**：现有功能无感知，但可以通过 `/run_agent` 命令指定使用特定 agent，体验个性化的回复风格。

---

## 9. 决策记录

### 9.1 为什么选择方案 B（部分集成）而不是方案 C（完全替换）

| 维度 | 理由 |
|------|------|
| 风险控制 | 渐进式重构避免了大面积故障 |
| 价值平衡 | 获得 agent 抽象的核心价值，但保留现有功能稳定 |
| 技术债务 | 兼容性逻辑可在阶段 2 或阶段 3 清除 |
| 开发效率 | 代码复用更多，开发更快 |
| 与 upstream 同步 | 代码边界清晰，防冲突标记明确 |

### 9.2 为什么容器与 agent 一对一

符合 `ARCHITECTURE.md` 原则：
- agent 是最小能力主体
- container 是运行壳，不是主体
- agent 的工作区完全隔离，不能被其他 agent 访问

### 9.3 为什么模型配置简化

遵循极简主义原则：
- 现阶段只需要最基本的配置（model、base_url、auth_mode）
- 容灾机制默认关闭，避免复杂度
- 可以在后续阶段根据需求扩展

---

## 10. 后续阶段展望

### 阶段 2：Agent 私有记忆系统
- 建立 agent 私有的记忆存储
- 支持记忆的读取、写入、检索
- 支持记忆的归档和摘要

### 阶段 3：共同进化系统
- 支持多个 agent 协作
- 建立经验分享机制
- 支持知识的传递和继承

### 阶段 4：Private Moltbook
- 建立全局知识图谱
- 支持知识的可视化查询
- 建立知识反哺机制

### 阶段 5：向上知识反哺
- 建立知识筛选和审核机制
- 支持知识上行到更高系统层
- 建立知识反哺的验证流程
