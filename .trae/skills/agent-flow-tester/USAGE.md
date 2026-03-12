# Agent Flow Tester 使用指南

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 构建项目

```bash
npm run build
```

### 3. 运行最小化测试（推荐）

```bash
npm run test:minimal
```

### 4. 运行完整测试

```bash
npm run test:full
```

### 5. 运行容器链路测试

```bash
npm run test:e2e
```

### 6. 运行全链路回归（推荐）

```bash
npm run test:minimal && npm run test:full && npm run test:e2e
```

## 测试命令

| 命令                   | 描述                             | 适用场景             |
| ---------------------- | -------------------------------- | -------------------- |
| `npm run test:minimal` | 运行最小化测试，验证系统基础功能 | 快速验证、开发调试   |
| `npm run test:full`    | 运行完整 Agent 流程测试          | 全面验证、发布前检查 |
| `npm run test:e2e`     | 运行端到端容器链路测试           | 容器联调、回归验证   |
| `npm run test:run`     | 运行测试脚本（带环境检查）       | 完整流程测试         |

## 测试内容

### 最小化测试 (`test:minimal`)

- ✅ 数据库初始化
- ✅ 记忆管理（L1/L2/L3）
- ✅ 进化系统基础功能
- ✅ 定时任务创建和验证
- ✅ 数据清理

### 完整测试 (`test:full`)

- ✅ 所有最小化测试内容
- ✅ 记忆固化强校验（L2 候选迁移到 L3）
- ✅ 学习计划主动触发定时任务与执行日志
- ✅ 进化经验上传后主动审核状态校验
- ✅ 任务流程链路（记忆检索→进化检索→外部学习→执行→上传经验）
- ✅ 并发记忆/并发进化访问压测与数据清理

### 端到端测试 (`test:e2e`)

- ✅ 容器启动与消息流式输出链路（依赖 Docker + 模型凭证）
- ✅ 任务快照与数据库一致性验证
- ✅ 清理流程验证

## 测试输出

### 成功输出示例

```
=== 运行最小化测试 ===
=== 测试成功 ===
测试信息：
- 记忆数量：1
- 经验数量：1
- 经验ID：123
- 任务ID：minimal-test-task
```

### 失败输出示例

```
=== 测试失败 ===
Error: 记忆存储失败
    at runMinimalTest (/path/to/minimal-test.ts:85:11)
```

## 故障排除

### 常见问题

#### 1. 编译错误

```bash
# 清理并重新构建
rm -rf dist
npm run build
```

#### 2. Docker 连接失败

```bash
# 检查 Docker 服务
docker info

# 启动 Docker（macOS）
open -a Docker
```

#### 3. 测试数据残留

```bash
# 手动清理
rm -rf groups/test
rm -rf data/sessions/test
rm -rf data/ipc/test
```

## 扩展测试

### 添加新测试场景

在 `tests/` 目录创建新的测试文件：

```typescript
import { logger } from '../src/logger.js';

async function myNewTest() {
  logger.info('开始我的新测试');
  // 测试代码
}

myNewTest().then(() => process.exit(0));
```

### 自定义测试配置

修改 `tests/e2e-agent-flow.ts` 中的测试配置：

```typescript
const TEST_GROUP = {
  name: 'My Test Group',
  folder: 'my-test',
  // 其他配置...
};
```

## 注意事项

1. **网络连接**：测试需要网络连接来调用 API
2. **Docker资源**：确保 Docker 有足够的内存和 CPU
3. **Runtime API 鉴权**：需配置 `RUNTIME_API_KEY`，并通过 `X-API-Key` 访问 Runtime API
4. **容器模型凭证**：`test:e2e` 需配置 `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / `CLAUDE_CODE_OAUTH_TOKEN`
5. **清理数据**：测试后会自动清理，但建议手动检查

## 开发流程

```bash
# 1. 修改代码
# 2. 运行最小化测试验证
npm run test:minimal

# 3. 如需要，运行完整测试
npm run test:full

# 4. 提交代码
git add .
git commit -m "feat: 添加新功能"
```
