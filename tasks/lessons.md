# NanoClaw 经验教训

## 2026-03-09: Cron 调度器 Bug

### 问题
在 `src/reflection-scheduler.ts` 中使用了不兼容的 cron 语法：
```typescript
cron.schedule('0 23 L * *', () => {
  this.triggerReflectionsForAllAgents('monthly');
});
```

### 原因
`node-cron` 库不支持 `L` 语法（表示月末）。这导致启动时抛出 `RangeError: Invalid time value` 错误。

### 解决方案
改为使用日期范围检查，在回调中判断是否为月末：
```typescript
cron.schedule('0 23 28-31 * *', () => {
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  if (today.getDate() === lastDay) {
    this.triggerReflectionsForAllAgents('monthly');
  }
});
```

### 教训
1. **验证 cron 语法** - 不是所有 cron 实现都支持相同的语法
2. **使用标准语法** - 避免使用特定实现的扩展语法
3. **在测试环境中验证** - 定时任务的错误可能只在运行时暴露

---

## 2026-03-09: 多智能体架构 - 通道配置流程

### 观察
当前配置 Telegram 通道的流程需要手动运行脚本：
1. 运行 `scripts/configure-telegram.ts` 配置通道实例
2. 手动编辑 `.env` 添加 bot token
3. 同步环境到 `data/env/env`

### 改进方向
1. **整合到 setup-agents 脚本** - 在创建 agent 时直接配置通道
2. **自动化环境同步** - 脚本自动完成 `.env` 和容器环境同步
3. **提供交互式注册** - 引导用户获取 chatid 并完成注册

### 教训
1. **配置一致性** - 所有敏感凭证应统一通过 keychain 存储
2. **减少手动步骤** - 每增加一个手动步骤就多一个出错点
3. **文档化流程** - 用户需要清晰的步骤指导
