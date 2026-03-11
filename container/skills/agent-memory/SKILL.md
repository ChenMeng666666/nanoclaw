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

## 进化库系统 (GEP 1.5.0 标准)

进化库用于共享经验：上传 → 审核 → 查询 → 使用反馈，完全符合 GEP 1.5.0 标准。

### GEP 1.5.0 核心概念

- **GEPGene**：符合 GEP 标准的基因结构，包含 signalsMatch、validationCommands、chainId 等字段
- **GEPCapsule**：验证后的执行结果胶囊，包含置信度、影响范围、执行结果等
- **GDIScore**：全球期望指数评分，综合内在质量、使用指标、社交信号和新鲜度
- **AbilityChain**：能力链概念，用于链接相关的基因和胶囊

### API 端点

#### POST /api/evolution/query

查询经验库（符合 GEP 标准）

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
      "status": "promoted",
      "schema_version": "1.5.0",
      "asset_id": "sha256:abc123...",
      "gdi_score": {
        "intrinsicQuality": 8.5,
        "usageMetrics": 7.2,
        "socialSignals": 6.8,
        "freshness": 9.0,
        "total": 7.8
      }
    }
  ]
}
```

#### POST /api/evolution/submit

提交经验到进化库（符合 GEP 标准）

```bash
curl -X POST http://host.docker.internal:3456/api/evolution/submit \
  -H "Content-Type: application/json" \
  -d '{
    "abilityName": "简洁回答技巧",
    "description": "如何给出简洁有效的回答",
    "content": "1. 直接给出答案\n2. 避免冗余解释\n3. 使用列表结构化...",
    "sourceAgentId": "andy",
    "tags": ["沟通技巧", "效率优化"],
    "validationCommands": ["npm run test:communication"]
  }'
