import type { Memory } from '../types.js';
import { MEMORY_CONFIG } from '../config.js';
import { getAllMemories, updateMemory } from '../db-agents.js';
import { logger } from '../logger.js';
import type { MigrationRuleConfig } from './release-control-types.js';
import { clamp01 } from './ranking-utils.js';
import { MemoryMetricsTracker } from './metrics.js';
import { applyLifecycleGovernance } from './lifecycle-governance.js';

export function shouldMigrateMemory(
  memory: Memory,
  migrationConfig: MigrationRuleConfig,
): {
  should: boolean;
  targetLevel?: 'L2' | 'L3';
} {
  const now = Date.now();
  const lastAccessAnchor =
    memory.lastAccessedAt || memory.updatedAt || memory.createdAt;
  const lastAccess = new Date(lastAccessAnchor).getTime();
  const daysSinceAccess = (now - lastAccess) / (1000 * 60 * 60 * 24);

  // 时间衰减因子（30 天半衰期）
  const decayFactor = Math.exp(-daysSinceAccess / 30);
  const qualityScore = memory.qualityScore ?? 0.5;
  const adjustedImportance =
    memory.importance * decayFactor * (0.95 + qualityScore * 0.05);

  if (memory.level === 'L1') {
    if (
      memory.accessCount >= migrationConfig.l1ToL2MinAccessCount &&
      daysSinceAccess > migrationConfig.l1ToL2MinIdleDays
    ) {
      return { should: true, targetLevel: 'L2' };
    }
  }

  if (memory.level === 'L2') {
    if (
      daysSinceAccess > migrationConfig.l2ToL3MinIdleDays ||
      adjustedImportance > migrationConfig.l2ToL3MinImportance
    ) {
      return { should: true, targetLevel: 'L3' };
    }
  }

  return { should: false };
}

export async function migrateMemory(
  memory: Memory,
  targetLevel: 'L2' | 'L3',
  migrationConfig: MigrationRuleConfig,
  l1CacheInvalidator: (id: string) => void,
): Promise<void> {
  const contentPrefix = migrationConfig.migratedContentPrefix;
  const content = contentPrefix
    ? `${contentPrefix}${memory.content}`
    : memory.content;
  updateMemory(memory.id, {
    level: targetLevel,
    content,
    importance: targetLevel === 'L2' ? 0.7 : 0.9,
    qualityScore: clamp01(
      (memory.qualityScore ?? 0.5) + (targetLevel === 'L3' ? 0.08 : 0.04),
    ),
  });
  if (memory.level === 'L1') {
    l1CacheInvalidator(memory.id);
  }
  logger.info(
    { id: memory.id, from: memory.level, to: targetLevel },
    'Memory migrated',
  );
}

export async function migrateMemories(
  tracker: MemoryMetricsTracker,
  configResolver: (
    agentFolder: string,
    userJid?: string,
  ) => MigrationRuleConfig,
  l1CacheInvalidator: (id: string) => void,
): Promise<number> {
  const allMemories = [...getAllMemories('L1'), ...getAllMemories('L2')];
  for (const memory of allMemories) {
    applyLifecycleGovernance(memory);
  }
  const migrationPlans = allMemories
    .map((memory) => ({
      memory,
      decision: shouldMigrateMemory(
        memory,
        configResolver(memory.agentFolder, memory.userJid),
      ),
    }))
    .filter(
      (
        item,
      ): item is {
        memory: Memory;
        decision: { should: true; targetLevel: 'L2' | 'L3' };
      } => item.decision.should && Boolean(item.decision.targetLevel),
    );
  if (migrationPlans.length === 0) {
    return 0;
  }
  tracker.recordMigrationAttempt(migrationPlans.length);
  let migratedCount = 0;
  const batchSize = MEMORY_CONFIG.retrieval.migrationBatchSize;
  const concurrency = MEMORY_CONFIG.retrieval.migrationConcurrency;
  for (
    let batchStart = 0;
    batchStart < migrationPlans.length;
    batchStart += batchSize
  ) {
    const batch = migrationPlans.slice(batchStart, batchStart + batchSize);
    for (let i = 0; i < batch.length; i += concurrency) {
      const chunk = batch.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        chunk.map((item) =>
          migrateMemory(
            item.memory,
            item.decision.targetLevel,
            configResolver(item.memory.agentFolder, item.memory.userJid),
            l1CacheInvalidator,
          ),
        ),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          migratedCount += 1;
          tracker.recordMigrationSuccess();
        } else {
          tracker.recordMigrationFailure();
          logger.warn(
            {
              err:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
            },
            'Memory migration task failed',
          );
        }
      }
    }
  }
  return migratedCount;
}
