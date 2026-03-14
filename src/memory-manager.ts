/**
 * 记忆管理系统
 * 实现分层记忆架构：L1 工作记忆 → L2 短期记忆 → L3 长期记忆
 * 支持向量嵌入、语义检索、记忆迁移
 */
import crypto from 'crypto';

import {
  createMemory,
  getMemories,
  MemoryQueryOptions,
  updateMemory,
  incrementMemoryAccess,
  deleteMemory,
  getDuplicateMemory,
} from './db-agents.js';
import {
  createOperationSnapshot,
  getOperationSnapshotByOperationId,
  updateOperationSnapshot,
} from './db.js';
import { Memory } from './types.js';
import { logger } from './logger.js';
import { MEMORY_CONFIG } from './config.js';

// New imports from refactored modules
import {
  MemoryMetricsTracker,
  MemoryDashboardMetrics,
} from './memory-manager/metrics.js';
import {
  MemoryReleaseControl,
  UpdateReleaseControlInput,
  RetrievalRolloutConfig,
  MigrationRuleConfig,
  RolloutMode,
  safeParseReleaseControl,
} from './memory-manager/release-control-types.js';
import { generateEmbedding } from './memory-manager/embedding.js';
import {
  calculateQualityScore,
  calculateImportance,
  clamp01,
} from './memory-manager/ranking-utils.js';
import {
  findLifecycleMergeTarget,
  mergeTags,
  mergeLifecycleContent,
} from './memory-manager/lifecycle-governance.js';
import { migrateMemories } from './memory-manager/migration.js';
import {
  searchMemories,
  searchMemoriesDetailed,
} from './memory-manager/retrieval.js';
import {
  MemoryMetadataInput,
  MemorySearchHit,
  MemorySearchExplanation,
} from './memory-manager/types.js';

// Re-export types for compatibility
export {
  MemorySearchHit,
  MemorySearchExplanation,
  MemoryDashboardMetrics,
  MemoryReleaseControl,
  MemoryMetadataInput,
};
export { generateEmbedding };

/**
 * 记忆管理器类
 */
export class MemoryManager {
  // L1 工作记忆缓存（内存中）
  private l1Cache = new Map<string, Memory>();

  // 缓存持久化定时器
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private metricsTracker = new MemoryMetricsTracker();
  private releaseControl: MemoryReleaseControl =
    this.createDefaultReleaseControl();

  /**
   * 获取工作记忆（L1）
   * 优先从缓存读取，没有则从数据库加载
   * @param forceReloadFromDB - 是否强制从数据库重新加载（刷新缓存）
   */
  async getWorkingMemory(
    agentFolder: string,
    userJid?: string,
    forceReloadFromDB: boolean = false,
  ): Promise<string> {
    const key = this.makeKey(agentFolder, userJid);

    // 如果强制刷新或缓存不存在，从数据库加载
    if (forceReloadFromDB || !this.l1Cache.has(key)) {
      this.metricsTracker.recordCacheResult(false);
      // 从数据库加载
      const memories = getMemories(agentFolder, 'L1', userJid);
      if (memories.length > 0) {
        const memory = memories[0];
        this.l1Cache.set(key, memory);
        incrementMemoryAccess(memory.id);
        return memory.content;
      }
      // 数据库中没有，清除缓存
      this.l1Cache.delete(key);
      return '';
    }

    const cached = this.l1Cache.get(key)!;
    this.metricsTracker.recordCacheResult(true);
    // 更新访问计数
    incrementMemoryAccess(cached.id);
    return cached.content;
  }

  getDashboardMetrics(timelineLimit: number = 24): MemoryDashboardMetrics {
    return this.metricsTracker.getDashboardMetrics(timelineLimit);
  }

  getReleaseControl(): MemoryReleaseControl {
    return structuredClone(this.releaseControl);
  }

  updateReleaseControl(
    input: UpdateReleaseControlInput,
    operator: string,
    reason?: string,
  ): { operationId: string; control: MemoryReleaseControl } {
    const beforeState = this.getReleaseControl();
    const nextState = this.mergeReleaseControl(this.releaseControl, input);
    this.releaseControl = nextState;
    const operationId = crypto.randomUUID();
    createOperationSnapshot({
      operationId,
      operationType: 'memory_release_control_update',
      beforeState: JSON.stringify(beforeState),
      afterState: JSON.stringify(nextState),
      timestamp: new Date().toISOString(),
      status: 'applied',
      description: `${operator}:${reason || 'update'}`,
    });
    return {
      operationId,
      control: this.getReleaseControl(),
    };
  }

