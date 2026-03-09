---
name: agent-memory
description: Use memory, learning, and evolution systems - store user info, recall context, submit experiences, and query shared knowledge.
tools: Bash(curl)
---

# 记忆和进化系统使用指南

## 快速开始

### 记住信息
```bash
curl -X POST http://host.docker.internal:3456/api/memory/add \
  -H "Content-Type: application/json" \
  -d '{"agentFolder": "andy", "content": "用户喜欢简洁的回答", "level": "L2"}'
```

### 查询记忆
```bash
curl -X POST http://host.docker.internal:3456/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{"query": "用户偏好", "agentFolder": "andy", "limit": 5}'
```

### 提交经验到进化库
```bash
curl -X POST http://host.docker.internal:3456/api/evolution/submit \
  -H "Content-Type: application/json" \
  -d '{"abilityName": "简洁回答技巧", "content": "用户喜欢...", "sourceAgentId": "andy", "tags": ["沟通技巧"]}'
```

---

## 记忆系统

记忆分为三层：
- **L1 工作记忆**：当前对话的临时记忆
- **L2 短期记忆**：用户偏好、重要事实
- **L3 长期记忆**：需要长期保留的核心信息（带向量检索）

### API 端点

#### POST /api/memory/add

添加新记忆

```bash
curl -X POST http://host.docker.internal:3456/api/memory/add \
  -H "Content-Type: application/json" \
  -d '{
    "agentFolder": "andy",
    "content": "用户说他明天有重要会议",
    "level": "L2",
    "userJid": "tg:123456789"
  }'
```

**参数**：
- `agentFolder` (必需): agent 的 folder 名
- `content` (必需): 记忆内容
- `level`: 记忆层级 (L1/L2/L3，默认 L1)
- `userJid` (可选): 绑定特定用户

#### POST /api/memory/search

语义检索记忆

```bash
curl -X POST http://host.docker.internal:3456/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "用户偏好",
    "agentFolder": "andy",
    "userJid": "tg:123456789",
    "limit": 10
  }'
```

**响应**：
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

#### GET /api/memory/list

列出记忆

```bash
curl -G "http://host.docker.internal:3456/api/memory/list" \
  --data-urlencode "agentFolder=andy" \
  --data-urlencode "level=L2"
```

## 

## 进化库系统

进化库用于共享经验：上传 → 审核 → 查询 → 使用反馈

### API 端点

#### POST /api/evolution/query

查询经验库

```bash
curl -X POST http://host.docker.internal:3456/api/evolution/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何处理用户情绪化对话",
    "tags": ["沟通技巧", "情绪管理"],
    "limit": 20
  }'
```

**响应**：
```json
{
  "entries": [
    {
      "id": 123,
      "abilityName": "情绪化对话处理技巧",
      "content": "1. 首先表达理解和共情...",
      "tags": ["沟通技巧", "情绪管理"],
      "status": "approved"
    }
  ]
}
```

#### POST /api/evolution/submit

提交经验到进化库

```bash
curl -X POST http://host.docker.internal:3456/api/evolution/submit \
  -H "Content-Type: application/json" \
  -d '{
    "abilityName": "简洁回答技巧",
    "description": "如何给出简洁有效的回答",
    "content": "1. 直接给出答案\n2. 避免冗余解释\n3. 使用列表结构化...",
    "sourceAgentId": "andy",
    "tags": ["沟通技巧", "效率优化"]
  }'
```

**响应**：
```json
{
  "id": 456,
  "status": "submitted"
}
```

#### POST /api/evolution/feedback

提交使用反馈

```bash
curl -X POST http://host.docker.internal:3456/api/evolution/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "id": 456,
    "agentId": "andy",
    "comment": "这个方法很有效",
    "rating": 5
  }'
```

---

## 代码示例

### TypeScript

```typescript
const API_URL = 'http://host.docker.internal:3456';

// 添加记忆
async function addMemory(content: string, level = 'L2') {
  await fetch(`${API_URL}/api/memory/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentFolder: 'andy',
      content,
      level,
    }),
  });
}

// 查询记忆
async function searchMemories(query: string) {
  const res = await fetch(`${API_URL}/api/memory/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      agentFolder: 'andy',
      limit: 5,
    }),
  });
  const data = await res.json();
  return data.memories;
}

// 提交经验
async function submitExperience(name: string, content: string) {
  const res = await fetch(`${API_URL}/api/evolution/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      abilityName: name,
      content,
      sourceAgentId: 'andy',
      tags: ['auto-generated'],
    }),
  });
  return (await res.json()).id;
}
```

### Python

```python
import requests

API_URL = 'http://host.docker.internal:3456'

def add_memory(content: str, level: str = 'L2'):
    requests.post(f'{API_URL}/api/memory/add', json={
        'agentFolder': 'andy',
        'content': content,
        'level': level,
    })

def search_memories(query: str):
    res = requests.post(f'{API_URL}/api/memory/search', json={
        'query': query,
        'agentFolder': 'andy',
        'limit': 5,
    })
    return res.json().get('memories', [])

def submit_experience(name: str, content: str):
    res = requests.post(f'{API_URL}/api/evolution/submit', json={
        'abilityName': name,
        'content': content,
        'sourceAgentId': 'andy',
        'tags': ['auto-generated'],
    })
    return res.json().get('id')
```

---

## 使用场景

### 场景 1：记住用户偏好

当用户说"我不喜欢冗长的解释"时：

```bash
curl -X POST http://host.docker.internal:3456/api/memory/add \
  -H "Content-Type: application/json" \
  -d '{"agentFolder": "andy", "content": "用户不喜欢冗长的解释，喜欢简洁回答", "level": "L2"}'
```

下次对话时查询：

```bash
curl -X POST http://host.docker.internal:3456/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{"query": "用户偏好 回答风格", "agentFolder": "andy", "limit": 3}'
```

### 场景 2：提交成功经验

完成一个任务后，如果找到了有效方法：

```bash
curl -X POST http://host.docker.internal:3456/api/evolution/submit \
  -H "Content-Type: application/json" \
  -d '{
    "abilityName": "快速文件搜索技巧",
    "content": "使用 find 命令配合 -name 参数比 grep 快 10 倍",
    "sourceAgentId": "andy",
    "tags": ["文件操作", "效率优化"]
  }'
```

### 场景 3：查询其他 agent 的经验

遇到陌生问题时：

```bash
curl -X POST http://host.docker.internal:3456/api/evolution/query \
  -H "Content-Type: application/json" \
  -d '{"query": "文件搜索 高效方法", "tags": ["文件操作"], "limit": 5}'
```

---

## 注意事项

1. **URL 配置**：容器内使用 `http://host.docker.internal:3456`
2. **agentFolder**：必须与你的 agent folder 名一致
3. **记忆层级**：
   - L1：临时信息，下次对话可能消失
   - L2：用户偏好、重要事实
   - L3：核心知识，需要向量检索
4. **进化库审核**：提交的经验需要审核后才能被查询到