```

**响应**：
```json
{
  "id": 456,
  "status": "pending",
  "schema_version": "1.5.0",
  "asset_id": "sha256:def456..."
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

#### POST /api/evolution/create-capsule

创建 Capsule（验证后的执行结果）

```bash
curl -X POST http://host.docker.internal:3456/api/evolution/create-capsule \
  -H "Content-Type: application/json" \
  -d '{
    "geneId": 123,
    "trigger": ["user_emotional", "communication"],
    "confidence": 0.95,
    "blastRadius": {"files": 2, "lines": 50},
    "outcome": {"status": "success", "score": 0.9}
  }'
```

**响应**：
```json
{
  "capsuleId": "sha256:ghi789...",
  "status": "created",
  "geneStatus": "promoted"
}
```

---

## 信号提取系统

信号提取系统用于从对话内容和记忆中提取关键信号，这些信号可以用于进化系统的基因选择。

### API 端点

#### POST /api/signals/extract

从内容中提取信号

```bash
curl -X POST http://host.docker.internal:3456/api/signals/extract \
  -H "Content-Type: application/json" \
  -d '{
    "content": "用户询问了关于 Python 数据分析的问题，我提供了使用 pandas 的解决方案，但用户反馈说 pandas 的性能不够好，需要更快的方法。",
    "memorySnippet": "之前处理过类似的数据分析问题，使用过 numba 进行加速",
    "language": "zh-CN"
  }'
```

**参数**：
- `content` (必需): 要分析的内容文本
- `memorySnippet` (可选): 相关的记忆片段，用于上下文分析
- `language` (可选): 语言代码 (en/zh-CN/zh-TW/ja)

**响应**：
```json
{
  "signals": [
    {
      "type": "performance",
      "content": "性能问题，pandas 速度不够",
      "confidence": 0.9
    },
    {
      "type": "optimization",
      "content": "需要优化方案",
      "confidence": 0.85
    },
    {
      "type": "tool",
      "content": "涉及 pandas 工具",
      "confidence": 0.8
    }
  ]
}
```

### 信号类型

| 信号类型 | 描述 | 应用场景 |
|---------|------|---------|
| `performance` | 性能相关问题 | 性能优化、代码加速 |
| `bug` | Bug 或错误 | 修复问题、代码调试 |
| `optimization` | 优化机会 | 代码优化、效率提升 |
| `feature` | 新功能需求 | 功能开发、创新改进 |
| `learn` | 学习需求 | 知识获取、技能提升 |
| `tool` | 工具使用 | 工具选择、技术栈优化 |
| `complexity` | 复杂度问题 | 代码重构、架构改进 |
| `security` | 安全相关 | 安全加固、漏洞修复 |

---

## 饱和检测系统

饱和检测系统用于监控学习进度，检测是否进入学习饱和状态，提供相应的应对策略。

### API 端点

#### GET /api/saturation/detect

检测学习饱和状态

```bash
curl -G "http://host.docker.internal:3456/api/saturation/detect" \
  --data-urlencode "agentFolder=andy" \
  --data-urlencode "limit=20"
```

**参数**：
- `agentFolder` (可选): 指定 agent 的 folder，如果不指定则返回全局状态
- `limit` (可选): 分析的历史记录数量，默认 10

**响应**：
```json
{
  "state": {
    "status": "healthy",
    "saturationLevel": 0.3,
    "keepRate": 0.7,
    "discardRate": 0.2,
    "crashRate": 0.1,
    "recentResults": 20,
    "trend": "improving",
    "recommendedAction": "continue_learning"
  },
  "summary": {
    "overallStatus": "健康 - 学习进展顺利",
    "keyInsights": [
      "保持率较高 (70%)，学习效果良好",
      "趋势向好，继续当前学习方向",
      "建议保持当前学习节奏"
    ],
    "recommendedStrategies": [
      "继续当前的学习计划",
      "尝试更具挑战性的任务",
      "定期回顾和总结已学内容"
    ]
  }
}
```

### 饱和状态

| 状态 | 描述 | 推荐操作 |
|------|------|---------|
| `healthy` | 学习状态健康 | continue_learning |
| `warning` | 接近饱和状态 | adjust_approach |
| `saturated` | 已进入饱和状态 | change_focus, take_break |
| `stagnant` | 学习停滞 | reset_strategy, seek_help |

### 应对策略

```typescript
// 根据饱和状态选择应对策略
function getStrategy(state: SaturationState): GeneCategory {
  switch (state.status) {
    case 'healthy':
      // 健康状态：继续优化和学习
      return state.saturationLevel > 0.5 ? 'optimize' : 'learn';
    case 'warning':
      // 警告状态：尝试创新方法
      return 'innovate';
    case 'saturated':
    case 'stagnant':
      // 饱和/停滞：修复问题或重新开始
      return 'repair';
    default:
      return 'learn';
  }
}
```

---

## 基因选择系统

基因选择系统根据提取的信号推荐合适的进化基因类别。

### API 端点

#### POST /api/evolution/select-gene

根据信号选择推荐的基因

```bash
curl -X POST http://host.docker.internal:3456/api/evolution/select-gene \
  -H "Content-Type: application/json" \
  -d '{
    "signals": [
      {"type": "performance", "content": "性能问题"},
      {"type": "optimization", "content": "需要优化"}
    ],
    "category": "optimize"
  }'
```

**参数**：
- `signals` (可选): 提取的信号列表
- `category` (可选): 强制指定基因类别

**响应**：
```json
{
  "category": "optimize",
  "genes": [
    {
      "id": 123,
      "abilityName": "Python 性能优化技巧",
      "content": "使用 numba 加速 pandas 操作...",
      "tags": ["性能优化", "Python", "pandas"],
      "category": "optimize"
    }
  ],
  "count": 5
}
```

### 基因类别 (GEP 标准)

| 类别 | 描述 | 适用场景 |
|------|------|---------|
| `repair` | 修复基因 | 修复 Bug、解决问题 |
| `optimize` | 优化基因 | 性能优化、效率提升 |
| `innovate` | 创新基因 | 新功能开发、创新改进 |
| `learn` | 学习基因 | 知识获取、技能提升 |

### 基因状态 (GEP 标准)

| 状态 | 描述 | GDI 评分要求 |
|------|------|-------------|
| `promoted` | 已晋升 | GDI ≥ 7.0 且 < 30 天 |
| `stale` | 陈旧 | 3.0 ≤ GDI < 7.0 且 < 90 天 |
| `archived` | 已归档 | GDI < 3.0 或 ≥ 90 天 |

---

## GEP 1.5.0 数据结构示例

### GEPGene 结构

```typescript
interface GEPGene {
  type: 'Gene';
  schema_version: '1.5.0';
  asset_id: string; // sha256:<hex>
  category: 'repair' | 'optimize' | 'innovate';
  signals_match: string[];
  summary: string;
  preconditions: string[];
  validation_commands: string[];
  chain_id?: string;
  gdi_score?: GDIScore;
  status: 'promoted' | 'stale' | 'archived';
  // ... 其他字段
}
```

### GEPCapsule 结构

```typescript
interface GEPCapsule {
  type: 'Capsule';
  schema_version: '1.5.0';
  asset_id: string;
  trigger: string[];
  gene: string; // Gene 的 asset_id
  summary: string;
  confidence: number; // 0-1
  blast_radius: {
    files: number;
    lines: number;
  };
  outcome: {
    status: 'success' | 'partial' | 'failed';
    score: number;
  };
  success_streak: number;
  gene_id: number;
  approved_at: string;
}
```

### GDIScore 结构

```typescript
interface GDIScore {
  intrinsicQuality: number; // 0-10 (35%)
  usageMetrics: number;     // 0-10 (30%)
  socialSignals: number;    // 0-10 (20%)
  freshness: number;        // 0-10 (15%)
  total: number;            // 总分 (0-10)
}
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
