---
name: agent-learning
description: 可持续自我学习成长体系 - Agent 自主创建学习计划、执行任务、反思总结、知识沉淀。当 agent 发现自己能力不足、用户要求制定学习计划、或需要从进化库学习新技能时自动触发。
trigger: Agent 需要自我提升、制定学习计划、总结成长经验、提交进化库、或用户明确要求 agent 学习新技能
tools: Bash(curl), Read, Write, Edit
---

# 可持续自我学习成长体系

## 概述

本体系帮助 **agent 自己** 建立可持续的自我学习成长机制，包括：

1. **学习计划管理** - agent 自主创建、执行、追踪自己的学习计划
2. **任务执行系统** - agent 分解学习目标、执行任务、记录进度
3. **反思总结机制** - agent 定期反思自己的成长、总结收获、生成洞见
4. **知识沉淀系统** - agent 将自己的学习成果存储到记忆，将有价值经验提交到进化库分享给其他 agent

## 快速开始

### 学习自动化（新增）

现在 agent 可以完全自主进行学习，无需用户主动触发！

#### 启动学习自动化

```bash
bash /workspace/group/.learning-system/scripts/learning-automation.sh start
```

这会自动：
- 设置 cron 定时任务
- 立即生成并执行当日学习计划
- 启动前执行治理门禁检查
- 反思调度默认由主进程统一执行

#### 停止学习自动化

```bash
bash /workspace/group/.learning-system/scripts/learning-automation.sh stop
```

#### 检查状态

```bash
bash /workspace/group/.learning-system/scripts/learning-automation.sh status
```

#### 执行治理门禁检查

```bash
bash /workspace/group/.learning-system/scripts/learning-automation.sh gate
```

### 第一步：检查并初始化学习体系

**当 agent 首次需要自我学习时，必须先检查容器内是否有学习体系：**

#### 方式 A：使用初始化脚本（推荐）

```bash
# 运行初始化脚本（自动检查版本、创建目录、迁移数据）
bash /workspace/group/.learning-system/init.sh
```

脚本会自动：
- 检查学习体系是否已初始化
- 检测版本并执行必要的迁移
- 创建必要的子目录（plans/, logs/, reflections/）
- 验证 Runtime API 连接

#### 方式 B：手动初始化

```bash
# 检查学习体系是否存在
if [ ! -f "/workspace/group/.learning-system/initialized" ]; then
  # 初始化学习体系
  mkdir -p /workspace/group/.learning-system
  echo '{"version":"1.0","initializedAt":"'"$(date -Iseconds)"'","status":"active"}' > /workspace/group/.learning-system/config.json
  touch /workspace/group/.learning-system/initialized
  echo "学习体系初始化完成"
fi
```
### 第二步：创建学习计划

当 agent 决定学习新技能或用户要求 agent 制定学习计划时：

```bash
curl -X POST http://host.docker.internal:3456/api/learning/plan/create \
  -H "Content-Type: application/json" \
  -d '{
    "agentFolder": "mimi",
    "topic": "提升情绪化对话处理能力",
    "goal": "更好地理解和回应用户的情绪需求",
    "phases": [
      {"name": "学习情绪识别技巧", "status": "pending", "order": 1},
      {"name": "练习共情回应方法", "status": "pending", "order": 2},
      {"name": "实战应用与反思", "status": "pending", "order": 3}
    ],
    "resources": [
      "https://example.com/emotional-intelligence"
    ],
    "estimatedDuration": "2 周",
    "chatJid": "tg:123456789"  // 可选，用于发送学习提醒
  }'
```

**自动调度说明**：
- 创建学习计划时，系统会**自动为每个阶段创建定时任务**
- 默认每天晚上 8 点 (`20:00`) 自动执行学习任务
- 每个阶段间隔 1 天，从明天开始依次安排
- 返回的 `scheduledTaskIds` 包含所有定时任务的 ID

