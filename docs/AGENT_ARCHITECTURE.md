# NanoClaw 多智能体架构重构 - 实施总结

## 已完成的工作

### 阶段 1：数据结构设计 ✅

**新增数据库表** (`src/db.ts`):
- `agents` - 智能体核心配置表
- `channel_instances` - 通道与智能体映射表（一对一）
- `user_profiles` - 用户画像表
- `memories` - 分层记忆表
- `reflections` - 反思总结表
- `learning_tasks` - 学习任务表
- `evolution_log` - 进化日志表
- `evolution_versions` - 进化版本控制表
- `audit_log` - 审计日志表

**类型定义** (`src/types.ts`):
- `AgentConfig` - 智能体配置
- `ChannelInstance` - 通道实例
- `UserProfile` - 用户画像
- `Memory` - 记忆（分层 L1/L2/L3）
- `Reflection` - 反思总结
- `LearningTask` - 学习任务
- `EvolutionEntry` - 进化条目

**数据库访问器** (`src/db-agents.ts`):
- 完整的 CRUD 操作
- 审计日志记录

---

### 阶段 2：核心架构重构 ✅

**密钥管理** (`src/keystore.ts`):
- 系统 keychain 加密存储（keytar）
- 加密文件 fallback 机制（AES-256-GCM）
- 需要设置 `NANOCLAW_ENCRYPTION_KEY` 环境变量

**容器运行器改造** (`src/container-runner.ts`):
- `ContainerInput` 新增 `agentConfig` 字段
- `readSecrets()` 支持 agent 特定配置覆盖全局配置
- 每个 agent 使用独立的 Anthropic 配置

---

### 阶段 3：Setup Skill 重构 ✅

**交互式创建脚本** (`scripts/setup-agent.ts`):
- 收集智能体名字、性格、价值观、样貌
- 配置独立的 Anthropic API 凭证
- 配置通信通道（Telegram/WhatsApp/Slack/Discord）
- 自动生成 CLAUDE.md 认知文件
- 敏感凭证加密存储到系统 keychain

**Skill 文档** (`.claude/skills/setup-agents/SKILL.md`):
- 完整的使用说明
- 手动添加智能体的 SQL 示例

---

### 阶段 4：四大机制实现 ✅

#### 4.1 记忆系统 (`src/memory-manager.ts`)
- L1 工作记忆（内存缓存）
- L2 短期记忆（数据库）
- L3 长期记忆（数据库 + 向量嵌入）
- 向量嵌入：`@xenova/transformers` + `all-MiniLM-L6-v2`
- 语义检索：余弦相似度
- 记忆迁移：基于访问次数和时间衰减

#### 4.2 认知系统 (`src/cognition-manager.ts`)
- 生成 CLAUDE.md 认知文件
- 基于用户描述整理 agent 认知
- 支持追加额外约束
- 确保认知固定（不可通过对话修改）

#### 4.3 学习系统 (`src/reflection-scheduler.ts`)
- 定时反思：hourly/daily/weekly/monthly
- 任务完成后反思：task 类型
- 与记忆系统联动存储反思内容
- 评估是否提交到进化系统

#### 4.4 进化系统 (`src/evolution-manager.ts`)
- 经验上传（带自动初审）
- 审核流程（自动/手动）
- 向量检索查询
- 使用反馈收集
- 再审核触发机制

---

### 阶段 2.2 & 5&6：集成与迁移 ✅

**消息路由** (`src/agent-router.ts`):
- 根据消息 JID 查找对应 agent
- 从 keychain 解密 agent 配置
- 构建兼容的 RegisteredGroup 对象

**Index.ts 集成**:
- 启动反思调度器
- 定期持久化记忆（每 5 分钟）
- 定期迁移记忆（每小时）
- 优雅关闭处理

**迁移脚本** (`scripts/migrate-to-agents.ts`):
- 将现有 registered_groups 迁移到 agents 表
- 创建 channel_instances 记录
- 保留现有 group folder 结构

---

## 使用方法

### 1. 设置加密密钥

