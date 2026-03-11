# NanoClaw Agent Flow Tester

## 概述

这是一个全面的端到端测试框架，用于验证NanoClaw Agent的完整流程。该测试覆盖了从容器启动到任务执行，再到记忆和进化系统的完整链路。

## 测试内容

### 1. 核心功能测试
- **容器启动和执行**：测试Docker容器是否能正常启动和执行
- **智能体响应**：验证智能体是否能正确响应测试请求
- **记忆管理**：测试L1→L2→L3记忆流转和检索功能
- **进化系统**：验证经验上传、审核和查询功能
- **定时任务**：测试任务调度和执行功能

### 2. 系统集成测试
- **数据库操作**：验证数据库初始化、查询和清理
- **IPC通信**：测试进程间通信功能
- **任务快照**：验证任务状态的持久化和恢复
- **数据清理**：确保测试数据能正确清理

### 3. 边界条件测试
- **错误处理**：测试系统对各种错误场景的处理
- **资源清理**：验证系统资源是否能正确释放
- **超时处理**：测试任务超时和重试机制

## 快速开始

### 1. 确保环境准备
```bash
# 确保Docker服务正在运行
docker info

# 确保项目依赖已安装
npm install
```

### 2. 构建项目
```bash
npm run build
```

### 3. 运行测试

#### 方法1：使用npm命令
```bash
npm run test:e2e
```

#### 方法2：使用测试脚本
```bash
npm run test:run
```

#### 方法3：直接执行脚本
```bash
bash tests/run-tests.sh
```

### 4. 查看测试结果
- 控制台输出会显示详细的测试过程
- 测试日志会保存在 `groups/test/logs/` 目录
- 容器日志会保存在 `groups/test/logs/container-*.log` 文件

## 测试架构

### 主要测试文件

1. **`e2e-agent-flow.ts`** - 主测试文件
   - 负责整个测试流程的协调
   - 包含所有测试步骤的执行和验证
   - 处理错误和清理操作

2. **`test-helper.ts`** - 测试辅助函数
   - 提供数据清理和验证功能
   - 包含数据库操作辅助函数

3. **`run-tests.sh`** - 测试运行脚本
   - 负责环境检查和测试执行
   - 提供详细的测试报告

### 测试配置

#### 测试组配置
```typescript
const TEST_GROUP: RegisteredGroup = {
  name: 'Test Group',
  folder: 'test',
  trigger: '@Test',
  added_at: new Date().toISOString(),
  isMain: true
};
```

#### 测试任务配置
```typescript
const TEST_TASK = {
  id: 'test-task-1',
  group_folder: TEST_GROUP.folder,
  chat_jid: 'test:123456789',
  prompt: '测试定时任务执行：返回当前时间',
  schedule_type: 'interval',
  schedule_value: '60000', // 1分钟
  context_mode: 'isolated',
  next_run: new Date(Date.now() + 1000).toISOString(),
  status: 'active',
  created_at: new Date().toISOString(),
};
```

## 测试报告

测试完成后会生成详细的测试报告，包括：

### 执行状态

```
=== 测试完成 ===

=== 测试报告 ===
1. 容器启动和执行: ✅ 成功
2. 智能体响应: ✅ 成功
3. 记忆管理: ✅ 成功
4. 进化系统: ✅ 成功
5. 定时任务: ✅ 成功
6. 数据清理: ✅ 成功
```

### 输出示例

```
=== 启动NanoClaw完整流程测试 ===
1. 初始化数据库
2. 测试记忆管理
3. 测试进化系统
   经验已提交（ID: 123）
4. 测试定时任务
5. 测试任务快照
6. 直接测试容器运行
   智能体响应：Hello from NanoClaw!
   容器执行结果：success
7. 验证记忆和经验
   找到相关记忆：2个
   找到相关经验：1个
8. 测试数据清理
=== 测试完成 ===
```

## 故障排除

### 常见问题

#### 1. Docker容器启动失败
**原因**：Docker服务未启动或资源不足
**解决**：
```bash
# 启动Docker服务
# macOS
open -a Docker

# Linux
systemctl start docker

# 检查Docker状态
docker info
```

#### 2. 智能体响应超时
**原因**：网络连接问题或API响应慢
**解决**：
```bash
# 检查网络连接
ping api.anthropic.com

# 查看容器日志
cat groups/test/logs/container-*.log
```

#### 3. 测试数据未清理
**原因**：测试过程中异常退出
**解决**：
```bash
# 手动清理测试数据
rm -rf groups/test
rm -rf data/sessions/test
rm -rf data/ipc/test

# 重新运行测试
npm run test:e2e
```

### 调试方法

#### 1. 查看详细日志
```bash
# 查看测试过程的详细输出
npm run test:e2e 2>&1 | tee test-output.log

# 查看容器详细日志
cat groups/test/logs/container-*.log
```

#### 2. 使用调试模式
```typescript
// 在测试代码中添加调试日志
import { logger } from '../src/logger';
logger.setLevel('debug');
```

## 扩展测试

### 添加新的测试场景

在 `e2e-agent-flow.ts` 中添加新的测试步骤：

```typescript
async function testNewFeature() {
  logger.info('测试新功能');
  // 你的测试代码
  await performTest();
  const result = await verifyResult();
  if (!result) {
    throw new Error('新功能测试失败');
  }
  logger.info('新功能测试成功');
}
```

### 自定义测试配置

在 `test-helper.ts` 中修改测试配置：

```typescript
// 更改测试任务配置
const TEST_TASK = {
  id: 'test-task-2',
  // 新的配置参数
  schedule_value: '30000', // 30秒
  // 其他配置...
};
```

## 维护说明

### 测试数据清理

测试完成后会自动清理测试数据，但在某些特殊情况下可能需要手动清理：

```bash
# 清理测试数据
npm run test:run -- --clean

# 或者手动清理
bash tests/run-tests.sh --clean
```

### 更新测试依赖

当项目依赖更新时，需要重新安装依赖：

```bash
npm install
npm run build
```

### 测试环境维护

```bash
# 定期清理Docker资源
docker system prune -f

# 清理npm缓存
npm cache clean --force

# 重新安装依赖
rm -rf node_modules package-lock.json
npm install
```

## 贡献

欢迎提交PR来改进这个测试框架。在提交之前，请确保所有现有测试通过：

```bash
npm run test:e2e
```