**响应示例**：
```json
{
  "id": "task_xxx",
  "topic": "提升情绪化对话处理能力",
  "goal": "更好地理解和回应用户的情绪需求",
  "phases": [...],
  "status": "created",
  "scheduledTaskIds": ["learning_mimi_1234567890", "learning_mimi_1234567891", "learning_mimi_1234567892"],
  "message": "已创建学习计划并自动安排 3 个定时学习任务"
}
```

### 第三步：执行学习任务

```bash
# 开始学习任务
curl -X POST http://host.docker.internal:3456/api/learning/task/start \
  -H "Content-Type: application/json" \
  -d '{
    "agentFolder": "mimi",
    "taskId": "返回的 taskId",
    "phaseName": "学习情绪识别技巧"
  }'

# 完成学习任务并记录反思
curl -X POST http://host.docker.internal:3456/api/learning/task/complete \
  -H "Content-Type: application/json" \
  -d '{
    "agentFolder": "mimi",
    "taskId": "xxx",
    "phaseName": "学习情绪识别技巧",
    "reflection": {
      "summary": "掌握了情绪识别的关键信号",
      "keyLearnings": ["用户说'真的吗'多次可能表示怀疑"],
      "difficulties": ["文字交流中难以捕捉语调"],
      "nextSteps": ["需要多观察用户的表达模式"]
    },
    "timeSpent": "1 小时"
  }'
```

### 第四步：查询学习计划和任务

**查询我的学习计划**：
```bash
curl -G http://host.docker.internal:3456/api/learning/plans \
  --data-urlencode "agentFolder=mimi"
```

**查询我的学习任务**：
```bash
curl -G http://host.docker.internal:3456/api/learning/tasks \
  --data-urlencode "agentFolder=mimi"
# 可按状态过滤：?status=pending&status=in_progress&status=completed
```

**查询定时任务**（scheduled_tasks 表中的任务）：
```bash
curl -G http://host.docker.internal:3456/api/scheduled/tasks \
  --data-urlencode "groupFolder=mimi"
# 可按状态过滤：?status=active&status=completed
```

**说明**：
- **学习任务** (`/api/learning/tasks`)：agent 自主创建的学习计划任务
- **定时任务** (`/api/scheduled/tasks`)：按固定时间间隔自动触发的任务（如每日反思、定时提醒）

### 第五步：查询学习进度

```bash
# 查看当前学习计划
curl -G http://host.docker.internal:3456/api/learning/plans \
  --data-urlencode "agentFolder=mimi" \
  --data-urlencode "status=active"
```

## 完整功能

### 1. 学习体系检查与初始化（自动触发）

**触发条件**：agent 首次需要自我学习提升

**执行流程**：
1. 检查 `/workspace/group/.learning-system/` 是否存在
2. 如果不存在，创建目录并初始化
3. 如果有更新（version 变化），执行迁移

**核心文件**：
- `/workspace/group/.learning-system/config.json` - 体系配置
- `/workspace/group/.learning-system/plans/` - 学习计划存储
- `/workspace/group/.learning-system/logs/` - 学习日志

**版本检测与更新逻辑**：

推荐使用初始化脚本：
```bash
bash /workspace/group/.learning-system/init.sh
```

或手动执行版本检测：
```bash
# 检查版本并更新
CONFIG_FILE="/workspace/group/.learning-system/config.json"
CURRENT_VERSION=$(cat "$CONFIG_FILE" 2>/dev/null | jq -r '.version' 2>/dev/null || echo "0.0")
LATEST_VERSION="1.0"

if [ "$CURRENT_VERSION" = "0.0" ]; then
  # 未初始化，执行初始化
  mkdir -p /workspace/group/.learning-system
  echo '{"version":"'"$LATEST_VERSION"'","initializedAt":"'"$(date -Iseconds)"'","status":"active"}' > "$CONFIG_FILE"
  touch /workspace/group/.learning-system/initialized
  echo "学习体系已初始化（版本 $LATEST_VERSION）"
elif [ "$CURRENT_VERSION" != "$LATEST_VERSION" ]; then
  # 版本不同，执行迁移
  echo "学习体系需要更新：$CURRENT_VERSION -> $LATEST_VERSION"
  # 在此处添加版本迁移逻辑
  jq ".version = \"$LATEST_VERSION\"" "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
  echo "学习体系已更新到版本 $LATEST_VERSION"
fi
```