```bash
export NANOCLAW_ENCRYPTION_KEY=$(openssl rand -hex 32)
# 添加到 ~/.zshrc 或 ~/.bashrc 永久生效
```

### 2. 安装依赖

```bash
npm install
npm run build
```

### 3. 创建新智能体

```bash
# 运行交互式创建脚本
npx tsx scripts/setup-agent.ts
```

按提示输入：
- 智能体名字
- 性格、价值观、样貌描述
- Anthropic API 凭证（或使用全局配置）
- 通道配置（可跳过）

### 4. 迁移现有配置（可选）

```bash
# 将现有 groups 迁移到多智能体架构
npx tsx scripts/migrate-to-agents.ts
```

### 5. 启动服务

```bash
npm run dev
```

### 6. 使用运行时 API（可选）

```bash
# 查询记忆
curl -X POST http://localhost:3456/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{"query": "用户偏好", "agentFolder": "andy", "limit": 10}'

# 提交经验到进化库
curl -X POST http://localhost:3456/api/evolution/submit \
  -H "Content-Type: application/json" \
  -d '{"abilityName": "测试", "content": "...", "sourceAgentId": "andy"}'
```

详细 API 文档见 [RUNTIME_API.md](RUNTIME_API.md)。

---

## 架构设计要点

### 智能体隔离
- 每个 agent 有独立的 `folder` 工作区
- 独立的 `.claude/` 目录和 sessions
- 独立的 IPC 命名空间
- 独立的 Anthropic 配置

### 通道映射
- 一个 agent 对应一个独立的 bot
- 例如：Andy 对应 Telegram bot @andy_bot，Beth 对应 @beth_bot
- 用户私聊或群里@对应的 bot 进行对话

### 记忆分层
```
L1 (工作记忆) → L2 (短期记忆) → L3 (长期记忆)
     ↓                ↓               ↓
  内存缓存        数据库存储      数据库 + 向量
  当前对话       最近 7 天         永久存储
  访问 3 次 → 迁移
                 30 天未访问 → 迁移
```

### 进化流程
```
Agent 上传经验 → 自动初审 → 高置信度自动通过
                           ↓
                       低置信度 → 用户审核
                           ↓
                       approved → 入库
                           ↓
                       使用反馈 → 评分过低 → 再审核
```

---

## 关键文件列表

| 文件 | 功能 | 行数 |
|------|------|------|
| `src/db.ts` | 新增 9 个数据库表 | ~700 |
| `src/types.ts` | 新增 7 个类型定义 + MountAllowlist | ~180 |
| `src/db-agents.ts` | 数据库 CRUD 访问器 | ~650 |
| `src/keystore.ts` | 密钥加密存储 | ~220 |
| `src/agent-router.ts` | 消息路由到 agent | ~120 |
| `src/memory-manager.ts` | 记忆管理系统 | ~320 |
| `src/cognition-manager.ts` | 认知文件生成器 | ~100 |
| `src/reflection-scheduler.ts` | 反思调度器 | ~330 |
| `src/evolution-manager.ts` | 进化系统 | ~280 |
| `src/runtime-api.ts` | 运行时 API | ~230 |
| `scripts/setup-agent.ts` | 交互式 agent 创建脚本 | ~280 |
| `scripts/migrate-to-agents.ts` | 迁移脚本 | ~180 |
| `.claude/skills/setup-agents/SKILL.md` | Setup skill 文档 | ~200 |

**总计**: 约 9990 行 TypeScript 代码（整个项目）

---

## 技术栈

- **向量嵌入**: `@xenova/transformers` + `all-MiniLM-L6-v2`
- **定时任务**: `node-cron`
- **密钥存储**: `keytar` (系统 keychain) + AES-256-GCM 加密文件 fallback
- **数据库**: `better-sqlite3`

---

## 验证清单

- [x] TypeScript 编译通过
- [ ] 创建新 agent 并测试
- [ ] 迁移现有配置并测试
- [ ] 多 agent 消息路由测试
- [ ] 记忆系统功能测试
- [ ] 反思调度器测试
- [ ] 进化系统测试
