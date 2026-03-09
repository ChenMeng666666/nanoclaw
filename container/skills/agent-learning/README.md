# Agent Learning Skill - 可持续自我学习成长体系

## 概述

这个 skill 为 NanoClaw agent 提供了一个完整的可持续自我学习成长体系，包括：

- **学习计划管理** - 创建、执行、追踪学习计划
- **任务执行系统** - 分解目标、执行任务、记录进度
- **反思总结机制** - 定期反思、总结收获、生成洞见
- **知识沉淀系统** - 存储记忆、提交经验到进化库

## 安装与部署

### 自动部署（推荐）

当 skill 被应用到 NanoClaw 时，初始化脚本会自动同步到容器：

1. Skill 加载时，`hooks/post-load.sh` 自动执行
2. 初始化脚本复制到 `/workspace/group/.learning-system/init.sh`
3. 如果学习系统未初始化，自动执行初始化

### 手动部署

```bash
# 1. 确保 skill 已应用到 NanoClaw
npx tsx scripts/apply-skill.ts container/skills/agent-learning

# 2. 重新构建容器（如需要）
./container/build.sh

# 3. 重启 NanoClaw 服务
npm run build
# 然后根据系统使用 launchctl 或 systemctl 重启
```

## 使用方式

### 在容器内初始化学习体系

```bash
# 方式 A：使用初始化脚本（推荐）
bash /workspace/group/.learning-system/init.sh

# 方式 B：手动初始化
mkdir -p /workspace/group/.learning-system
echo '{"version":"1.0","initializedAt":"'$(date -Iseconds)'"}' > /workspace/group/.learning-system/config.json
touch /workspace/group/.learning-system/initialized
```

### 创建学习计划

```bash
curl -X POST http://host.docker.internal:3456/api/learning/plan/create \
  -H "Content-Type: application/json" \
  -d '{
    "agentFolder": "mimi",
    "topic": "提升情绪化对话处理能力",
    "goal": "更好地理解和回应用户的情绪需求",
    "phases": [
      {"name": "学习情绪识别技巧", "status": "pending", "order": 1}
    ],
    "estimatedDuration": "2 周"
  }'
```

### 执行学习任务

```bash
# 开始任务
curl -X POST http://host.docker.internal:3456/api/learning/task/start \
  -H "Content-Type: application/json" \
  -d '{"agentFolder": "mimi", "taskId": "xxx", "phaseName": "学习情绪识别技巧"}'

# 完成任务并记录反思
curl -X POST http://host.docker.internal:3456/api/learning/task/complete \
  -H "Content-Type: application/json" \
  -d '{
    "agentFolder": "mimi",
    "taskId": "xxx",
    "phaseName": "学习情绪识别技巧",
    "reflection": {"summary": "掌握了关键信号"},
    "timeSpent": "1 小时"
  }'
```

### 查询学习进度

```bash
# 查看学习计划
curl -G http://host.docker.internal:3456/api/learning/plans \
  --data-urlencode "agentFolder=mimi"

# 查看学习任务
curl -G http://host.docker.internal:3456/api/learning/tasks \
  --data-urlencode "agentFolder=mimi"
```

## 版本管理

学习体系支持版本迭代，当前最新版本：**1.0**

### 版本检测

```bash
# 检查当前版本
cat /workspace/group/.learning-system/config.json | jq -r '.version'
```

### 版本迁移

当检测到版本更新时，初始化脚本会自动执行迁移逻辑。

## 故障排查

### 学习系统未初始化

```bash
# 手动执行初始化
bash /workspace/group/.learning-system/init.sh
```

### Runtime API 不可用

```bash
# 测试 API 连接
curl http://host.docker.internal:3456/api/memory/list?agentFolder=test
```

### 容器内缺少 jq

```bash
# 在容器内安装 jq（Debian/Ubuntu）
apt-get update && apt-get install -y jq

# 或使用手动初始化的方式（不需要 jq）
```

## 文件结构

```
agent-learning/
├── SKILL.md              # 技能主文档
├── README.md             # 本文件
├── hooks/
│   └── post-load.sh      # 加载钩子脚本
├── scripts/
│   └── init.sh           # 初始化脚本
└── tests/                # 测试脚本（未来添加）
```

## 与记忆系统集成

学习体系会将学习计划和反思内容自动存储到记忆系统：

- **L1 记忆**：临时笔记（任务开始/结束通知）
- **L2 记忆**：学习内容、知识点总结
- **L3 记忆**：长期技能树、能力模型（通过进化库）

## 与进化库集成

agent 可以将学习收获提交到进化库分享给其他 agent：

```bash
curl -X POST http://host.docker.internal:3456/api/evolution/submit \
  -H "Content-Type: application/json" \
  -d '{
    "abilityName": "情绪化对话处理技巧",
    "content": "1. 观察用户用词变化\n2. 先表达理解，再给建议",
    "sourceAgentId": "mimi",
    "tags": ["情绪管理", "沟通技巧"]
  }'
```

## 开发指南

### 添加新的版本迁移逻辑

编辑 `scripts/init.sh`，在 `migrate_version()` 函数中添加：

```bash
case "$FROM_VERSION" in
    "1.0")
        # 从 1.0 升级到 1.1 的迁移逻辑
        log_info "执行 1.0 -> 1.1 迁移..."
        # 迁移代码...
        ;;
esac
```

### 添加新的 API 端点

编辑 `src/runtime-api.ts`，添加新的路由处理逻辑。

## 常见问题

**Q: 学习体系存储在容器的哪个位置？**
A: `/workspace/group/.learning-system/`

**Q: 容器重启后学习数据会丢失吗？**
A: 不会。数据存储在持久化卷中，同时重要的学习进度会同步到主系统数据库。

**Q: 如何让多个 agent 共享学习体系？**
A: 每个 agent 有独立的学习体系，但可以通过进化库分享经验。

**Q: 学习计划有数量限制吗？**
A: 没有硬性限制，但建议保持活跃计划不超过 5 个，避免分散注意力。

## 许可证

与 NanoClaw 主项目相同。
