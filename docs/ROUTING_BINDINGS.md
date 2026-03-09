# 路由绑定使用手册

## 概述

路由绑定（Routing Bindings）提供了 ACP (Agent Collaboration Protocol) 风格的持久化路由功能。它允许将 Telegram Topic/Thread 绑定到特定的 Agent，实现细粒度的消息路由。

## 功能特性

- **持久化绑定**: 绑定信息存储在 SQLite 数据库中，服务重启后依然有效
- **Topic 级路由**: 支持 Telegram 论坛模式，按 Topic 绑定不同 Agent
- **Session 隔离**: 每个绑定可以关联独立的 Session
- **动态更新**: 支持运行时创建、更新、删除绑定

## 数据库结构

```sql
CREATE TABLE routing_bindings (
  id TEXT PRIMARY KEY,
  channel_type TEXT NOT NULL,        -- 'telegram', 'discord', 'slack'
  thread_id TEXT NOT NULL,           -- Telegram topic/thread ID
  agent_id TEXT NOT NULL,
  session_key TEXT,                  -- 绑定的 session key
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(channel_type, thread_id)    -- 唯一约束
);

CREATE INDEX idx_routing_bindings_lookup
  ON routing_bindings(channel_type, thread_id);
CREATE INDEX idx_routing_bindings_agent
  ON routing_bindings(agent_id);
```

## 使用指南

### Telegram 命令

#### `/bind @agent_name`

将当前 Topic 绑定到指定的 Agent。

**使用方法**:
1. 在 Telegram 论坛群组中
2. 回复任意一条 Topic 内的消息
3. 发送 `/bind @agent_name`

**示例**:
```
/bind @mimi
```

**响应**:
- 成功：`Successfully bound topic to agent: mimi`
- 失败：`Failed to bind topic: <error message>`

**前置条件**:
- 必须在群组（group/supergroup）中使用
- 必须在论坛模式（Forum）的 Topic 中使用
- 必须回复 Topic 内的消息

#### `/chatid`

获取当前聊天的 ID 和元数据。

**输出示例**:
```
Chat ID: `tg:-1001234567890`
Name: My Forum Group
Type: supergroup
```

#### `/ping`

检查 Bot 是否在线。

**响应**:
```
@AssistantName is online.
```

## API 参考

### 创建绑定

```typescript
import { createRoutingBinding } from './db-routing.js';

createRoutingBinding({
  channelType: 'telegram',
  threadId: 'tg:-1001234567890:123',  // 格式：tg:<chat_id>:<topic_id>
  agentId: 'agent_abc123',
  sessionKey: 'session_xyz',  // 可选
});
```

### 查询绑定

```typescript
import { getRoutingBinding } from './db-routing.js';

const binding = getRoutingBinding('telegram', 'tg:-1001234567890:123');

if (binding) {
  console.log('Agent ID:', binding.agentId);
  console.log('Session Key:', binding.sessionKey);
}
```

### 更新 Session

```typescript
import { updateRoutingBindingSession } from './db-routing.js';

updateRoutingBindingSession(
  'telegram',
  'tg:-1001234567890:123',
  'new_session_key'
);
```

### 删除绑定

```typescript
import { deleteRoutingBinding } from './db-routing.js';

deleteRoutingBinding('telegram', 'tg:-1001234567890:123');
```

### 获取 Agent 的所有绑定

```typescript
import { getRoutingBindingsByAgent } from './db-routing.js';

const bindings = getRoutingBindingsByAgent('agent_abc123');

for (const binding of bindings) {
  console.log(`Topic ${binding.threadId} -> Agent ${binding.agentId}`);
}
```

### 获取所有绑定

```typescript
import { getAllRoutingBindings } from './db-routing.js';

const allBindings = getAllRoutingBindings();
```

## 消息路由流程

```
┌─────────────────────────────────────────────────────────────┐
│                    消息路由流程                              │
└─────────────────────────────────────────────────────────────┘

1. 用户发送消息到 Telegram Topic
   │
   ▼
2. Telegram Bot 接收消息
   │
   ▼
3. 提取 Topic ID (从 reply_to_message.message_thread_id)
   │
   ▼
4. 构建 thread_id: `tg:<chat_id>:<topic_id>`
   │
   ▼
5. 查询 routing_bindings 表
   │
   ├─ 找到绑定 → 使用绑定的 agent_id
   │
   └─ 未找到 → Fallback 到 chat_jid 路由
   │
   ▼
6. 路由消息到 Agent 容器
   │
   ▼
7. Agent 处理并响应
```

