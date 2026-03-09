# main-evolution 技能实现计划

## Context

用户希望在 `.claude/skills/` 下创建一个技能，让 NanoClaw 主进程（不仅仅是 agents）也能使用进化系统。主进程应该能够：
1. 提交自己的运行经验到进化库
2. 查询进化库获取建议
3. 根据信号自动选择和应用 Gene 策略

## 现有架构

- `src/evolution-manager.ts`: 已有进化管理器，包含 `submitExperience`, `queryExperience`, `selectGene`, `selectGeneForContent`
- `src/signal-extractor.ts`: 已有信号提取功能
- `src/index.ts`: 主进程入口
- `.claude/skills/`: 技能目录，使用 `add/` 和 `modify/` 模式

## 实现方案

**不是 agent 技能，而是主进程的集成技能**

### 技能结构

```
.claude/skills/main-evolution/
├── SKILL.md              # 技能文档
├── manifest.yaml          # 技能清单
├── add/
│   └── src/
│       └── main-evolution-applier.ts  # 新增文件
└── modify/
    ├── src/
    │   ├── evolution-manager.ts  # 修改文件
    │   ├── signal-extractor.ts   # 修改文件
    │   ├── types.ts              # 修改文件
    │   └── index.ts              # 修改文件
```

### 实现步骤

#### 1. add/src/main-evolution-applier.ts (新增)
- `MainEvolutionApplier` 类
- 主项目组件标识符枚举
- `submitMainExperience()`: 主项目提交经验
- `applyEvolutionFromSignals()`: 根据信号应用进化
- 组件特定的策略应用函数

#### 2. modify/src/evolution-manager.ts (修改)
- 添加 `submitMainExperience()` 方法
- 添加 `getMainEvolutionApplier()` 导出

#### 3. modify/src/signal-extractor.ts (修改)
- 添加 `extractMainSignals()` 函数
- 添加主项目组件信号模式

#### 4. modify/src/types.ts (修改)
- 添加 `MainComponent` 枚举
- 添加 `MainExperienceInput` 接口

#### 5. modify/src/index.ts (修改)
- 导入 `MainEvolutionApplier`
- 在 `loadState()` 后调用 `initMainEvolution()`
- 在错误处理中调用 `MainEvolutionApplier`

### 关键文件修改

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| add/src/main-evolution-applier.ts | 新增 | 主项目进化应用器 |
| modify/src/evolution-manager.ts | 修改 | 添加 `submitMainExperience()` |
| modify/src/signal-extractor.ts | 修改 | 添加主项目信号提取 |
| modify/src/types.ts | 修改 | 添加类型定义 |
| modify/src/index.ts | 修改 | 集成到主流程 |

### 验证

1. 运行 `npm run build` 确保 TypeScript 编译通过
2. 运行 `npm run dev` 检查主进程能正常启动
3. 验证没有功能回归

---

## 向后兼容

- 现有的 agent 进化系统完全不受影响
- 新增代码都是可选的，不影响现有功能
- 主进程的进化是渐进式集成的
