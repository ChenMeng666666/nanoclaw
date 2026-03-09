# Setup Agents Skill

为 NanoClaw 创建和管理多智能体配置。支持创建新智能体、编辑现有智能体、配置通信通道。

## 触发条件

- "创建智能体"、"添加 agent"、"setup agent"
- "编辑智能体"、"修改 agent 配置"
- "配置多个 bot"、"多智能体"
- "管理智能体"、"列出 agent"

## 使用方式

```bash
# 直接运行脚本
npx tsx scripts/setup-agent.ts
```

## 功能

1. **创建/选择智能体** - 启动时显示现有 agent 列表，可选择创建新 agent 或编辑现有 agent
2. **身份定义** - 用户输入的完整"我是谁"描述直接写入 CLAUDE.md
3. **配置认证** - 设置独立的 Anthropic API 凭证（或使用全局配置）
4. **配置通道** - 绑定独立的 bot 实例（Telegram/WhatsApp/Slack/Discord）

---

## 交互流程

### 步骤 0：创建或编辑
```
=== NanoClaw 智能体管理 ===

发现 1 个现有智能体：

  1. mimi (folder: mimi)

要做什么？(1= 创建新智能体，2= 编辑现有智能体，回车= 创建新智能体):
```

### 步骤 1：定义身份
```
=== 定义你的身份 ===
请用一段话完整描述 "你是谁"，这将直接写入 CLAUDE.md

建议包含：
  - 你的名字/称呼
  - 性格特点
  - 价值观/原则
  - 外貌形象（可选）
  - 行为准则/说话风格

请输入完整的 "我是谁" 描述：
```

**重要**：用户输入的内容将**完整**保存到 `groups/{folder}/CLAUDE.md` 中，后续只能手动编辑该文件修改。

### 步骤 2：配置 API
```
=== 配置 Anthropic API ===

使用全局 ANTHROPIC 配置？(y/n，默认 y):
```

### 步骤 3：配置通道
```
=== 配置通信通道 ===

这将把通道绑定到智能体 "xxx"
每个智能体对应一个独立的 bot（如 @mimi_bot）

现在跳过通道配置？(y/n，通道可稍后通过 /add-telegram 等 skill 添加):
```

---

## 数据结构

### agents 表
| 字段 | 说明 |
|------|------|
| id | agent 唯一标识 |
| name | 智能体名字 |
| folder | 工作区 folder 名 |
| personality | 性格（从 identity 解析） |
| values | 价值观（从 identity 解析） |
| anthropic_* | API 凭证（加密存储） |

### channel_instances 表
| 字段 | 说明 |
|------|------|
| id | 通道实例 ID |
| agent_id | 关联的 agent |
| channel_type | telegram/whatsapp/slack/discord |
| bot_id | Bot 标识（如 token） |
| jid | 通道 JID |
| mode | dm/group/both |

---

## 文件结构

```
groups/{agent_folder}/
  CLAUDE.md          # 认知文件（用户输入完整写入）
  .claude/           # agent 工作区

store/messages.db    # SQLite 数据库
  - agents           # agent 配置
  - channel_instances # 通道映射
  - memories         # 分层记忆
  - evolution_log    # 进化日志
```

---

## 注意事项

1. **环境变量**：运行前需设置 `NANOCLAW_ENCRYPTION_KEY`
   ```bash
   export NANOCLAW_ENCRYPTION_KEY=$(openssl rand -hex 32)
   ```

2. **CLAUDE.md**：用户输入的 identity 完整写入此文件，后续修改需手动编辑

3. **通道配置**：可跳过，稍后使用对应 skill 添加：
   - `/add-telegram`
   - `/add-whatsapp`
   - `/add-slack`
   - `/add-discord`

4. **生效方式**：修改后需运行 `npm run build` 并重启服务

---

## 示例

### 创建新 agent

```bash
npx tsx scripts/setup-agent.ts

# 输入：
# 1. 名字：Andy
# 2. 身份：我是 Andy，一个幽默风趣的助手...
# 3. API 配置：y（使用全局）
# 4. 通道配置：y（跳过）
```

### 编辑现有 agent

```bash
npx tsx scripts/setup-agent.ts

# 输入：
# 1. 要做什么：2（编辑）
# 2. 选择编号：1
# 3. 如何修改：1（覆盖重写）
# 4. 输入新内容...
```
