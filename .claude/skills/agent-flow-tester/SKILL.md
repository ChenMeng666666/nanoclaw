---
name: agent-flow-tester
description: 全面测试NanoClaw Agent的完整流程，覆盖容器启动、消息处理、学习计划、记忆流转（L1→L2→L3）、进化库审核、定时任务触发等全链路验证。当用户需要测试agent流程、记忆系统、进化库、定时任务时使用此技能。
---

# Agent Flow Tester

## 测试目标

全面测试NanoClaw Agent的完整流程，确保每个环节正常工作：

1. **Agent生命周期**：创建测试agent → 容器启动 → 发送消息 → 接收响应
2. **记忆管理**：验证记忆流转（L1→L2→L3）和定时固化L3任务
3. **学习系统**：创建学习计划 → 主动触发定时任务 → 检查学习记录
4. **进化系统**：经验上传 → 主动触发审核定时任务 → 验证进化库
5. **任务执行**：测试任务流程（搜索记忆→搜索进化库→外部学习→执行任务→经验上传）
6. **重复任务验证**：相同任务第二次执行应能应用进化库
7. **数据清理**：测试完成后清理所有测试数据
8. **系统组件**：验证定时任务、容器、数据库数据的完整性

## 测试环境要求

- Docker 服务正在运行
- Node.js v18+ 已安装
- NanoClaw 项目已构建 (`npm run build`)
- 已配置 Claude API 密钥

## 测试流程

### 1. 准备测试脚本

创建测试脚本 `e2e-agent-flow.ts`：

```typescript
import { join } from 'path';
import {
  initDatabase,
  createTask,
  getDueTasks,
  logTaskRun,
  getAllRegisteredGroups,
  clearTestData
} from '../../src/db';
import {
  ContainerInput,
  runContainerAgent,
  writeTasksSnapshot
} from '../../src/container-runner';
import { startSchedulerLoop } from '../../src/task-scheduler';
import { MemoryManager } from '../../src/memory-manager';
import { EvolutionManager } from '../../src/evolution-manager';

// 测试配置
const TEST_GROUP = {
  jid: 'test:123456789',
  name: 'Test Group',
  folder: 'test',
  trigger: '@Test',
  added_at: new Date().toISOString(),
  isMain: true
};

async function testCompleteAgentFlow() {
  console.log('=== 启动NanoClaw完整流程测试 ===');

  try {
    // 1. 初始化数据库
    console.log('1. 初始化数据库');
    initDatabase();

    // 2. 测试记忆管理
    console.log('2. 测试记忆管理');
    const memoryManager = new MemoryManager();
    await memoryManager.addMemory(
      TEST_GROUP.folder,
      '测试记忆内容：NanoClaw架构包含主进程、消息循环、容器调度',
      'L2'
    );

    // 3. 测试进化系统
    console.log('3. 测试进化系统');
    const evolutionManager = new EvolutionManager();
    const experienceId = await evolutionManager.submitExperience(
      'agent-flow-test',
      '测试完整agent流程：初始化→消息→容器→响应→记忆→进化',
      'test-agent'
    );
    console.log(`   经验已提交（ID: ${experienceId}）`);

    // 4. 测试定时任务
    console.log('4. 测试定时任务');
    const testTask = {
      id: 'test-task-1',
      group_folder: TEST_GROUP.folder,
      chat_jid: TEST_GROUP.jid,
      prompt: '测试定时任务执行：返回当前时间',
      schedule_type: 'interval',
      schedule_value: '60000', // 1分钟
      context_mode: 'isolated',
      next_run: new Date(Date.now() + 1000).toISOString(),
      status: 'active',
      created_at: new Date().toISOString()
    };
    createTask(testTask);

    // 5. 测试任务快照
    console.log('5. 测试任务快照');
    writeTasksSnapshot(TEST_GROUP.folder, true, [testTask]);

    // 6. 直接测试容器运行
    console.log('6. 直接测试容器运行');
    const containerInput: ContainerInput = {
      prompt: '请返回"Hello from NanoClaw!"并记录一个测试记忆',
      sessionId: 'test-session-1',
      groupFolder: TEST_GROUP.folder,
      chatJid: TEST_GROUP.jid,
      isMain: true,
      assistantName: 'TestAgent'
    };

    const result = await runContainerAgent(
      TEST_GROUP,
      containerInput,
      (proc, containerName) => console.log(`   容器启动：${containerName}`),
      async (output) => {
        if (output.result) {
          console.log(`   智能体响应：${output.result}`);
        }
        if (output.status === 'error') {
          console.error(`   容器错误：${output.error}`);
        }
      }
    );

    console.log(`   容器执行结果：${result}`);

    // 7. 验证记忆和经验
    console.log('7. 验证记忆和经验');
    const memories = await memoryManager.searchMemories(
      TEST_GROUP.folder,
      '测试记忆',
      5
    );
    console.log(`   找到相关记忆：${memories.length}个`);

    const experiences = await evolutionManager.queryExperience('测试');
    console.log(`   找到相关经验：${experiences.length}个`);

    // 8. 清理测试数据
    console.log('8. 清理测试数据');
    clearTestData(TEST_GROUP.folder);

    console.log('=== 测试完成 ===');

  } catch (error) {
    console.error('=== 测试失败 ===');
    console.error(error);
    process.exit(1);
  }
}

// 运行测试
testCompleteAgentFlow().then(() => process.exit(0)).catch(() => process.exit(1));
```