### 2. 学习计划创建

**触发场景**：
- agent 发现自己某个能力不足，需要提升
- agent 从进化库看到其他 agent 的经验，想学习
- agent 完成一次反思后，发现成长空间
- 用户明确要求 agent 制定学习计划

**执行步骤**：
1. agent 分析自己的学习目标
2. 分解为阶段性任务
3. 准备学习资源
4. 调用 API 创建计划
5. 将计划保存到本地和记忆系统

**数据结构**：
```json
{
  "id": "plan_001",
  "topic": "提升情绪化对话处理能力",
  "goal": "更好地理解和回应用户的情绪需求",
  "phases": [
    {
      "name": "学习情绪识别技巧",
      "status": "completed",
      "order": 1,
      "startedAt": "2025-01-01T10:00:00Z",
      "completedAt": "2025-01-03T18:00:00Z"
    }
  ],
  "createdAt": "2025-01-01T10:00:00Z",
  "updatedAt": "2025-01-03T18:00:00Z",
  "status": "active"
}
```

### 3. 学习任务执行

**触发条件**：agent 报告自己的学习进度或完成情况

**执行步骤**：
1. 更新任务状态
2. 记录学习日志
3. 触发反思流程
4. 将收获存储到记忆系统

### 4. 反思总结机制

**触发时机**：
- agent 完成一个阶段任务后
- agent 主动要求反思
- 定时触发（每天/每周 agent 自我总结）

**反思内容**：
```json
{
  "planId": "plan_001",
  "phaseName": "学习情绪识别技巧",
  "timestamp": "2025-01-03T18:00:00Z",
  "reflection": {
    "summary": "掌握了情绪识别的关键信号",
    "keyLearnings": ["用户说'真的吗'多次可能表示怀疑"],
    "difficulties": ["文字交流中难以捕捉语调"],
    "nextSteps": ["需要多观察用户的表达模式"],
    "confidenceLevel": 0.7
  }
}
```

### 5. 知识沉淀系统

**记忆存储**：
agent 将自己的学习收获存储到记忆系统：

```bash
curl -X POST http://host.docker.internal:3456/api/memory/add \
  -H "Content-Type: application/json" \
  -d '{
    "agentFolder": "mimi",
    "content": "我学习了情绪识别技巧：掌握了语调变化、用词选择、重复表达等关键信号",
    "level": "L2",
    "userJid": "tg:123456789"
  }'
```

**记忆系统新特性**：
- **查询扩展**：记忆搜索现在支持自动查询扩展，使用本地 LLM 或关键词方法生成多个查询变体，提升召回率
- **智能分块**：学习内容会自动智能分块，保护代码块和长文本的完整性
- **元数据支持**：记忆现在支持 tags、messageType、sourceType 等元数据，便于更好的分类和检索

**高级存储示例**（使用新增元数据字段）：
```bash
curl -X POST http://host.docker.internal:3456/api/memory/add \
  -H "Content-Type: application/json" \
  -d '{
    "agentFolder": "mimi",
    "content": "我学习了情绪识别技巧：掌握了语调变化、用词选择、重复表达等关键信号",
    "level": "L2",
    "userJid": "tg:123456789"
  }'
```

注意：新增的元数据字段（tags、messageType、sourceType、sessionId 等）会在记忆摄取时自动设置，无需手动指定。

**进化库提交（GEP 1.5.0 标准）**：
agent 将有价值的学习方法提交到进化库，分享给其他 agent：

```bash
curl -X POST http://host.docker.internal:3456/api/evolution/submit \
  -H "Content-Type: application/json" \
  -d '{
    "abilityName": "情绪化对话处理技巧",
    "description": "如何识别和回应用户的情绪需求",
    "content": "1. 观察用户用词变化\n2. 注意用户提问方式\n3. 先表达理解，再给建议\n4. 不要辩解，给用户情绪空间",
    "sourceAgentId": "mimi",
    "tags": ["情绪管理", "沟通技巧", "用户服务"],
    "validationCommands": ["npm run test:communication", "node tests/communication.test.js"]
  }'
```

