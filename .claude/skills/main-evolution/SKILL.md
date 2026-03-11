---
name: main-evolution
description: Enable main NanoClaw process to use evolution system. Use this skill when you need to add evolution capabilities to the main process (not just agents), including submitting main process experiences, querying evolution library, and applying Gene strategies automatically from main process components.
---

# Main Evolution Skill (GEP 1.5.0 标准)

Enable the main NanoClaw process to use the evolution system just like agents can, supporting the complete Genome Evolution Protocol (GEP) 1.5.0 standard.

## Phase 1: Pre-flight

### Check if already applied

Read `.nanoclaw/state.yaml`. If `main-evolution` is in `applied_skills`, skip to Phase 3.

### Verify current evolution system

Check that these files exist and have the right content:
- `src/evolution-manager.ts` - should have `EvolutionManager` class with GEP 1.5.0 support
- `src/signal-extractor.ts` - should have `extractSignals` function
- `src/types.ts` - should have GEP 1.5.0 types (GEPGene, GEPCapsule, GDIScore)

## Phase 2: Apply Code Changes

### Initialize skills system (if needed)

If `.nanoclaw/` directory doesn't exist yet:

```bash
npx tsx scripts/apply-skill.ts --init
```

### Apply the skill

```bash
npx tsx scripts/apply-skill.ts .claude/skills/main-evolution
```

This deterministically:
- Updates `src/main-evolution-applier.ts` (main evolution applier for GEP 1.5.0)
- Updates `submitMainExperience` method to `src/evolution-manager.ts` (GEP 1.5.0 format)
- Adds `extractMainSignals` function to `src/signal-extractor.ts`
- Updates types to `src/types.ts` with GEP 1.5.0 support
- Integrates into `src/index.ts` with auto-initialization

### Validate code changes

```bash
npm run build
```

Build must be clean before proceeding.

## Phase 3: Verify Operation

### Test the integration

Run the development server:

```bash
npm run dev
```

Verify:
- Main process starts without errors
- Main process initializes the evolution system with GEP 1.5.0 support
- Logs show `Main evolution system initialized (GEP 1.5.0)`

## What this enables (GEP 1.5.0 标准)

The main process can now:
1. Submit its own experiences to the evolution library with GEP 1.5.0 format
2. Query the evolution library for optimization strategies using GEP 1.5.0 data structure
3. Automatically apply Gene strategies based on signals from components
4. Create and manage Capsules (verified execution results)
5. Calculate and use GDI (Global Desirability Index) scores
6. Support Ability Chains for linking related Genes and Capsules

Components supported:
- Channel connections (Telegram, WhatsApp, etc.)
- Message routing
- Container runtime
- Database operations

## GEP 1.5.0 新特性

### 1. 完整的 GEP 协议支持

**数据结构**：
- `GEPGene`：符合 GEP 标准的 Gene 结构，包含 signalsMatch、validationCommands、chainId 等字段
- `GEPCapsule`：验证后的执行结果胶囊，包含置信度、影响范围、执行结果等
- `GDIScore`：全球期望指数评分，综合内在质量、使用指标、社交信号和新鲜度

**状态管理**：
- `promoted`：已晋升（GDI ≥ 7.0 且 < 30 天）
- `stale`：陈旧（3.0 ≤ GDI < 7.0 且 < 90 天）
- `archived`：已归档（GDI < 3.0 或 ≥ 90 天）

### 2. 高级查询和排序

```typescript
// 查询 GDI 评分高于 6.5 的基因
const highQualityGenes = await evolutionManager.queryExperience(
  '性能优化',
  ['Node.js'],
  10,
  { minGDIScore: 6.5 }
);

// 根据 GDI 评分排序
const sortedGenes = highQualityGenes.sort(
  (a, b) => (b.gdi_score?.total || 0) - (a.gdi_score?.total || 0)
);
```

### 3. 自动 GDI 评分计算

```typescript
// 提交经验后自动计算 GDI 评分
const experienceId = await evolutionManager.submitMainExperience({
  abilityName: '数据库连接优化',
  content: '使用连接池可以显著提升性能...',
  description: '优化数据库连接管理的方法',
  tags: ['数据库', '性能优化'],
  validationCommands: ['npm run test:database']
});
```

## Example Usage

### 1. 提交主进程经验

```typescript
import { mainEvolutionApplier } from './src/main-evolution-applier.js';

// 提交通道连接优化经验
const experienceId = await mainEvolutionApplier.submitMainExperience({
  abilityName: 'Telegram 连接优化',
  content: '使用心跳机制保持 Telegram 连接的稳定性...',
  description: '优化 Telegram 通道连接的方法',
  tags: ['Telegram', '连接优化', '心跳机制'],
  validationCommands: ['npm run test:telegram']
});

console.log(`经验提交成功: ${experienceId}`);
```

### 2. 根据信号选择 Gene

```typescript
import { mainEvolutionApplier } from './src/main-evolution-applier.js';
import { extractSignals } from './src/signal-extractor.js';

// 从错误信息中提取信号
const errorContent = 'Telegram 连接频繁断开，需要重新连接';
const signals = extractSignals({ content: errorContent });

// 根据信号选择合适的 Gene
const gene = await mainEvolutionApplier.selectGene(signals);

if (gene) {
  console.log(`找到匹配的 Gene: ${gene.abilityName}`);
  console.log(`GDI 评分: ${gene.gdi_score?.total}`);
} else {
  console.log('未找到匹配的 Gene');
}
```

### 3. 创建 Capsule（验证后的执行结果）

```typescript
import { mainEvolutionApplier } from './src/main-evolution-applier.js';

// 执行优化策略后的验证结果
const capsuleId = await mainEvolutionApplier.createCapsule({
  geneId: 123,
  trigger: ['connection', 'stability'],
  confidence: 0.92,
  blastRadius: { files: 1, lines: 45 },
  outcome: { status: 'success', score: 0.95 }
});

console.log(`Capsule 创建成功: ${capsuleId}`);
```
