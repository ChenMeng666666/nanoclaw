# ContextEngine 开发指南

## 概述

ContextEngine 是 NanoClaw 的可插拔上下文/记忆管理引擎。它提供了完整的生命周期钩子，允许自定义记忆处理逻辑。

## 架构

### 核心接口

```typescript
interface ContextEngine {
  // 1. 引擎初始化
  bootstrap(agentFolder: string): Promise<void>;

  // 2. 新消息处理
  ingest(message: NewMessage, context: Context): Promise<Memory[]>;

  // 3. 构建上下文
  assemble(chatJid: string, limit: number): Promise<Context>;

  // 4. 压缩会话
  compact(session: any): Promise<CompactResult>;

  // 5. 对话后处理
  afterTurn(result: TurnResult): Promise<void>;
}
```

### 生命周期

```
┌─────────────────────────────────────────────────────────────────┐
│                    ContextEngine 生命周期                        │
└─────────────────────────────────────────────────────────────────┘

1. bootstrap(agentFolder)
   │
   ├─ 时机：agent 容器启动时
   ├─ 职责：初始化引擎状态，加载缓存
   └─ 输出：void

2. ingest(message, context) → Memory[]
   │
   ├─ 时机：新消息到达，storeMessage 后
   ├─ 职责：分析消息，决定存储哪些记忆
   ├─ 输入：NewMessage, Context
   └─ 输出：Memory[] (可能为空)

3. assemble(chatJid, limit) → Context
   │
   ├─ 时机：构建 prompt 前，发送请求给 agent 容器
   ├─ 职责：检索相关记忆，构建上下文
   ├─ 输入：chatJid, limit
   └─ 输出：Context (messages + memories)

4. compact(session) → CompactResult
   │
   ├─ 时机：上下文过长，需要压缩
   ├─ 职责：总结历史，保留关键记忆
   ├─ 输入：Session (完整对话历史)
   └─ 输出：CompactResult (summary + preserved)

5. afterTurn(result)
   │
   ├─ 时机：agent 响应返回后
   ├─ 职责：存储新记忆，更新状态
   ├─ 输入：TurnResult (response + newMemories)
   └─ 输出：void
```

## 默认实现

`DefaultContextEngine` 提供了基于分层记忆架构的完整实现：

### 记忆层级

- **L1 工作记忆**: 当前对话的临时记忆，访问频率高
- **L2 短期记忆**: 近期对话内容，访问次数中等
- **L3 长期记忆**: 重要事实和用户偏好，访问次数少但重要性高

### 混合检索

DefaultContextEngine 使用 BM25 + 向量搜索的融合检索：

1. **BM25 关键词搜索**: 精确匹配查询中的关键词
2. **向量语义搜索**: 基于余弦相似度的语义匹配
3. **RRF 融合**: 倒数排名融合两个结果列表

```typescript
// 检索流程
const bm25Results = this.bm25Index.search(query, limit * 2);
const vectorResults = await this.vectorSearch(agentFolder, query, limit * 2);
const fusedResults = reciprocalRankFusion(bm25Results, vectorResults);
const memories = this.getMemoriesByIds(fusedToIds(fusedResults, limit));
```

## 自定义 ContextEngine

### 步骤 1: 实现接口

```typescript
import type { ContextEngine } from './context-engine/interface.js';
import type { Context, CompactResult, TurnResult } from './context-engine/types.js';

export class MyCustomEngine implements ContextEngine {
  async bootstrap(agentFolder: string): Promise<void> {
    // 初始化逻辑
  }

  async ingest(message: NewMessage, context: Context): Promise<Memory[]> {
    // 消息处理逻辑
    return [];
  }

  async assemble(chatJid: string, limit: number): Promise<Context> {
    // 上下文构建逻辑
    return { /* ... */ };
  }

  async compact(session: any): Promise<CompactResult> {
    // 会话压缩逻辑
    return { /* ... */ };
  }

  async afterTurn(result: TurnResult): Promise<void> {
    // 对话后处理逻辑
  }
}
```

### 步骤 2: 注册引擎

```typescript
import { contextEngineRegistry } from './context-engine/registry.js';
import { MyCustomEngine } from './my-custom-engine.js';

// 注册工厂函数
contextEngineRegistry.register('my-custom', async (agentFolder) => {
  const engine = new MyCustomEngine();
  await engine.bootstrap(agentFolder);
  return engine;
});

// 设置为默认引擎
contextEngineRegistry.useDefaultEngine('my-custom');
```

## 插件注册表

`ContextEngineRegistry` 管理所有注册的引擎：

- **单例模式**: 全局唯一的注册表实例
- **懒加载**: 引擎实例在首次请求时创建
- **实例缓存**: 每个 agent folder 缓存一个引擎实例
- **动态切换**: 支持运行时切换默认引擎

## API 参考

### contextEngineRegistry

```typescript
// 注册引擎
register(name: string, factory: ContextEngineFactory): void

// 获取引擎实例
getEngine(agentFolder: string): Promise<ContextEngine>

// 设置默认引擎
useDefaultEngine(name: string): void

// 清除缓存
clear(agentFolder?: string): void
```

### ContextEngineFactory

```typescript
type ContextEngineFactory = (agentFolder: string) => Promise<ContextEngine>;
```

## 最佳实践

### 1. 记忆去重

在 `ingest()` 中检查重复内容：

```typescript
async ingest(message: NewMessage, context: Context): Promise<Memory[]> {
  const existingMemories = await this.searchSimilar(message.content);
  if (existingMemories.length > 0) {
    return []; // 跳过重复内容
  }
  // ... 存储新记忆
}
```

### 2. 重要性评分

根据内容类型动态计算重要性：

```typescript
const importance = this.calculateImportance({
  isUserFact: true,
  contentLength: content.length,
  hasActionItems: false,
});
```

### 3. 批量处理

在 `assemble()` 中批量加载记忆：

```typescript
async assemble(chatJid: string, limit: number): Promise<Context> {
  const memories = await this.getMemoriesBatch(chatJid, limit);
  // ...
}
```

### 4. 缓存策略

在 `bootstrap()` 中预加载常用记忆：

```typescript
async bootstrap(agentFolder: string): Promise<void> {
  this.cache = await this.loadMemories(agentFolder);
}
```

## 测试

运行 ContextEngine 相关测试：

```bash
# 运行所有 ContextEngine 测试
npm test -- src/context-engine/__tests__/

# 运行混合检索测试
npm test -- src/__tests__/hybrid-search.test.ts

# 运行路由绑定测试
npm test -- src/__tests__/db-routing.test.ts
```

## 故障排除

### 引擎未加载

检查是否已注册默认引擎：

```typescript
contextEngineRegistry.useDefaultEngine('default');
```

### 记忆检索不准确

1. 检查 BM25 索引是否正确构建
2. 验证向量嵌入模型是否加载
3. 调整 RRF 融合参数 k 值

### 性能问题

1. 启用 BM25 索引缓存
2. 限制检索记忆数量
3. 使用异步批量加载

## 相关文件

- `src/context-engine/types.ts` - 类型定义
- `src/context-engine/interface.ts` - ContextEngine 接口
- `src/context-engine/registry.ts` - 插件注册表
- `src/context-engine/default-engine.ts` - 默认实现
- `src/hybrid-search.ts` - 混合检索实现
