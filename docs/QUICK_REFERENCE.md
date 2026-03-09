# NanoClaw 多智能体架构 - 快速参考

## 核心概念

### 智能体 (Agent)
- 独立的 AI 助手实例
- 拥有独立的名字、性格、价值观
- 独立的 Anthropic API 配置
- 独立的工作区 (`groups/{folder}/`)

### 通道实例 (Channel Instance)
- 一个 agent 对应一个独立的 bot
- 例如：Andy → @andy_bot, Beth → @beth_bot
- 支持 Telegram、WhatsApp、Slack、Discord

### 记忆分层
| 层级 | 存储位置 | 保留时间 | 触发迁移 |
|------|----------|----------|----------|
| L1 工作记忆 | 内存缓存 | 当前对话 | 访问 3 次 → L2 |
| L2 短期记忆 | 数据库 | 最近 7 天 | 30 天未访问 → L3 |
| L3 长期记忆 | 数据库 + 向量 | 永久 | - |

### 四大机制
1. **记忆** - 分层存储用户交互历史
2. **认知** - 固定的身份和性格设定
3. **学习** - 定时反思和总结
4. **进化** - 共享经验库，持续改进

---

## 快速命令

```bash
# 设置环境变量
export NANOCLAW_ENCRYPTION_KEY=$(openssl rand -hex 32)

# 创建新智能体
npx tsx scripts/setup-agent.ts

# 迁移现有配置
npx tsx scripts/migrate-to-agents.ts

# 编译
npm run build

# 开发模式
npm run dev

# 查询记忆 (运行时 API)
curl -X POST http://localhost:3456/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{"query": "xxx", "agentFolder": "andy"}'
```

---

## 数据库表结构

```sql
-- 智能体核心配置
agents (id, name, folder, user_name, personality, values, appearance,
        anthropic_token_encrypted, anthropic_url, anthropic_model,
        is_active, created_at, updated_at)

-- 通道与智能体映射（一对一）
channel_instances (id, agent_id, channel_type, bot_id, jid, name,
                   config, mode, is_active, created_at)

-- 用户画像
user_profiles (id, channel_instance_id, user_jid, name, preferences,
               memory_summary, last_interaction, created_at)

-- 分层记忆
memories (id, agent_folder, user_jid, level, content, embedding,
          importance, access_count, last_accessed_at, created_at, updated_at)

-- 反思总结
reflections (id, agent_folder, type, content, triggered_by, created_at)

-- 学习任务
learning_tasks (id, agent_folder, description, status, reflection_id,
                resources, created_at, completed_at)

-- 进化日志
evolution_log (id, ability_name, description, source_agent_id, content,
               content_embedding, tags, status, reviewed_by, reviewed_at,
               feedback, created_at)

-- 审计日志
audit_log (id, agent_folder, action, entity_type, entity_id, details, created_at)
```

---

## 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                       NanoClaw 主进程                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ 记忆管理器   │  │ 反思调度器   │  │ 进化管理器   │             │
│  │  - L1 缓存    │  │  - hourly   │  │  - 上传      │             │
│  │  - L2/L3    │  │  - daily    │  │  - 审核      │             │
│  │  - 向量检索   │  │  - weekly   │  │  - 查询      │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Agent Router│  │ 运行时 API   │  │ 密钥存储    │             │
│  │  - JID 路由   │  │  - :3456   │  │  - keytar   │             │
│  │  - 配置解密   │  │  - 记忆 API │  │  - AES-256  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Container Andy │  │  Container Beth │  │   其他容器...    │
│  groups/andy/   │  │  groups/beth/   │  │                 │
│  - CLAUDE.md    │  │  - CLAUDE.md    │  │                 │
│  - .claude/     │  │  - .claude/     │  │                 │
│  - IPC (私有)    │  │  - IPC (私有)    │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│ @andy_bot       │  │ @beth_bot       │
│ Telegram        │  │ Telegram        │
└─────────────────┘  └─────────────────┘
```

---

## 典型流程

### 1. 消息处理流程
```
用户消息 → Telegram bot → Channel Router
                                │
                                ▼
                        routeMessageToAgent()
                                │
                                ▼
                    查询 channel_instances 表
                                │
                                ▼
                    获取 agent_id 和配置
                                │
                                ▼
                    从 keychain 解密密钥
                                │
                                ▼
                    启动容器 (带 agent 配置)
                                │
                                ▼
                    Agent 处理并响应
```

### 2. 记忆写入流程
```
Agent 调用运行时 API → POST /api/memory/add
                              │
                              ▼
                    memoryManager.addMemory()
                              │
                              ▼
                    生成向量嵌入 (all-MiniLM-L6-v2)
                              │
                              ▼
                    存入数据库 memories 表
                              │
                              ▼
                    L1 缓存同步更新
```

### 3. 进化流程
```
Agent 完成任务 → 产生经验
                     │
                     ▼
POST /api/evolution/submit
                     │
                     ▼
自动初审 (规则 + 置信度)
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
高置信度 → 自动 approved      低置信度 → 待审核
        │                         │
        └────────────┬────────────┘
                     │
                     ▼
              存入 evolution_log
                     │
                     ▼
              其他 agent 可查询使用
```

---

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `NANOCLAW_ENCRYPTION_KEY` | - | 加密密钥（必需） |
| `RUNTIME_API_PORT` | 3456 | 运行时 API 端口 |
| `RUNTIME_API_ENABLED` | true | 是否启用运行时 API |
| `USE_KEYTAR` | true | 是否使用系统 keychain |
| `ANTHROPIC_AUTH_TOKEN` | - | 全局 Anthropic token |
| `ANTHROPIC_BASE_URL` | - | 全局 API 基础 URL |
| `ANTHROPIC_MODEL` | claude-sonnet-4-6 | 全局默认模型 |

---

## 故障排查

### 密钥存储失败
```bash
# 检查 keytar 是否可用
node -e "require('keytar').setPassword('test', 'k', 'v').catch(console.error)"

# 使用文件 fallback
export USE_KEYTAR=false
export NANOCLAW_ENCRYPTION_KEY=$(openssl rand -hex 32)
```

### 向量嵌入加载慢
```bash
# 首次加载会下载模型 (~20MB)，后续会使用缓存
# 可以预加载模型
node -e "require('@xenova/transformers').pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')"
```

### 容器无法访问运行时 API
```bash
# macOS: 使用 host.docker.internal
# Linux: 添加 --add-host=host.docker.internal:host-gateway

# 测试连接
curl http://host.docker.internal:3456/api/memory/list?agentFolder=test
```

---

## 参考文档

- [架构详解](AGENT_ARCHITECTURE.md)
- [运行时 API 指南](RUNTIME_API.md)
- [Setup Skill 文档](../.claude/skills/setup-agents/SKILL.md)
