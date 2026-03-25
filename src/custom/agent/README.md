# Agent 独立模块

## 概述

该模块提供了一个独立的 agent 系统，用于与 Claude AI 进行交互。它包含了以下核心功能：

### 1. Agent 配置管理
- 读取和解析 agent 配置
- 支持配置验证和类型检查
- 提供默认配置值

### 2. Agent 通信与执行
- 通过 IPC（进程间通信）与 Claude AI 进行交互
- 发送任务请求并接收响应
- 管理 agent 会话和状态

### 3. Agent 数据存储
- 使用 SQLite 数据库存储 agent 相关数据
- 提供简洁的数据访问 API
- 支持数据的增删改查操作

### 4. 类型定义
- 完整的 TypeScript 类型定义
- 类型验证和接口规范

## 文件结构

```
src/custom/agent/
├── api.ts         # 与 Claude API 通信的接口
├── config.ts      # 配置管理模块
├── config.test.ts # 配置管理的测试文件
├── db.ts          # 数据库操作模块
├── db.test.ts     # 数据库操作的测试文件
├── ipc.ts         # 进程间通信模块
├── types.ts       # TypeScript 类型定义
└── types.test.ts  # 类型定义的测试文件
```

## 使用方法

### 1. 初始化 Agent 系统
```typescript
import { AgentConfig } from './config';
import { AgentAPI } from './api';

// 读取配置
const config = AgentConfig.load();

// 初始化 API 客户端
const api = new AgentAPI(config);

// 发送任务请求
const result = await api.sendTask('完成一个任务');
console.log(result);
```

### 2. 数据存储
```typescript
import { AgentDB } from './db';

// 初始化数据库
const db = new AgentDB();

// 创建记录
const record = await db.create({
  id: '123',
  data: {
    message: 'Hello, world!'
  }
});

// 读取记录
const retrieved = await db.get('123');
console.log(retrieved);

// 更新记录
await db.update('123', {
  data: {
    message: 'Updated message'
  }
});

// 删除记录
await db.delete('123');
```

## 测试

该模块包含完整的测试套件：

```bash
npm run test
```

## 开发

该模块遵循项目的架构准则：
- 所有代码均位于 `src/custom/` 目录下
- 使用事件监听和钩子模式进行扩展
- 支持非侵入式扩展
- 使用轻量级数据库和文件系统存储

## 未来改进

- 支持更多的 AI 模型
- 增强错误处理和重试机制
- 优化性能和响应时间
- 添加更多的测试用例

