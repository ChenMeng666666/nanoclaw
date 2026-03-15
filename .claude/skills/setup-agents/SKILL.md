# Setup Agents Skill

为 NanoClaw 创建和管理多智能体配置。支持创建新智能体、编辑现有智能体。

## 核心能力

本 Skill 会自动为新 Agent 配置以下高级能力：

1. **记忆系统 (ContextEngine)**: 自动集成长期/短期记忆管理，无需手动配置。
2. **学习系统 (Learning Automation)**: 启用定期反思与学习计划生成。
3. **进化系统 (Evolution)**: 接入共享经验库，实现跨 Agent 知识复用。
4. **安全鉴权**: 自动注入 `RUNTIME_API_KEY`，保障 API 调用安全。

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
4. **配置通道** - (可选) 绑定独立的 bot 实例，推荐使用专用 Skill

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

【推荐】建议使用专用 Skill 添加通道，因为它们会自动处理认证和 JID 格式。
  - Telegram: /add-telegram
  - WhatsApp: /add-whatsapp
  - Slack:    /add-slack
  - Discord:  /add-discord

现在跳过通道配置？(y=跳过 (推荐), n=手动配置):
```

### 步骤 4：启用高级功能
```
=== 启用高级功能 ===

NanoClaw 提供以下高级功能：
  1. 记忆系统 (ContextEngine) - 自动管理短期/长期记忆，无需手动干预
  2. 学习系统 (Learning Automation) - 定期反思，自动生成学习任务
  3. 进化系统 (Evolution) - 共享经验库，与其他 agent 分享有效方法

注意：启用后，系统会自动配置运行时 API 和鉴权信息。

要启用这些功能吗？(1=全部启用 (推荐), 2=跳过，3=自定义):
```

---

## 产物说明

### CLAUDE.md
生成的认知文件会自动包含：
- Agent 身份定义
- 高级能力说明（ContextEngine/Learning/Evolution）
- 开发指南（API 地址、鉴权方式）

### 数据库记录
- `agents` 表：存储基础配置和凭证。
- `channel_instances` 表：存储通道绑定关系。

---

## 注意事项

1. **环境变量**：运行前需设置 `NANOCLAW_ENCRYPTION_KEY`
   ```bash
   export NANOCLAW_ENCRYPTION_KEY=$(openssl rand -hex 32)
   ```
   > 提示：这与 `setup` skill 中的全局配置不同，是专为多 Agent 场景提供的安全增强。

2. **通道配置**：脚本中虽保留手动配置选项，但**强烈建议跳过**，改用 `/add-telegram`、`/add-whatsapp` 等专用 Skill。这些 Skill 会自动处理认证、JID 格式校验和依赖安装。

3. **容器与 API**：
   - Agent 将运行在 `setup` 阶段选择的容器运行时中（Docker 或 Apple Container）。
   - 生成的 `CLAUDE.md` 中包含 API 调用示例。请注意，API 地址（默认为 `http://host.docker.internal:3456`）可能需根据实际运行时环境微调（例如在某些 Linux 环境下可能需要使用网关 IP）。
   - 容器会自动注入 `RUNTIME_API_KEY`。所有 API 调用必须在请求头中包含 `X-API-Key: $RUNTIME_API_KEY`。

4. **生效方式**：修改配置后需运行 `npm run build` 并重启服务：
   ```bash
   npm run build
   # macOS
   launchctl kickstart -k gui/$(id -u)/com.nanoclaw
   # Linux
   systemctl --user restart nanoclaw
   ```
