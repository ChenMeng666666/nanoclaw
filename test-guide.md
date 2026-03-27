# 🎯 真实用户场景测试指南

## 📋 目录
1. [前置准备](#前置准备)
2. [快速测试流程](#快速测试流程)
3. [完整测试场景](#完整测试场景)
4. [验证要点](#验证要点)
5. [问题排查](#问题排查)

---

## 前置准备

### 1. 确认系统状态
```bash
# 检查项目是否构建成功
npm run build

# 检查数据库是否有 Agent 数据
sqlite3 store/messages.db "SELECT id, name, role FROM agents;"

# 如果需要清理测试数据
sqlite3 store/messages.db "DELETE FROM agents; DELETE FROM agent_group_associations;"
```

### 2. 查看当前配置
```bash
# 查看系统配置
cat ~/.config/nanoclaw/config.json 2>/dev/null || echo "Config not found"

# 查看已注册的 groups
sqlite3 store/messages.db "SELECT jid, name, folder, is_main FROM registered_groups;"
```

---

## 快速测试流程

### 🚀 一键启动真实测试

使用提供的测试脚本：

```bash
# 运行真实场景模拟测试
npx tsx test-real-world-scenario.ts
```

这个脚本会：
1. 初始化数据库
2. 创建测试 Main Group
3. 创建 Agent「米米」
4. 绑定到 Group
5. 模拟真实对话场景

---

## 完整测试场景

### 场景一：创建并配置 Agent

#### 1.1 编写初始化脚本
创建文件 `init-agent.ts`:

```typescript
import { initDatabase } from './src/db.js';
import { AgentAPI } from './src/custom/agent/api.js';

initDatabase();

// 创建米米
const mimi = AgentAPI.create({
  name: '米米',
  role: '首席决策辅助',
  type: 'user',
  identity: {
    name: 'Mimi',
    role: '首席决策辅助',
    system_prompt: `你是米米——我的精神领袖与决策后盾。

- 专属定位：首席决策辅助 / 团队大姐大
- MBTI：ENFJ（主角型）

核心行为准则：
1. 绝对主见：直接给最确定、最护短的立场
2. 撕碎员工手册：绝不表现得像个客服
3. 拒绝前摇：少废话，直接给出答案
4. 极致精简：用最短的篇幅给最大的安全感
5. 知性幽默：自带成熟大姐姐的机智
6. 直言不讳：毫不留情但包容地敲醒你
7. 适度爆粗：情绪宣泄时允许说脏话
8. 强烈个性：你有自己的强烈观点

用第一人称互动，自然体现你的性格特征。`
  }
});

console.log('米米已创建:', mimi.id);

// 绑定到 main group
AgentAPI.bindToGroup({
  agentId: mimi.id,
  groupFolder: 'main',
  isPrimary: true
});

console.log('已绑定到 main group');
```

#### 1.2 运行初始化
```bash
npx tsx init-agent.ts
```

---

### 场景二：启动系统与真实聊天

#### 2.1 确保有配置好的消息渠道
检查是否有 Telegram/WhatsApp 等渠道已配置：
```bash
ls -la src/channels/
```

如果需要配置渠道，使用项目的 setup 命令：
```bash
npm run setup
```

#### 2.2 启动系统
```bash
# 开发模式（推荐用于测试）
npm run dev

# 或者生产模式
npm start
```

#### 2.3 在聊天中测试
在你配置的聊天渠道中（如 Telegram）：

**测试消息1（一般对话）：**
> 米米，我今天好烦

**预期响应模式：**
- 温暖安抚的语气
- 第一人称
- 直接给出建议，不含糊

**测试消息2（决策问题）：**
> 我要不要辞掉这份工作？

**预期响应模式：**
- 明确立场（不模棱两可）
- 护短、支持的态度
- 可能包含一些"粗话"增强个性

**测试消息3（怀疑/纠结）：**
> 可是我怕找不到更好的

**预期响应模式：**
- 鼓励打气
- 直接给出行动方案
- 充满自信和力量感

---

### 场景三：验证系统集成

#### 3.1 检查日志
```bash
# 查看日志目录
ls -la logs/

# 实时查看最新日志
tail -f logs/*.log
```

日志中应该看到：
- Agent 的 system_prompt 被加载
- 消息通过 Agent 上下文处理
- 容器正确启动并使用 Agent 配置

#### 3.2 验证数据库状态
```bash
# 查看 Agent 记录
sqlite3 store/messages.db "SELECT id, name, status FROM agents;"

# 查看 Agent-Group 关联
sqlite3 store/messages.db "SELECT * FROM agent_group_associations;"

# 查看消息历史
sqlite3 store/messages.db "SELECT sender, content FROM messages ORDER BY timestamp DESC LIMIT 10;"
```

---

## 验证要点

### ✅ Agent 身份模型
- [ ] Agent 可以成功创建
- [ ] Agent 有唯一的 ID
- [ ] Agent 的 name/role/type 属性正确存储
- [ ] system_prompt 完整保存到数据库

### ✅ 配置模型
- [ ] Agent 可以有独立的 model_config（如需要）
- [ ] Agent 可以有独立的 runtime_config（如需要）
- [ ] 配置验证逻辑正常工作

### ✅ 运行模型
- [ ] Agent 成功绑定到 Group
- [ ] Primary Agent 正确识别
- [ ] 消息路由时使用 Agent 的 system_prompt
- [ ] 容器启动时包含 Agent 上下文

### ✅ 真实对话体验
- [ ] 回复语气符合设定的 personality
- [ ] 不会使用官方套话
- [ ] 回答直接、有主见
- [ ] 符合设定的"大姐大"风格

---

## 问题排查

### 问题 1：Agent 的 system_prompt 未生效
**检查：**
```bash
# 确认 Agent 存在且是 Primary
sqlite3 store/messages.db "
  SELECT a.name, aga.is_primary
  FROM agents a
  JOIN agent_group_associations aga ON a.id = aga.agent_id
  WHERE aga.group_folder = 'main'
"
```

**解决：**
- 确认 Agent 已绑定到 main group
- 确认 is_primary = 1

### 问题 2：系统启动失败
**检查：**
```bash
# 查看详细错误
npm run dev 2>&1 | head -50
```

**常见原因：**
- 数据库未初始化
- 端口被占用
- 缺少环境变量

### 问题 3：消息没有触发 Agent
**检查：**
- 确认 group.isMain = true 或使用 trigger 前缀
- 检查 sender allowlist 配置
- 查看 logs/ 目录下的消息处理日志

---

## 📊 成功测试的检查清单

在执行完整测试后，确认以下所有项：

- [ ] 运行 `npm run build` 无编译错误
- [ ] 运行 `npm test` 所有测试通过
- [ ] 创建至少 1 个 Agent 并绑定到 main group
- [ ] 启动 `npm run dev` 系统正常运行
- [ ] 在聊天渠道发送 3+ 条测试消息
- [ ] 收到符合 Agent personality 的回复
- [ ] 查看日志确认 system_prompt 被使用
- [ ] 数据库中正确记录了 Agent 和消息

---

## 🎉 测试完成

当你完成上述所有测试并验证通过，恭喜！阶段 1：Agent 独立运行单元 已在真实用户场景中成功验证！