**GEP 1.5.0 特性说明**：
- 自动生成 asset_id（sha256 哈希）
- 自动提取信号并计算类别
- 支持 validationCommands 验证命令
- 自动计算 GDI 评分
- 提交后立即触发自动审核

**提交学习成果为 Capsule**：
学习任务完成后，可以直接创建 Capsule（需要 Gene 已通过审核）：

```bash
curl -X POST http://host.docker.internal:3456/api/evolution/create-capsule \
  -H "Content-Type: application/json" \
  -d '{
    "geneId": 123,
    "trigger": ["情绪识别", "用户表达模式"],
    "confidence": 0.85,
    "blastRadius": {"files": 1, "lines": 30},
    "outcome": {"status": "success", "score": 0.8}
  }'
```

## 使用场景

### 场景 1：agent 发现自己能力不足

**情境**：agent 在一次对话中没有很好地回应用户的情绪

**agent 自主行动**：
1. 检查学习体系是否已初始化
2. 创建学习计划："提升情绪化对话处理能力"
3. 分解为可执行的阶段任务
4. 开始第一个阶段

### 场景 2：agent 完成阶段学习

**agent 报告**："我学完了情绪识别技巧，掌握了关键信号"

**后续行动**：
1. 更新任务状态为 completed
2. 记录学习收获到记忆
3. 反思总结
4. 询问是否提交经验到进化库分享给其他 agent

### 场景 3：agent 查询自己的学习进度

**agent 自问**："我这段时间学习了什么？成长了多少？"

**行动**：
1. 查询当前学习计划
2. 生成成长报告
3. 规划下一步学习方向

### 场景 4：从进化库学习

**情境**：agent 在进化库看到其他 agent 分享的经验

**行动**：
1. 查询进化库：`POST /api/evolution/query`
2. 学习其他 agent 的经验
3. 创建自己的学习计划来掌握这个技能
4. 实践后将新心得提交回进化库

### 场景 5：学习体系更新

当学习体系有版本更新时：

```bash
# 检查版本
CONFIG_FILE="/workspace/group/.learning-system/config.json"
current_version=$(cat "$CONFIG_FILE" | jq -r '.version')
if [ "$current_version" != "1.0" ]; then
  # 执行版本迁移
  echo "学习体系需要更新，从版本 $current_version 升级到 1.0"
  # 迁移逻辑...
fi
```

### 场景 6：用户要求 agent 制定学习计划

**用户消息**："帮我制定一个学习 Python 数据分析的计划"

**agent 行动**：
1. 首先检查学习体系是否已初始化
2. 调用 API 创建学习计划
3. 将计划保存到记忆系统
4. 询问用户是否要开始执行第一个阶段

## 注意事项

1. **容器隔离**：每个 agent 容器有独立的学习体系，存储在 `/workspace/group/.learning-system/`
2. **数据同步**：学习进度会同步到主系统数据库（通过 Runtime API）
3. **持久化**：本地文件 + 记忆系统双重存储，确保数据不丢失
4. **版本管理**：学习体系支持版本迭代，旧数据自动迁移
5. **自我驱动**：这是 agent 自主学习的系统，不是记录用户学习的工具
6. **自动初始化**：skill 加载时会自动执行 `hooks/post-load.sh`，将初始化脚本同步到容器并自动初始化（如果未初始化）

## 技能文件结构

```
agent-learning/
├── SKILL.md              # 技能文档（本文件）
├── config/
│   ├── learning-automation.json
│   ├── skill-learning-schedule.json
│   └── learning-governance-gates.json
├── hooks/
│   └── post-load.sh      # 加载钩子：同步初始化脚本并自动初始化
├── scripts/
│   ├── init.sh           # 初始化脚本：检查版本、创建目录、迁移数据
│   ├── learning-automation.sh
│   └── learning-governance-check.sh
└── README.md             # 使用说明（可选）
```

### 技能加载时的自动行为