### 2. 编译和运行

```bash
npm run build
node dist/tests/e2e-agent-flow.js
```

### 3. 预期输出

```
=== 启动NanoClaw完整流程测试 ===
1. 初始化数据库
2. 测试记忆管理
3. 测试进化系统
   经验已提交（ID: 123）
4. 测试定时任务
5. 测试任务快照
6. 直接测试容器运行
   容器启动：test-container-123
   智能体响应：Hello from NanoClaw!
   容器执行结果：success
7. 验证记忆和经验
   找到相关记忆：2个
   找到相关经验：1个
8. 清理测试数据
=== 测试完成 ===
```

### 4. 添加数据清理函数

在 `src/db.ts` 中添加测试数据清理函数：

```typescript
export function clearTestData(groupFolder: string): void {
  const tables = ['agents', 'tasks', 'task_runs', 'memories', 'evolutions'];
  tables.forEach(table => {
    const deleteQuery = `
      DELETE FROM "${table}"
      WHERE group_folder = ? OR chat_jid LIKE ? OR id LIKE ?
    `;
    const params = [groupFolder, '%test:%', '%test%'];
    try {
      database.exec({
        sql: deleteQuery,
        args: params
      });
      console.log(`清理 ${table} 表中的测试数据`);
    } catch (error) {
      console.error(`清理 ${table} 表失败`, error);
    }
  });
}
```

### 5. 验证定时任务

在测试运行1分钟后，检查定时任务是否执行：

```bash
cat groups/test/tasks_snapshot.json
```

## 测试结果评估

### 成功条件

- 容器成功启动并返回响应
- 记忆管理正常工作（L1→L2→L3）
- 进化系统正常工作（经验上传→审核）
- 定时任务正确执行
- 数据库记录完整
- 测试数据成功清理

### 失败条件

- 容器启动失败
- 智能体响应错误
- 记忆或经验未记录
- 定时任务未执行
- 数据未正确清理

## 注意事项

1. 测试过程需要网络连接
2. 确保 Docker 有足够的资源
3. 测试数据会自动清理，但建议手动检查
4. 如遇到问题，查看 `logs/test-group.log` 进行调试

---

## 测试脚本位置

- **主测试文件**：`tests/e2e-agent-flow.ts`
- **编译后位置**：`dist/tests/e2e-agent-flow.js`
- **配置文件**：`src/config.ts`（可调整测试参数）

## 扩展测试

可在测试脚本中添加更多场景：

- 测试不同类型的任务（interval, daily, weekly）
- 测试错误处理和重试机制
- 测试多agent并发执行
- 测试大文件处理和内存管理
- 测试网络中断恢复
