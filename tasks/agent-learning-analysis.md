# Agent-Learning 技能问题分析与修复记录

## 用户报告的问题

### 问题 1: 米米重复回复相同内容
**症状**: 用户和米米对话一句，她同样的回复了几次

**根本原因分析**:
- `GroupQueue.scheduleRetry()` 在容器失败时重试
- 即使已发送部分输出给用户，重试仍会触发
- 导致相同的响应被发送多次

**修复方案**:
在 `GroupQueue` 中添加 `outputSent` 标志，跟踪是否已发送输出给用户：
1. 在 `runForGroup` 方法中，处理开始时重置标志
2. 在 `processGroupMessages` 中，发送输出时调用 `queue.markOutputSent()`
3. 当处理失败但 `outputSent = true` 时，跳过重试，防止重复响应

**修复状态**: ✅ 已修复

**修改文件**:
- `src/group-queue.ts` - 添加 `outputSent` 标志和 `markOutputSent()`, `hasOutputSent()` 方法
- `src/index.ts` - 在发送输出时调用 `queue.markOutputSent(chatJid)`

---

### 问题 2: 学习计划不会自动定时学习，也没有定时反思总结
**症状**: 创建学习计划后，没有自动安排定时学习任务，完成学习后也没有反思

**修复状态**: ✅ 已修复

---

## 已完成的修复 (2026-03-09)

### 修复 1: 重复响应问题 ✅

**修改文件**:
- `src/group-queue.ts`
- `src/index.ts`

**实现细节**:

1. **添加 `outputSent` 标志到 `GroupState`**:
```typescript
interface GroupState {
  // ... existing fields
  outputSent: boolean;
}
```

2. **添加 `markOutputSent` 方法**:
```typescript
markOutputSent(groupJid: string): void {
  const state = this.getGroup(groupJid);
  state.outputSent = true;
}
```

3. **修改 `runForGroup` 方法，跳过已发送输出的重试**:
```typescript
try {
  const success = await this.processMessagesFn(groupJid);
  if (success) {
    state.retryCount = 0;
    state.outputSent = false;
  } else {
    // Only retry if output was not sent to user
    if (state.outputSent) {
      logger.warn({ groupJid }, 'Processing failed but output was sent, skipping retry');
      state.retryCount = 0;
      state.outputSent = false;
    } else {
      this.scheduleRetry(groupJid, state);
    }
  }
} catch (err) {
  // Only retry if output was not sent to user
  if (state.outputSent) {
    logger.warn({ groupJid, err }, 'Error but output was sent, skipping retry');
    state.outputSent = false;
  } else {
    this.scheduleRetry(groupJid, state);
  }
}
```

4. **在 `processGroupMessages` 中调用 `markOutputSent`**:
```typescript
if (text) {
  await channel.sendMessage(chatJid, text);
  outputSentToUser = true;
  queue.markOutputSent(chatJid);  // 标记已发送输出
}
```

### 修复 2: 学习计划自动创建定时任务 ✅

**修改文件**:
- `src/db-agents.ts` - 添加 `createScheduledTaskForLearning()` 函数
- `src/runtime-api.ts` - 修改 `/api/learning/plan/create` 端点
- `container/skills/agent-learning/SKILL.md` - 更新文档说明

**实现细节**:
```typescript
// 为每个阶段创建定时任务（自动调度学习）
const scheduledTaskIds: string[] = [];
if (phases && Array.isArray(phases) && phases.length > 0) {
  const now = new Date();
  const defaultScheduleTime = '20:00';  // 默认每天晚上 8 点
  
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const phaseName = phase.name || `阶段${i + 1}`;
    // 每个阶段间隔 1 天，从明天开始
    const phaseDate = new Date(now);
    phaseDate.setDate(phaseDate.getDate() + i + 1);
    const nextRun = phaseDate.toISOString().split('T')[0] + 'T' + defaultScheduleTime + ':00';
    
    const taskId = createScheduledTaskForLearning(
      agentFolder as string,
      chatJid || '',
      `学习${topic} - ${phaseName}`,
      'daily',
      defaultScheduleTime,
      nextRun,
    );
    scheduledTaskIds.push(taskId);
  }
}
```

**响应示例**:
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

### 修复 3: 添加学习进度反思定时任务 ✅

**修改文件**:
- `src/reflection-scheduler.ts` - 添加 `checkLearningProgressForAllAgents()` 方法

**实现细节**:
```typescript
// 每周日 20:00 检查学习进度并触发反思
cron.schedule('0 20 * * 0', async () => {
  await this.checkLearningProgressForAllAgents();
});
```

**功能**:
- 每周日晚上 8 点自动检查所有智能体的学习进度
- 对进行中的任务生成进度反思
- 对待处理任务生成提醒
- 反思内容存储到 L2 短期记忆

### 修复 4: 更新 SKILL.md 文档 ✅

**新增内容**:
- 自动调度说明章节
- 响应示例
- chatJid 参数说明

---

## OpenClaw 对比分析

| 功能 | OpenClaw | NanoClaw (修复后) |
|------|----------|------------------|
| 定时学习任务 | ✅ 每小时自动安装技能 | ✅ 学习计划自动创建定时任务 |
| 学习反思触发 | ✅ 每 30 分钟 heartbeat | ✅ 任务完成 + 每周进度检查 |
| 知识自动提取 | ✅ 安装后自动提取 | ⚠️ 待实现 |
| 学习时段调度 | ✅ 24 小时分时段 | ⚠️ 待实现 (可选) |
| 每日进化报告 | ✅ 每天 22:00 | ⚠️ 只有 weekly/monthly |

---

## 测试结果

```
✅ Test Files: 35 passed (35)
✅ Tests: 404 passed (404)
✅ TypeScript 编译成功
```

所有现有功能正常工作，修复没有引入回归问题。

---

## 待办任务

### 优先级 2: 增强学习系统 (可选)
- [ ] 添加知识自动提取机制 (类似 OpenClaw 的 extract-skill-knowledge)
- [ ] 添加 24 小时学习时段配置
- [ ] 添加每日进化报告

---

## 相关文件

- `src/group-queue.ts` - GroupQueue 实现
- `src/index.ts` - 主消息循环
- `src/db-agents.ts` - 数据库访问层
- `src/runtime-api.ts` - 运行时 API 服务器
- `src/reflection-scheduler.ts` - 反思调度器
- `container/skills/agent-learning/SKILL.md` - 技能使用文档
- `tasks/todo.md` - 任务跟踪