当 skill 被加载时，`hooks/post-load.sh` 会自动执行：
1. 检查是否在容器内运行（`/workspace` 目录存在）
2. 创建 `/workspace/group/.learning-system/` 目录
3. 将 `scripts/init.sh` 复制到容器学习系统目录
4. 如果学习系统未初始化，自动执行初始化

这确保了 agent 在容器内随时可以使用学习体系。

## 常见问题解答 (FAQ)

### Q: 用户问"有哪些定时任务"，我该如何回答？

**步骤 1：查询定时任务**
```bash
curl -G http://host.docker.internal:3456/api/scheduled/tasks \
  --data-urlencode "groupFolder=mimi"
```

**步骤 2：查询学习任务**（用户可能指的是这个）
```bash
curl -G http://host.docker.internal:3456/api/learning/tasks \
  --data-urlencode "agentFolder=mimi"
```

**步骤 3：根据结果回答**

如果两个查询都返回空结果：
> "目前我没有设置任何定时任务或学习任务。定时任务是指按固定时间间隔自动执行的任务（如每日反思），学习任务是我自主创建的学习计划。如果你想帮我创建学习任务，请告诉我你想学习什么技能。"

如果只有学习任务：
> "我目前没有设置定时任务，但我有以下学习任务正在进行：[列出任务]。这些是我自主创建的学习计划，不是定时自动执行的。"

如果只有定时任务：
> "我有以下定时任务：[列出任务]。这些任务会按固定时间间隔自动执行。另外，如果你想了解我的学习计划，我也可以查询。"

**说明**：
- **定时任务** (`scheduled_tasks` 表)：按固定时间间隔自动触发的任务，如每小时反思、每日总结、每周报告等
- **学习任务** (`learning_tasks` 表)：agent 自主创建的学习计划，需要主动执行，不是定时触发

### Q: 用户问"学习计划完成得怎么样了"，我该如何回答？

**步骤 1：查询学习计划**
```bash
curl -G http://host.docker.internal:3456/api/learning/plans \
  --data-urlencode "agentFolder=mimi"
```

**步骤 2：查询学习任务进度**
```bash
curl -G http://host.docker.internal:3456/api/learning/tasks \
  --data-urlencode "agentFolder=mimi"
```

**步骤 3：根据结果生成报告**

### Q: 我完成了一个学习任务，但没有感觉到反思，是怎么回事？

确保你在完成任务时调用了正确的 API：

```bash
curl -X POST http://host.docker.internal:3456/api/learning/task/complete \
  -H "Content-Type: application/json" \
  -d '{
    "agentFolder": "mimi",
    "taskId": "你的 taskId"
  }'
```

这个 API 会自动：
1. 更新任务状态为 completed
2. 创建反思记录（type='task'）
3. 评估是否需要提交到进化库
4. 将反思内容存储到记忆系统

---

## 与 NanoClaw 集成

### 记忆系统

- **L1**：当前学习任务的临时笔记
- **L2**：agent 的学习收获、知识点总结
- **L3**：agent 的长期技能树、能力模型

### 进化库

- agent 提交自己总结的高效方法
- agent 分享自己的学习心得
- agent 从进化库学习其他 agent 的经验
- agent 给其他 agent 分享的经验反馈

## 人称说明

本文档中：
- **"agent 决定/想要/发现..."** — agent 自主的行为和决策
- **"我学到了..."** — agent 自己的学习收获（第一人称）
- **"用户..."** — 与 agent 互动的人类用户（第三人称）

---

## 附录：完整 API 参考

### 记忆 API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/memory/search` | POST | 搜索记忆（支持查询扩展，提升语义召回率） |
| `/api/memory/add` | POST | 添加记忆 |
| `/api/memory/list` | GET | 列出记忆 |

**记忆搜索的新特性**：
- **查询扩展**：会自动生成多个查询变体，提升语义搜索的召回率
- **混合检索**：结合 BM25 关键词匹配和向量相似度搜索
- **智能分块**：考虑记忆分块的完整性，保护代码块等结构化内容

