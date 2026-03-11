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
npm run test:e2e
```

## 测试命令

| 命令 | 描述 | 适用场景 |
|------|------|----------|
| `npm run test:minimal` | 运行最小化测试，验证系统基础功能 | 快速验证、开发调试 |
| `npm run test:e2e` | 运行完整端到端测试 | 全面验证、发布前检查 |
| `npm run test:run` | 运行测试脚本（带环境检查） | 完整流程测试 |

## 测试内容

### 最小化测试 (`test:minimal`)
- ✅ 数据库初始化
- ✅ 记忆管理（L1/L2/L3）
- ✅ 进化系统基础功能
- ✅ 定时任务创建和验证
- ✅ 数据清理

### 完整测试 (`test:e2e`)
- ✅ 所有最小化测试内容
- ✅ 容器启动和执行
- ✅ 智能体响应验证
- ✅ 任务快照生成
- ✅ 数据库操作验证
- ✅ 端到端流程验证

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

1. **网络连接**：测试需要网络连接来调用API
2. **Docker资源**：确保Docker有足够的内存和CPU
3. **API密钥**：测试需要有效的API密钥
4. **清理数据**：测试后会自动清理，但建议手动检查

## 开发流程

```bash
# 1. 修改代码
# 2. 运行最小化测试验证
npm run test:minimal

# 3. 如需要，运行完整测试
npm run test:e2e

# 4. 提交代码
git add .
git commit -m "feat: 添加新功能"
```