  rollbackReleaseControl(
    operationId: string,
    operator: string,
  ): MemoryReleaseControl {
    const snapshot = getOperationSnapshotByOperationId(operationId);
    if (!snapshot) {
      throw new Error(`Operation snapshot not found: ${operationId}`);
    }
    if (!snapshot.beforeState) {
      throw new Error(`Operation snapshot has no before state: ${operationId}`);
    }
    const parsed = safeParseReleaseControl(snapshot.beforeState);
    if (!parsed) {
      throw new Error(
        `Operation snapshot before state invalid: ${operationId}`,
      );
    }
    this.releaseControl = parsed;
    updateOperationSnapshot(operationId, {
      status: 'rolled_back',
      description:
        `${snapshot.description || ''};rollback_by:${operator}`.slice(0, 512),
    });
    return this.getReleaseControl();
  }

  /**
   * 设置/更新工作记忆（L1）
   */
  async setWorkingMemory(
    agentFolder: string,
    content: string,
    userJid?: string,
  ): Promise<void> {
    const key = this.makeKey(agentFolder, userJid);
    const existing = this.l1Cache.get(key);

    if (existing) {
      // 更新缓存
      existing.content = content;
      existing.updatedAt = new Date().toISOString();
      this.l1Cache.set(key, existing);
      // 立即更新数据库，避免缓存与数据库不一致
      updateMemory(existing.id, {
        content,
        updatedAt: existing.updatedAt,
      });
    } else {
      // 检查重复记忆
      const contentHash = crypto
        .createHash('sha256')
        .update(content)
        .digest('hex');
      const duplicate = getDuplicateMemory(
        agentFolder,
        contentHash,
        'L1',
        userJid,
      );
      if (duplicate) {
        logger.info(
          { duplicateId: duplicate.id, agentFolder, userJid },
          'Duplicate working memory detected, using existing',
        );
        this.l1Cache.set(key, {
          ...duplicate,
          accessCount: 0,
          lastAccessedAt: new Date().toISOString(),
        });
        incrementMemoryAccess(duplicate.id);
        return;
      }

      // 创建新记忆
      const embedding = await generateEmbedding(content);
      const memory: Omit<Memory, 'accessCount' | 'lastAccessedAt'> = {
        id: this.generateMemoryId(),
        agentFolder,
        userJid,
        scope: userJid ? 'user' : 'agent',
        level: 'L1',
        content,
        embedding,
        importance: 0.5,
        qualityScore: calculateQualityScore(content, {
          sourceType: 'direct',
          scope: userJid ? 'user' : 'agent',
        }),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      createMemory(memory);
      this.l1Cache.set(key, {
        ...memory,
        accessCount: 0,
        lastAccessedAt: new Date().toISOString(),
      });
    }

    // 触发持久化
    this.schedulePersist();
  }

  /**
   * 获取短期记忆（L2）
   */
  async getShortTermMemories(
    agentFolder: string,
    userJid?: string,
  ): Promise<Memory[]> {
    const memories = getMemories(agentFolder, 'L2', userJid);
    for (const memory of memories) {
      incrementMemoryAccess(memory.id);
    }
    return memories;
  }

  /**
   * 获取长期记忆（L3）
   */
  async getLongTermMemories(
    agentFolder: string,
    userJid?: string,
  ): Promise<Memory[]> {
    const memories = getMemories(agentFolder, 'L3', userJid);
    for (const memory of memories) {
      incrementMemoryAccess(memory.id);
    }
    return memories;
  }

  /**
   * 添加记忆到指定层级
   */
  async addMemory(
    agentFolder: string,
    content: string,
    level: 'L1' | 'L2' | 'L3' = 'L1',
    userJid?: string,
    metadata?: MemoryMetadataInput,
  ): Promise<void> {
    // 检查重复记忆
    const contentHash = crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');
    const duplicate = getDuplicateMemory(
      agentFolder,
      contentHash,
      level,
      userJid,
    );
    if (duplicate) {
      logger.info(
        { duplicateId: duplicate.id, agentFolder, level, userJid },
        'Duplicate memory detected, skipping',
      );
      // 更新访问计数而不创建新记忆
      incrementMemoryAccess(duplicate.id);
      return;
    }

    const embedding = await generateEmbedding(content);
    const importance = calculateImportance(content, level);
    const mergeTarget = findLifecycleMergeTarget(
      agentFolder,
      content,
      embedding,
      level,
      userJid,
      metadata,
    );
    if (mergeTarget) {
      const mergedTags = mergeTags(mergeTarget.tags, metadata?.tags);
      const mergedContent = mergeLifecycleContent(
        mergeTarget.content,
        content,
        mergeTarget.isConflict,
      );
      const qualityScore = calculateQualityScore(mergedContent, {
        sourceType: metadata?.sourceType || mergeTarget.sourceType || 'direct',
        scope: metadata?.scope || mergeTarget.scope,
        tags: mergedTags,
        messageType: metadata?.messageType,
      });
      updateMemory(mergeTarget.id, {
        content: mergedContent,
        importance: Math.min(1, Math.max(mergeTarget.importance, importance)),
        qualityScore,
        tags: mergedTags,
      });
      incrementMemoryAccess(mergeTarget.id);
      logger.info(
        {
          targetId: mergeTarget.id,
          level,
          userJid,
          isConflict: mergeTarget.isConflict,
        },
        'Memory merged by lifecycle governance',
      );
      return;
    }
    const qualityScore = calculateQualityScore(content, {
      sourceType: metadata?.sourceType || 'direct',
      scope:
        metadata?.scope ||
        (metadata?.sessionId ? 'session' : userJid ? 'user' : 'agent'),
      tags: metadata?.tags,
      messageType: metadata?.messageType,
    });

    const memory: Omit<Memory, 'accessCount' | 'lastAccessedAt'> = {
      id: this.generateMemoryId(),
      agentFolder,
      userJid,
      sessionId: metadata?.sessionId,
      scope:
        metadata?.scope ||
        (metadata?.sessionId ? 'session' : userJid ? 'user' : 'agent'),
      level,
      content,
      embedding,
      importance,
      qualityScore,
      messageType: metadata?.messageType,
      timestampWeight: 0.5,
      tags: metadata?.tags,
      sourceType: metadata?.sourceType || 'direct',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    createMemory(memory);

    // 如果是 L1，更新缓存
    if (level === 'L1' && userJid) {
      const key = this.makeKey(agentFolder, userJid);
      this.l1Cache.set(key, {
        ...memory,
        accessCount: 0,
        lastAccessedAt: new Date().toISOString(),
      });
    }

    logger.info(
      { agentFolder, level, userJid, contentLength: content.length },
      'Memory added',
    );
  }

  /**
   * 检查并执行记忆迁移（L1→L2→L3）
   * 基于访问次数和时间衰减
   */
  async migrateMemories(): Promise<number> {
    return migrateMemories(
      this.metricsTracker,
      (agentFolder, userJid) =>
        this.resolveMigrationRules(agentFolder, userJid),
      (id) => this.invalidateCacheById(id),
    );
  }

  /**
   * 持久化 L1 缓存到数据库
   */
  async persistL1Memories(): Promise<void> {
    // L1 缓存已经在创建/更新时写入数据库
    // 这里可以清理长时间未使用的缓存
    const now = Date.now();
    const maxIdleTime = 5 * 60 * 1000; // 5 分钟

    for (const [key, memory] of this.l1Cache.entries()) {
      const lastAccess = memory.lastAccessedAt
        ? new Date(memory.lastAccessedAt).getTime()
        : 0;
      if (now - lastAccess > maxIdleTime) {
        this.l1Cache.delete(key);
      }
    }

    logger.debug('L1 memories persisted and cache cleaned');
  }

  async searchMemories(
    agentFolder: string,
    query: string,
    limit: number = 10,
    userJid?: string,
    options?: MemoryQueryOptions,
  ): Promise<Memory[]> {
    const retrievalRollout = this.resolveRetrievalRollout(agentFolder, userJid);
    return searchMemories(
      agentFolder,
      query,
      limit,
      userJid,
      options,
      retrievalRollout,
      this.metricsTracker,
    );
  }

  async searchMemoriesDetailed(
    agentFolder: string,
    query: string,
    limit: number = 10,
    userJid?: string,
    options?: MemoryQueryOptions,
  ): Promise<MemorySearchHit[]> {
    const retrievalRollout = this.resolveRetrievalRollout(agentFolder, userJid);
    return searchMemoriesDetailed(
      agentFolder,
      query,
      limit,
      userJid,
      options,
      retrievalRollout,
      this.metricsTracker,
    );
  }

  /**
   * 删除记忆
   */
  async deleteMemory(id: string): Promise<void> {
    deleteMemory(id);
    this.invalidateCacheById(id);
    logger.info({ id }, 'Memory deleted');
  }

  /**
   * 清除指定的缓存条目
   * 当外部修改记忆时调用此方法以确保缓存一致性
   */
  invalidateCache(agentFolder: string, userJid?: string): void {
    const key = this.makeKey(agentFolder, userJid);
    this.l1Cache.delete(key);
    logger.debug({ agentFolder, userJid }, 'L1 cache invalidated');
  }

  /**
   * 清除所有缓存条目
   * 用于系统级操作后的完全刷新
   */
  invalidateAllCache(): void {
    this.l1Cache.clear();
    logger.debug('All L1 cache invalidated');
  }

  // ===== 私有方法 =====

  private makeKey(agentFolder: string, userJid?: string): string {
    return `${agentFolder}:${userJid || 'global'}`;
  }

  private generateMemoryId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(
      () => this.persistL1Memories(),
      5 * 60 * 1000,
    ); // 5 分钟
  }

  private invalidateCacheById(id: string): void {
    for (const [key, memory] of this.l1Cache.entries()) {
      if (memory.id === id) {
        this.l1Cache.delete(key);
        break;
      }
    }
  }

  private createDefaultReleaseControl(): MemoryReleaseControl {
    return {
      retrieval: {
        mode: 'stable',
        canaryEnabled: false,
        canaryPercentage: 0,
        vectorSearchMinScore: MEMORY_CONFIG.retrieval.vectorSearchMinScore,
        lowConfidenceThreshold: 0.4,
        rerankWeights: { ...MEMORY_CONFIG.retrieval.rerankWeights },
      },
      migration: {
        mode: 'stable',
        canaryEnabled: false,
        canaryPercentage: 0,
        canaryRules: {},
      },
      updatedAt: new Date().toISOString(),
    };
  }

  private mergeReleaseControl(
    current: MemoryReleaseControl,
    patch: UpdateReleaseControlInput,
  ): MemoryReleaseControl {
    const next: MemoryReleaseControl = {
      retrieval: {
        ...current.retrieval,
        ...(patch.retrieval || {}),
        rerankWeights: {
          ...current.retrieval.rerankWeights,
          ...(patch.retrieval?.rerankWeights || {}),
        },
      },
      migration: {
        ...current.migration,
        ...(patch.migration || {}),
        canaryRules: {
          ...current.migration.canaryRules,
          ...(patch.migration?.canaryRules || {}),
        },
      },
      updatedAt: new Date().toISOString(),
    };
    next.retrieval.canaryPercentage = this.clampPercentage(
      next.retrieval.canaryPercentage,
    );
    next.migration.canaryPercentage = this.clampPercentage(
      next.migration.canaryPercentage,
    );
    next.retrieval.lowConfidenceThreshold = clamp01(
      next.retrieval.lowConfidenceThreshold,
    );
    return next;
  }

  private clampPercentage(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private resolveRetrievalRollout(
    agentFolder: string,
    userJid?: string,
  ): RetrievalRolloutConfig {
    const retrieval = this.releaseControl.retrieval;
    const inCanary = this.isCanaryActive(
      retrieval.mode,
      retrieval.canaryEnabled,
      retrieval.canaryPercentage,
      `${agentFolder}:${userJid || 'global'}:retrieval`,
    );
    if (!inCanary) {
      return {
        ...retrieval,
        vectorSearchMinScore: MEMORY_CONFIG.retrieval.vectorSearchMinScore,
        rerankWeights: { ...MEMORY_CONFIG.retrieval.rerankWeights },
      };
    }
    return retrieval;
  }

  private resolveMigrationRules(
    agentFolder: string,
    userJid?: string,
  ): MigrationRuleConfig {
    const base: MigrationRuleConfig = {
      l1ToL2MinAccessCount: MEMORY_CONFIG.migration.l1ToL2MinAccessCount,
      l1ToL2MinIdleDays: MEMORY_CONFIG.migration.l1ToL2MinIdleDays,
      l2ToL3MinIdleDays: MEMORY_CONFIG.migration.l2ToL3MinIdleDays,
      l2ToL3MinImportance: MEMORY_CONFIG.migration.l2ToL3MinImportance,
      migratedContentPrefix: MEMORY_CONFIG.migration.migratedContentPrefix,
    };
    const migration = this.releaseControl.migration;
    const inCanary = this.isCanaryActive(
      migration.mode,
      migration.canaryEnabled,
      migration.canaryPercentage,
      `${agentFolder}:${userJid || 'global'}:migration`,
    );
    if (!inCanary) {
      return base;
    }
    return {
      ...base,
      ...migration.canaryRules,
    };
  }

  private isCanaryActive(
    mode: RolloutMode,
    canaryEnabled: boolean,
    canaryPercentage: number,
    bucketKey: string,
  ): boolean {
    if (mode === 'stable') {
      return false;
    }
    if (mode === 'canary') {
      return true;
    }
    if (!canaryEnabled || canaryPercentage <= 0) {
      return false;
    }
    return this.computeBucket(bucketKey) < canaryPercentage;
  }

  private computeBucket(seed: string): number {
    const digest = crypto.createHash('sha256').update(seed).digest('hex');
    const value = parseInt(digest.slice(0, 8), 16);
    return value % 100;
  }
}

// 单例导出
export const memoryManager = new MemoryManager();