## 集成示例

### 在 Agent Router 中使用

```typescript
import { routeMessageToAgent } from './agent-router.js';

// 带 Topic 路由
const result = await routeMessageToAgent(
  'tg:-1001234567890',
  '123'  // topic_id
);

if (result) {
  console.log(`Routing to agent: ${result.agentName}`);
}
```

### 在 Telegram Channel 中使用

```typescript
import { createRoutingBinding } from './db-routing.js';
import { getAllActiveAgents } from './db-agents.js';

bot.command('bind', (ctx) => {
  const topicId = ctx.msg?.reply_to_message?.message_thread_id?.toString();
  if (!topicId) {
    ctx.reply('Please reply to a topic message');
    return;
  }

  const agentName = ctx.message.text.split(' ')[1]?.replace('@', '');
  const agents = getAllActiveAgents();
  const agent = agents.find(a => a.name.toLowerCase() === agentName?.toLowerCase());

  if (!agent) {
    ctx.reply(`Agent "${agentName}" not found`);
    return;
  }

  const threadId = `tg:${ctx.chat.id}:${topicId}`;
  createRoutingBinding({
    channelType: 'telegram',
    threadId,
    agentId: agent.id,
  });

  ctx.reply(`Bound topic to agent: ${agent.name}`);
});
```

## 数据库迁移

### 运行迁移脚本

```bash
npx tsx scripts/migrate-add-routing-bindings.ts
```

### 手动迁移

```sql
-- 创建表
CREATE TABLE IF NOT EXISTS routing_bindings (
  id TEXT PRIMARY KEY,
  channel_type TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(channel_type, thread_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_routing_bindings_lookup
  ON routing_bindings(channel_type, thread_id);
CREATE INDEX IF NOT EXISTS idx_routing_bindings_agent
  ON routing_bindings(agent_id);
```

## 测试

### 单元测试

```bash
npm test -- src/__tests__/db-routing.test.ts
```

### 手动测试

1. 启动 NanoClaw 服务
2. 在 Telegram 中发送 `/chatid` 获取 Chat ID
3. 在论坛群组中回复消息并发送 `/bind @agent_name`
4. 发送测试消息验证路由
5. 重启服务验证持久化

## 故障排除

### 绑定未生效

1. 检查 Topic ID 格式是否正确
2. 验证 agent_id 是否存在且有效
3. 查询数据库确认绑定已创建

```sql
SELECT * FROM routing_bindings WHERE channel_type = 'telegram';
```

### `/bind` 命令无响应

1. 检查 Bot 是否为管理员
2. 确认群组已启用论坛模式
3. 查看日志是否有错误

### 重启后绑定丢失

1. 确认数据库文件已持久化
2. 检查迁移脚本是否运行
3. 验证数据库连接

## 最佳实践

### 1. 绑定命名规范

使用一致的 thread_id 格式：
```
tg:<chat_id>:<topic_id>
```

### 2. Session 管理

为每个绑定分配独立的 Session：
```typescript
createRoutingBinding({
  channelType: 'telegram',
  threadId: 'tg:-1001234567890:123',
  agentId: 'agent_abc',
  sessionKey: `session_${Date.now()}`,
});
```

### 3. 错误处理

在创建绑定时捕获异常：
```typescript
try {
  createRoutingBinding({ /* ... */ });
} catch (err) {
  logger.error('Failed to create binding', err);
}
```

### 4. 清理未使用的绑定

定期清理无效的绑定：
```typescript
const bindings = getAllRoutingBindings();
for (const binding of bindings) {
  if (!isAgentActive(binding.agentId)) {
    deleteRoutingBinding(binding.channelType, binding.threadId);
  }
}
```

## 相关文件

- `src/db-routing.ts` - 路由绑定 CRUD 操作
- `src/db.ts` - 数据库 schema
- `src/agent-router.ts` - 消息路由逻辑
- `src/channels/telegram.ts` - Telegram Bot 实现
- `scripts/migrate-add-routing-bindings.ts` - 迁移脚本

## 参考资料

- [ACP 规范](https://github.com/openclaw/openclaw/releases/tag/v2026.3.7)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Grammy 框架](https://grammy.dev)
