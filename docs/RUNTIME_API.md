# NanoClaw 运行时 API 使用指南

## 概述

运行时 API 提供 HTTP 接口供容器内的 agent 访问多智能体架构的核心功能：
- 记忆查询和管理
- 进化库查询和经验提交
- 学习任务管理
- 反思触发

## 配置

```bash
# .env
RUNTIME_API_PORT=3456        # API 端口（默认 3456）
RUNTIME_API_ENABLED=true     # 是否启用（默认 true）
```

## API 端点

### 记忆 API

#### POST /api/memory/search

查询相关记忆（语义检索）

请求约束：
- `query`: 必填，非空字符串
- `agentFolder`: 必填，非空字符串
- `limit`: 可选，整数，范围由 `MEMORY_API_MIN_LIMIT` 与 `MEMORY_API_MAX_LIMIT` 控制

```bash
curl -X POST http://localhost:3456/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "用户偏好",
    "agentFolder": "andy",
    "userJid": "tg:123456789",
    "limit": 10
  }'
```

响应：
```json
{
  "memories": [
    {
      "id": "...",
      "agentFolder": "andy",
      "userJid": "tg:123456789",
      "level": "L3",
      "content": "用户喜欢简洁的回答",
      "importance": 0.85,
      "accessCount": 5
    }
  ]
}
```

#### POST /api/memory/add

添加新记忆

请求约束：
- `agentFolder`: 必填，非空字符串
- `content`: 必填，最大长度由 `MEMORY_API_MAX_CONTENT_LENGTH` 控制
- `level`: 可选，必须是 `L1 | L2 | L3`

```bash
curl -X POST http://localhost:3456/api/memory/add \
  -H "Content-Type: application/json" \
  -d '{
    "agentFolder": "andy",
    "content": "用户说他明天有重要会议",
    "level": "L2",
    "userJid": "tg:123456789"
  }'
```

#### GET /api/memory/list

列出记忆

查询参数约束：
- `agentFolder`: 必填
- `level`: 可选，必须是 `L1 | L2 | L3`

```bash
curl -G http://localhost:3456/api/memory/list \
  --data-urlencode "agentFolder=andy" \
  --data-urlencode "level=L2" \
  --data-urlencode "userJid=tg:123456789"
```

---

### 错误码约定（Memory API）

- `INVALID_JSON`: 请求体 JSON 非法
- `REQUEST_BODY_TOO_LARGE`: 请求体超出 `MEMORY_API_MAX_BODY_BYTES`
- `INVALID_QUERY` / `INVALID_AGENTFOLDER` / `INVALID_CONTENT`: 必填字段非法
- `INVALID_LEVEL`: `level` 不在允许枚举内
- `INVALID_LIMIT`: `limit` 非法或越界
- `MEMORY_CONTENT_TOO_LONG`: `content` 超过最大长度

### 进化库 API

#### POST /api/evolution/query

查询经验库

```bash
curl -X POST http://localhost:3456/api/evolution/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何处理用户情绪化对话",
    "tags": ["沟通技巧", "情绪管理"],
    "limit": 20
  }'
```

#### POST /api/evolution/submit

提交经验到进化库

```bash
curl -X POST http://localhost:3456/api/evolution/submit \
  -H "Content-Type: application/json" \
  -d '{
    "abilityName": "情绪化对话处理技巧",
    "description": "当用户情绪激动时的应对方法",
    "content": "1. 首先表达理解和共情\n2. 不要辩解或反驳\n3. 提供具体的解决方案...",
    "sourceAgentId": "andy",
    "tags": ["沟通技巧", "情绪管理"]
  }'
```

响应：
```json
{
  "id": 123,
  "status": "submitted"
}
```

#### POST /api/evolution/feedback

提交使用反馈

```bash
curl -X POST http://localhost:3456/api/evolution/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "id": 123,
    "agentId": "beth",
    "comment": "这个方法很有效，用户情绪明显缓和了",
    "rating": 5
  }'
```

---

### 学习任务 API

#### GET /api/learning/tasks

获取学习任务列表

```bash
curl -G http://localhost:3456/api/learning/tasks \
  --data-urlencode "agentFolder=andy"
```