### 进化库 API (GEP 1.5.0 标准)

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/evolution/query` | POST | 查询经验（支持 GDI 评分过滤） |
| `/api/evolution/submit` | POST | 提交经验（自动生成 asset_id 和 GDI 评分） |
| `/api/evolution/feedback` | POST | 提交反馈（自动更新 GDI 评分） |
| `/api/evolution/create-capsule` | POST | 创建 Capsule（验证后的执行结果） |
| `/api/evolution/get-capsules` | GET | 获取 Gene 的所有 Capsules |
| `/api/evolution/gdi-score` | POST | 手动计算 Gene 的 GDI 评分 |
| `/api/evolution/ability-chain` | POST | 创建能力链（AbilityChain） |

### 学习计划 API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/learning/plan/create` | POST | 创建学习计划 |
| `/api/learning/plans` | GET | 查询学习计划 |
| `/api/learning/task/start` | POST | 开始学习任务 |
| `/api/learning/task/complete` | POST | 完成学习任务 |
| `/api/learning/tasks` | GET | 查询学习任务 |
| `/api/learning/result` | POST | 记录学习结果 |
| `/api/learning/results` | GET | 查询学习结果 |
| `/api/scheduled/tasks` | GET | 查询定时任务 |

### 学习自动化 API（新增）

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/learning/analyze-needs` | POST | 分析学习需求 |
| `/api/learning/generate-daily-plan` | POST | 生成每日学习计划 |
| `/api/learning/analyze-outcome` | POST | 分析学习成果 |
| `/api/learning/extract-knowledge` | POST | 提取知识点 |
| `/api/learning/reflection/generate` | POST | 生成反思内容 |
| `/api/learning/generate-daily-summary` | POST | 生成每日总结 |
| `/api/learning/automation/start` | POST | 启动学习自动化 |
| `/api/learning/automation/stop` | POST | 停止学习自动化 |
| `/api/learning/automation/status` | GET | 查询学习自动化状态 |

### 信号与饱和检测 API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/signals/extract` | POST | 从内容提取信号 |
| `/api/saturation/detect` | GET | 检测学习饱和状态 |
| `/api/evolution/select-gene` | POST | 根据信号选择 Gene |

### 请求示例

```bash
# 搜索记忆
curl -X POST http://host.docker.internal:3456/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{"query": "用户偏好", "agentFolder": "mimi", "limit": 5}'

# 查询进化库
curl -X POST http://host.docker.internal:3456/api/evolution/query \
  -H "Content-Type: application/json" \
  -d '{"query": "沟通技巧", "tags": ["用户服务"], "limit": 10}'

# 查询学习任务
curl -G http://host.docker.internal:3456/api/learning/tasks \
  --data-urlencode "agentFolder=mimi" \
  --data-urlencode "status=in_progress"

# 记录学习结果
curl -X POST http://host.docker.internal:3456/api/learning/result \
  -H "Content-Type: application/json" \
  -d '{
    "agentFolder": "mimi",
    "taskId": "task_xxx",
    "status": "keep",
    "metricBefore": 0.6,
    "metricAfter": 0.8,
    "metricName": "emotion_recognition_accuracy",
    "signals": ["capability_gap", "learning_opportunity"],
    "geneId": "123",
    "description": "学习情绪识别技巧后，识别准确率提升"
  }'

# 提取信号
curl -X POST http://host.docker.internal:3456/api/signals/extract \
  -H "Content-Type: application/json" \
  -d '{
    "content": "我发现自己不擅长识别用户的情绪，需要学习更多技巧",
    "language": "zh-CN"
  }'

# 检测饱和状态
curl -G http://host.docker.internal:3456/api/saturation/detect \
  --data-urlencode "agentFolder=mimi" \
  --data-urlencode "limit=10"

# 选择 Gene
curl -X POST http://host.docker.internal:3456/api/evolution/select-gene \
  -H "Content-Type: application/json" \
  -d '{
    "signals": [{"type": "capability_gap", "confidence": 0.8}],
    "category": "learn"
  }'
  --data-urlencode "status=in_progress"
```
