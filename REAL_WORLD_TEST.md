# 🎯 真实用户场景测试 - 完整指南

## 📋 前置条件确认

✅ Telegram Bot 已创建: @claw_test_claw_bot
✅ Token: 8558578680:AAGwLxSGXxnurUdm49Qxye584gIrPZtBVw4
✅ Agent「米米」已创建并绑定到 main group
✅ 依赖已安装

---

## 🚀 开始测试

### 第一步：在 Telegram 中获取 Chat ID

1. 打开 Telegram 应用
2. 搜索 `@claw_test_claw_bot` 并打开对话
3. 发送 `/chatid` 命令
4. 机器人会回复你的 Chat ID（格式类似 `tg:123456789`）

### 第二步：注册你的真实对话

创建一个临时脚本 `register-my-chat.ts`：

```typescript
import { initDatabase, setRegisteredGroup } from './src/db.js';
import { RegisteredGroup } from './src/types.js';

initDatabase();

// 【重要】把这里换成你在 Telegram 中实际获得的 Chat ID！
const YOUR_CHAT_ID = 'tg:123456789';

const yourGroup: RegisteredGroup = {
  name: '我的真实对话',
  folder: 'main',
  trigger: '@米米',
  added_at: new Date().toISOString(),
  isMain: true,
  requiresTrigger: false
};

setRegisteredGroup(YOUR_CHAT_ID, yourGroup);
console.log('✅ 成功注册你的真实对话！');
```

运行它：
```bash
npx tsx register-my-chat.ts
```

### 第三步：启动真实系统

```bash
npm run dev
```

### 第四步：真实用户场景对话测试

现在回到 Telegram 里和 @claw_test_claw_bot 聊天：

#### 📝 测试场景 1：心情不好
**发送**：`米米，我今天好烦`

**预期的米米风格响应**：
> 来，靠在姐姐怀里，告诉我发生什么事了。天塌下来有我顶着呢。

#### 📝 测试场景 2：职业决策
**发送**：`我要不要辞掉这份工作？`

**预期的米米风格响应**：
> 辞！这种破工作留着过年吗？姐姐支持你，你值得更好的。

#### 📝 测试场景 3：犹豫不决
**发送**：`可是我怕找不到更好的`

**预期的米米风格响应**：
> 怕个屁！你这么优秀，大把机会等着你。来，我们一起列个计划，姐姐陪你一步一步来。

---

## 🔍 验证系统状态

### 检查日志
```bash
# 在另一个终端窗口查看日志
tail -f logs/*.log
```

### 检查数据库
```bash
# 查看 Agent 和消息记录
sqlite3 store/messages.db "
  SELECT id, name, system_prompt FROM agents;
  SELECT sender, content, timestamp FROM messages ORDER BY timestamp DESC LIMIT 10;
"
```

---

## ✅ 验证检查清单

**米米的个性是否符合预期？**
- [ ] 温暖、护短的语气
- [ ] 第一人称，直接明确的建议
- [ ] 不含糊，拒绝"这取决于"的回答方式
- [ ] 可能包含一些"粗话"（如"怕个屁"）来增强个性
- [ ] 符合"大姐大"的人设

**系统是否正常工作？**
- [ ] 使用了 Agent 的 system_prompt（在 logs 中确认）
- [ ] 消息通过 Telegram 渠道正确传输
- [ ] 回复被正确记录到数据库
- [ ] 容器使用正确的 Agent 配置

---

## 🐛 故障排查

### 机器人不回复
```bash
# 检查 TELEGRAM_BOT_TOKEN 是否设置正确
cat .env | grep TELEGRAM

# 确认 npm run dev 在运行
ps aux | grep "npm run dev"

# 查看错误日志
tail -f logs/*.log
```

### Agent 的 system_prompt 没生效
```bash
# 检查 Agent 是否正确绑定到 main group
sqlite3 store/messages.db "
  SELECT a.name, aga.group_folder, aga.is_primary
  FROM agents a
  LEFT JOIN agent_group_associations aga ON a.id = aga.agent_id;
"
```

### 重新开始测试
```bash
# 停止系统
pkill -f "npm run dev"

# 清理测试数据（可选）
sqlite3 store/messages.db "
  DELETE FROM messages;
  DELETE FROM agent_group_associations;
  DELETE FROM agents;
"

# 重新运行配置脚本
npx tsx setup-real-test.ts
```