#### POST /api/learning/task/create

创建学习任务

```bash
curl -X POST http://localhost:3456/api/learning/task/create \
  -H "Content-Type: application/json" \
  -d '{
    "agentFolder": "andy",
    "description": "学习 Python 数据分析基础",
    "resources": [
      "https://docs.python.org/3/library/data_analysis.html",
      "https://pandas.pydata.org/docs/"
    ]
  }'
```

---

## Agent 端使用示例

### TypeScript/JavaScript

```typescript
// 在 container 内的 agent 代码中使用

const RUNTIME_API_URL = process.env.RUNTIME_API_URL || 'http://host.docker.internal:3456';

// 查询记忆
async function searchMemories(query: string, agentFolder: string) {
  const response = await fetch(`${RUNTIME_API_URL}/api/memory/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      agentFolder,
      limit: 10,
    }),
  });
  const data = await response.json();
  return data.memories;
}

// 添加记忆
async function addMemory(content: string, agentFolder: string, level = 'L1') {
  const response = await fetch(`${RUNTIME_API_URL}/api/memory/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      agentFolder,
      level,
    }),
  });
  return response.ok;
}

// 查询进化库
async function queryExperience(query: string, tags?: string[]) {
  const response = await fetch(`${RUNTIME_API_URL}/api/evolution/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, tags, limit: 20 }),
  });
  const data = await response.json();
  return data.entries;
}

// 提交经验
async function submitExperience(abilityName: string, content: string, sourceAgentId: string) {
  const response = await fetch(`${RUNTIME_API_URL}/api/evolution/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      abilityName,
      content,
      sourceAgentId,
      tags: ['auto-generated'],
    }),
  });
  const data = await response.json();
  return data.id;
}
```

### Python

```python
import requests
import os

RUNTIME_API_URL = os.environ.get('RUNTIME_API_URL', 'http://host.docker.internal:3456')

def search_memories(query: str, agent_folder: str, limit: int = 10):
    """查询记忆"""
    response = requests.post(
        f'{RUNTIME_API_URL}/api/memory/search',
        json={
            'query': query,
            'agentFolder': agent_folder,
            'limit': limit,
        }
    )
    return response.json().get('memories', [])

def add_memory(content: str, agent_folder: str, level: str = 'L1'):
    """添加记忆"""
    response = requests.post(
        f'{RUNTIME_API_URL}/api/memory/add',
        json={
            'content': content,
            'agentFolder': agent_folder,
            'level': level,
        }
    )
    return response.ok

def query_experience(query: str, tags: list = None):
    """查询进化库"""
    response = requests.post(
        f'{RUNTIME_API_URL}/api/evolution/query',
        json={
            'query': query,
            'tags': tags or [],
            'limit': 20,
        }
    )
    return response.json().get('entries', [])

def submit_experience(ability_name: str, content: str, source_agent_id: str):
    """提交经验"""
    response = requests.post(
        f'{RUNTIME_API_URL}/api/evolution/submit',
        json={
            'abilityName': ability_name,
            'content': content,
            'sourceAgentId': source_agent_id,
            'tags': ['auto-generated'],
        }
    )
    return response.json().get('id')
```

---

## Docker 网络配置

容器内的 agent 需要访问宿主机上的运行时 API，使用以下方式：

### macOS (Docker Desktop)

```bash
# 在 container 内使用
RUNTIME_API_URL=http://host.docker.internal:3456
```

### Linux (Docker)

```bash
# 使用宿主机 IP
RUNTIME_API_URL=http://172.17.0.1:3456

# 或使用特殊 DNS
RUNTIME_API_URL=http://host.docker.internal:3456
# 需要在 docker run 时添加 --add-host=host.docker.internal:host-gateway
```

---

## 安全考虑

⚠️ **注意**: 运行时 API 支持 `X-API-Key` 认证；若未配置 `RUNTIME_API_KEY`，非生产环境仍可启动，仅建议本地开发使用。

生产环境建议：
1. 强制设置 `RUNTIME_API_KEY`
2. 使用 HTTPS
3. 限制请求频率
4. 审计所有 API 调用
